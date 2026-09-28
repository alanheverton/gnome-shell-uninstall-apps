import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function findAppImage(appInfo) {
    if (!appInfo)
        return null;

    const commandline = appInfo.get_commandline?.() ?? '';
    const executable = appInfo.get_executable?.() ?? '';
    let version = null;
    try {
        version = appInfo.get_string('X-AppImage-Version');
    } catch {
        version = null;
    }

    const isMarked = version !== null ||
        commandline.toLowerCase().includes('.appimage') ||
        executable.toLowerCase().includes('.appimage');

    if (!isMarked)
        return null;

    const home = GLib.get_home_dir();

    // Se o próprio executável for um AppImage na home
    if (executable && executable.startsWith(`${home}/`) && GLib.file_test(executable, GLib.FileTest.EXISTS)) {
        if (executable.toLowerCase().endsWith('.appimage') || version !== null)
            return executable;
    }

    let argv;
    try {
        [, argv] = GLib.shell_parse_argv(commandline);
    } catch {
        return null;
    }

    if (argv) {
        for (const argument of argv) {
            if (!GLib.path_is_absolute(argument) || !argument.startsWith(`${home}/`))
                continue;

            const file = Gio.File.new_for_path(argument);
            if (file.query_exists(null) && file.query_file_type(0, null) === Gio.FileType.REGULAR) {
                if (argument.toLowerCase().endsWith('.appimage') || version !== null)
                    return argument;
            }
        }
    }

    return null;
}
