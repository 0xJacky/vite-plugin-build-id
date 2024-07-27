import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { normalizePath } from 'vite';
class VitePluginBuildId {
    root;
    destination;
    project_json_path;
    root_ver_path;
    package_ver;
    app_version = {
        version: '',
        build_id: 0,
        total_build: 0
    };
    constructor(root, destination) {
        this.root = root;
        this.destination = destination;
        this.root_ver_path = this.resolve_path(this.destination, 'version.json');
        this.project_json_path = this.resolve_path('package.json');
    }
    resolve_path(...filename) {
        return normalizePath(path.join(this.root, ...filename));
    }
    import_json(path) {
        return JSON.parse(fs.readFileSync(new URL(url.pathToFileURL(path), import.meta.url), { encoding: 'utf8', flag: 'r' }));
    }
    async resolve_current_version() {
        try {
            let r = this.import_json(this.root_ver_path);
            Object.assign(this.app_version, {
                version: r.version,
                build_id: r.build_id,
                total_build: r.total_build
            });
        }
        catch (err) {
            console.log(err);
        }
        this.package_ver = await this.get_version_in_package();
    }
    async get_version_in_package() {
        let r = this.import_json(this.project_json_path);
        const v = r.version;
        console.info('Package Version: ' + v);
        return v;
    }
    next_build_id() {
        if (this.app_version['version'] !== this.package_ver) {
            return 1;
        }
        return this.app_version.build_id + 1;
    }
    bump() {
        this.app_version.version = this.package_ver;
        this.app_version.build_id = this.next_build_id();
        this.app_version.total_build = this.app_version.total_build + 1;
    }
    build_version_json(dir = undefined) {
        const content = JSON.stringify(this.app_version);
        console.info('Build Version: ' + this.app_version.version + '-' + this.app_version.build_id +
            ' (' + this.app_version.total_build + ')');
        const relative_path = dir ?
            path.isAbsolute(dir) ? path.relative(this.root, dir) : dir
            : undefined;
        const version_path = relative_path ? this.resolve_path(relative_path, 'version.json') : this.root_ver_path;
        console.info('Saved version.json to ' + (relative_path ?? this.destination));
        fs.writeFileSync(version_path, content, { encoding: 'utf-8', flag: 'w' });
    }
}
// noinspection JSUnusedGlobalSymbols
export default function vitePluginBuildId(destination = 'src') {
    let v;
    return {
        name: 'vite-plugin-build-id',
        config(_config, { command }) {
            // resolve root
            const resolvedRoot = normalizePath(_config?.root ? path.resolve(_config.root) : process.cwd());
            v = new VitePluginBuildId(resolvedRoot, destination);
            v.resolve_current_version().then(async () => {
                v.bump();
                if (command != 'build') {
                    v.app_version.build_id = 0;
                    v.app_version.total_build = 0;
                    return;
                }
                v.build_version_json();
            });
        },
        writeBundle(options) {
            v.build_version_json(options.dir);
        }
    };
}
//# sourceMappingURL=index.js.map