import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {findAppImage} from './appImage.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

const directory = GLib.build_filenamev([
    GLib.get_user_cache_dir(), `uninstall-apps-test-${GLib.uuid_string_random()}`,
]);
assert(GLib.mkdir_with_parents(directory, 0o700) === 0, 'Falha ao criar diretório temporário');
const appImage = GLib.build_filenamev([directory, 'Example.AppImage']);
GLib.file_set_contents(appImage, 'test');

const appInfo = {
    get_commandline: () => `"${appImage}"`,
    get_executable: () => appImage,
    get_string: key => key === 'X-AppImage-Version' ? '1.0' : null,
};

assert(findAppImage(appInfo) === appImage, 'AppImage local não foi detectado');
assert(findAppImage(null) === null, 'Entrada vazia deveria retornar null');

Gio.File.new_for_path(appImage).delete(null);
Gio.File.new_for_path(directory).delete(null);
console.log('AppImage checks passed');
