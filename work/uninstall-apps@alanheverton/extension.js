import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as AppDisplay from 'resource:///org/gnome/shell/ui/appDisplay.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {findAppImage} from './appImage.js';

// Habilita suporte a async/await Promise para métodos GIO
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
Gio._promisify(Gio.File.prototype, 'trash_async', 'trash_finish');

function getFlatpakId(appInfo) {
    try {
        const id = appInfo?.get_string('X-Flatpak');
        if (id)
            return id.trim();
    } catch {}

    const desktopFile = appInfo?.get_filename() ?? '';
    if (desktopFile.includes('/flatpak/exports/share/applications/')) {
        const basename = GLib.path_get_basename(desktopFile);
        if (basename.endsWith('.desktop'))
            return basename.slice(0, -8);
    }
    return null;
}

async function getRpmPackageName(desktopFile) {
    if (!desktopFile || !GLib.file_test(desktopFile, GLib.FileTest.EXISTS))
        return null;

    if (!desktopFile.startsWith('/usr/') && !desktopFile.startsWith('/etc/') && !desktopFile.startsWith('/opt/'))
        return null;

    try {
        const proc = Gio.Subprocess.new(
            ['/usr/bin/rpm', '-qf', desktopFile, '--qf', '%{NAME}'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        const [stdout] = await proc.communicate_utf8_async(null, null);
        if (proc.get_successful()) {
            const pkg = stdout ? stdout.trim() : '';
            if (pkg && !pkg.includes(' ') && !pkg.includes('\n'))
                return pkg;
        }
    } catch (e) {
        logError(e, 'Erro ao verificar pacote RPM');
    }
    return null;
}

function resolveLocalAppFiles(appInfo) {
    const home = GLib.get_home_dir();
    const desktopFile = appInfo?.get_filename();
    const executable = appInfo?.get_executable();
    const isInHome = path => path?.startsWith(`${home}/`);

    const isUserDesktop = isInHome(desktopFile);
    const isUserExec = isInHome(executable);

    if (!isUserDesktop && !isUserExec)
        return [];

    const files = new Set();
    if (isUserDesktop && GLib.file_test(desktopFile, GLib.FileTest.EXISTS))
        files.add(desktopFile);

    if (isUserExec) {
        if (GLib.file_test(executable, GLib.FileTest.EXISTS))
            files.add(executable);

        try {
            if (GLib.file_test(executable, GLib.FileTest.IS_SYMLINK)) {
                const rawTarget = GLib.file_read_link(executable);
                let targetPath = rawTarget;
                if (!GLib.path_is_absolute(rawTarget)) {
                    const dir = GLib.path_get_dirname(executable);
                    targetPath = GLib.build_filenamev([dir, rawTarget]);
                }
                const canonical = GLib.canonicalize_filename(targetPath, null);
                if (isInHome(canonical) && GLib.file_test(canonical, GLib.FileTest.EXISTS))
                    files.add(canonical);
            }
        } catch (e) {
            logError(e, 'Erro ao resolver link simbólico do aplicativo');
        }
    }

    try {
        const iconName = appInfo?.get_string('Icon');
        if (iconName) {
            if (GLib.path_is_absolute(iconName) && iconName.startsWith(`${home}/`)) {
                if (GLib.file_test(iconName, GLib.FileTest.EXISTS))
                    files.add(iconName);
            } else {
                const userIcon = GLib.build_filenamev([
                    GLib.get_user_data_dir(), 'icons', 'hicolor', '512x512', 'apps', `${iconName}.png`,
                ]);
                if (GLib.file_test(userIcon, GLib.FileTest.EXISTS))
                    files.add(userIcon);
            }
        }
    } catch {}

    return Array.from(files);
}

async function runPackageCommand(argv, description) {
    const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    );
    const [, stderr] = await proc.communicate_utf8_async(null, null);
    if (!proc.get_successful())
        throw new Error(stderr?.trim() || `${description} terminou com código ${proc.get_exit_status()}`);
}

async function movePathToTrash(filePath) {
    const file = Gio.File.new_for_path(filePath);
    try {
        await file.trash_async(GLib.PRIORITY_DEFAULT, null);
    } catch (asyncErr) {
        try {
            file.trash(null);
        } catch (syncErr) {
            logError(syncErr, `Falha ao mover para a lixeira: ${filePath}`);
            throw syncErr;
        }
    }
}

function confirmUninstall(app, name, sourceDesc, detailsList = []) {
    return new Promise(resolve => {
        let settled = false;
        const settle = val => {
            if (!settled) {
                settled = true;
                resolve(val);
            }
        };

        const dialog = new ModalDialog.ModalDialog();

        const contentBox = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 12px; padding: 16px;',
        });

        const headerRow = new St.BoxLayout({
            vertical: false,
            style: 'spacing: 16px; align-items: center;',
        });

        let iconActor = null;
        try {
            if (app?.create_icon_texture)
                iconActor = app.create_icon_texture(64);
        } catch {
            iconActor = null;
        }

        if (!iconActor) {
            const gicon = app?.get_app_info?.()?.get_icon() ?? app?.app_info?.get_icon();
            if (gicon)
                iconActor = new St.Icon({gicon, icon_size: 64});
            else
                iconActor = new St.Icon({icon_name: 'application-x-executable', icon_size: 64});
        }

        headerRow.add_child(iconActor);

        const textCol = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const titleLabel = new St.Label({
            text: `Desinstalar “${name}”?`,
            style: 'font-weight: bold; font-size: 13pt;',
        });
        const typeLabel = new St.Label({
            text: `Origem: ${sourceDesc}`,
            style: 'opacity: 0.8; font-size: 10pt; padding-top: 4px;',
        });
        textCol.add_child(titleLabel);
        textCol.add_child(typeLabel);
        headerRow.add_child(textCol);

        contentBox.add_child(headerRow);

        if (detailsList && detailsList.length > 0) {
            const detailsLabel = new St.Label({
                text: 'Os seguintes arquivos serão movidos para a lixeira:\n• ' + detailsList.join('\n• '),
                style: 'opacity: 0.75; font-size: 9pt; padding-top: 8px;',
            });
            contentBox.add_child(detailsLabel);
        }

        dialog.contentLayout.add_child(contentBox);

        dialog.setButtons([
            {
                label: 'Cancelar',
                key: Clutter.KEY_Escape,
                action: () => {
                    dialog.close();
                    settle(false);
                },
            },
            {
                label: 'Desinstalar',
                default: true,
                action: () => {
                    dialog.close();
                    settle(true);
                },
            },
        ]);

        dialog.connect('closed', () => settle(false));
        dialog.open();
    });
}

async function onUninstallClicked(menu) {
    const app = menu._app ?? menu.sourceActor?.app;
    if (!app) {
        Main.notifyError('Erro', 'Aplicativo não encontrado no menu');
        return;
    }

    const appInfo = app.get_app_info?.() ?? app.app_info ?? app.appInfo;
    const name = app.get_name();

    if (!appInfo) {
        Main.notifyError('Não foi possível identificar o aplicativo', name);
        return;
    }

    // 1. AppImage com ação "Uninstall" no próprio .desktop
    const actions = appInfo.list_actions ? appInfo.list_actions() : [];
    const uninstallAction = actions.find(a => a.toLowerCase() === 'uninstall');
    if (uninstallAction) {
        const confirmed = await confirmUninstall(app, name, 'AppImage (desinstalador integrado)');
        if (!confirmed)
            return;
        app.launch_action(uninstallAction, global.get_current_time(), -1);
        Main.overview.showApps();
        return;
    }

    // 2. Flatpak
    const flatpakId = getFlatpakId(appInfo);
    if (flatpakId) {
        const confirmed = await confirmUninstall(app, name, `Flatpak (${flatpakId})`);
        if (!confirmed)
            return;
        try {
            await runPackageCommand(
                ['flatpak', 'uninstall', '--noninteractive', flatpakId],
                'flatpak uninstall'
            );
            Main.overview.showApps();
            Main.notify('Aplicativo removido', name);
        } catch (e) {
            logError(e, 'Erro ao desinstalar Flatpak');
            Main.notifyError('Falha ao desinstalar Flatpak', e?.message ?? String(e));
        }
        return;
    }

    // 3. RPM
    const desktopFile = appInfo.get_filename();
    const rpmPackage = await getRpmPackageName(desktopFile);
    if (rpmPackage) {
        const confirmed = await confirmUninstall(app, name, `RPM (${rpmPackage})`);
        if (!confirmed)
            return;
        try {
            await runPackageCommand(
                ['pkcon', 'remove', '--noninteractive', rpmPackage],
                'pkcon remove'
            );
            Main.overview.showApps();
            Main.notify('Aplicativo removido', name);
        } catch (e) {
            logError(e, 'Erro ao remover pacote RPM com pkcon');
            Main.notifyError('Falha ao desinstalar RPM', e?.message ?? String(e));
        }
        return;
    }

    // 4. AppImage autônomo
    const appImagePath = findAppImage(appInfo);
    if (appImagePath) {
        const filesToTrash = [appImagePath];
        if (desktopFile && desktopFile.startsWith(`${GLib.get_home_dir()}/`))
            filesToTrash.push(desktopFile);

        const confirmed = await confirmUninstall(app, name, 'AppImage', filesToTrash);
        if (!confirmed)
            return;

        let anyError = false;
        for (const filePath of filesToTrash) {
            try {
                await movePathToTrash(filePath);
            } catch (err) {
                anyError = true;
                logError(err, `Falha ao mover para a lixeira: ${filePath}`);
            }
        }
        Main.overview.showApps();
        if (!anyError)
            Main.notify('Aplicativo removido', name);
        else
            Main.notifyError('Aviso', `Alguns arquivos do AppImage “${name}” não puderam ser movidos.`);
        return;
    }

    // 5. Aplicativo local (ex: GymFlow com links simbólicos)
    const localFiles = resolveLocalAppFiles(appInfo);
    if (localFiles.length > 0) {
        const confirmed = await confirmUninstall(app, name, 'Aplicativo local', localFiles);
        if (!confirmed)
            return;

        let anyError = false;
        for (const filePath of localFiles) {
            try {
                await movePathToTrash(filePath);
            } catch (err) {
                anyError = true;
                logError(err, `Falha ao mover para a lixeira: ${filePath}`);
            }
        }
        Main.overview.showApps();
        if (!anyError)
            Main.notify('Aplicativo removido', name);
        else
            Main.notifyError('Aviso', `Alguns arquivos de “${name}” não puderam ser movidos para a lixeira.`);
        return;
    }

    Main.notifyError('Origem não suportada', `Não foi possível identificar o método de desinstalação para “${name}”.`);
}

function updateUninstallItemVisibility(menu) {
    if (!menu._uninstallAppsItem)
        return;
    const app = menu._app ?? menu.sourceActor?.app;
    menu._uninstallAppsItem.visible = app !== null && app !== undefined;
}

function addUninstallAction(menu, items) {
    if (!menu || menu._uninstallAppsItem)
        return;

    const menuItem = new PopupMenu.PopupMenuItem('Desinstalar');

    const menuItems = menu._getMenuItems();
    const detailsIndex = menuItems.indexOf(menu._detailsItem);
    if (detailsIndex !== -1) {
        menu.addMenuItem(menuItem, detailsIndex + 1);
    } else {
        const quitIndex = menuItems.indexOf(menu._quitItem);
        if (quitIndex !== -1)
            menu.addMenuItem(menuItem, quitIndex);
        else
            menu.addMenuItem(menuItem);
    }

    menu._uninstallAppsItem = menuItem;
    items.add(menuItem);

    menuItem.connectObject('destroy', () => {
        items.delete(menuItem);
        if (menu._uninstallAppsItem === menuItem)
            delete menu._uninstallAppsItem;
    }, menu);

    menuItem.connect('activate', () => {
        (async () => {
            try {
                await onUninstallClicked(menu);
            } catch (err) {
                logError(err, 'Falha ao processar desinstalação');
                Main.notifyError('Falha ao desinstalar', err?.message ?? String(err));
            }
        })().catch(err => {
            logError(err, 'Erro não capturado na desinstalação');
        });
    });

    updateUninstallItemVisibility(menu);
}

export default class UninstallAppsExtension extends Extension {
    enable() {
        this._items = new Set();
        this._injectionManager = new InjectionManager();
        const items = this._items;

        this._injectionManager.overrideMethod(
            AppMenu.AppMenu.prototype,
            'setApp',
            originalMethod => function (app) {
                originalMethod.call(this, app);
                addUninstallAction(this, items);
                updateUninstallItemVisibility(this);
            }
        );

        this._injectionManager.overrideMethod(
            AppDisplay.AppIcon.prototype,
            'popupMenu',
            originalMethod => function (...args) {
                if (this._menu) {
                    addUninstallAction(this._menu, items);
                    updateUninstallItemVisibility(this._menu);
                }
                const result = originalMethod.apply(this, args);
                if (this._menu) {
                    addUninstallAction(this._menu, items);
                    updateUninstallItemVisibility(this._menu);
                }
                return result;
            }
        );
    }

    disable() {
        this._injectionManager?.clear();
        this._injectionManager = null;

        if (this._items) {
            for (const item of this._items) {
                try {
                    item.destroy();
                } catch {}
            }
            this._items.clear();
            this._items = null;
        }
    }
}
