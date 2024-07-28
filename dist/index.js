import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { normalizePath } from 'vite';
import git from 'isomorphic-git';
import { hasher } from 'node-object-hash';
const optionsWithDefaults = withDefaults()({
    destination: 'src',
    enableCommitHash: false,
    disableBumpSameStatus: true,
});
function withDefaults() {
    return function (defs) {
        return function (p) {
            let result = p;
            for (let k of Object.keys(defs)) {
                result[k] = result[k] || defs[k];
            }
            return result;
        };
    };
}
class VitePluginBuildId {
    root;
    options;
    projectJsonPath;
    rootVerPath;
    gitPath;
    packageVer;
    commitHash;
    statusHash;
    appVersion = {
        version: '',
        build_id: 0,
        total_build: 0
    };
    constructor(root, options) {
        this.root = root;
        this.options = options;
        this.rootVerPath = this.resolvePath(options.destination, 'version.json');
        this.projectJsonPath = this.resolvePath('package.json');
    }
    async init() {
        if (this.options.enableCommitHash || this.options.disableBumpSameStatus) {
            try {
                this.gitPath = await git.findRoot({ fs, filepath: path.resolve(this.resolvePath()) });
            }
            catch (err) {
                console.warn('git info not found, some functions may not work');
            }
        }
        if (this.options.enableCommitHash && this.gitPath) {
            this.commitHash = await this.getCommitHash();
        }
        if (this.options.disableBumpSameStatus && this.gitPath) {
            this.statusHash = await this.getStatusHash();
        }
        await this.resolveCurrentVersion();
    }
    resolvePath(...filename) {
        return normalizePath(path.join(this.root, ...filename));
    }
    importJson(path) {
        return JSON.parse(fs.readFileSync(new URL(url.pathToFileURL(path), import.meta.url), { encoding: 'utf8', flag: 'r' }));
    }
    async resolveCurrentVersion() {
        try {
            let r = this.importJson(this.rootVerPath);
            Object.assign(this.appVersion, {
                version: r.version,
                build_id: r.build_id,
                total_build: r.total_build
            });
        }
        catch (err) {
            console.log(err);
        }
        this.packageVer = await this.getVersionInPackage();
    }
    async getVersionInPackage() {
        let r = this.importJson(this.projectJsonPath);
        const v = r.version;
        console.info('Package Version: ' + v);
        return v;
    }
    async getCommitHash() {
        return await git.resolveRef({ fs, dir: this.gitPath, ref: 'HEAD' });
    }
    async getStatusHash() {
        const hashSortCoerce = hasher();
        const rootVerGitRelativePath = path.relative(this.gitPath, path.resolve(this.rootVerPath))
            .replaceAll(path.sep, path.posix.sep);
        const status = (await git.statusMatrix({ fs, dir: this.gitPath }))
            .filter(row => row[1] !== row[2] && row[0] !== rootVerGitRelativePath)
            .map(row => [row[0], fs.statSync(path.join(this.gitPath, row[0])).mtime]);
        return hashSortCoerce.hash(status);
    }
    nextBuildId() {
        if (this.appVersion['version'] !== this.packageVer) {
            return 1;
        }
        return this.appVersion.build_id + 1;
    }
    bump() {
        if (this.options.disableBumpSameStatus && this.statusHash === this.appVersion.status_hash) {
            console.info('Same file status, skip bump.');
            return;
        }
        this.appVersion.version = this.packageVer;
        this.appVersion.build_id = this.nextBuildId();
        this.appVersion.total_build = this.appVersion.total_build + 1;
    }
    buildVersionJson(dir = undefined) {
        console.info('Build Version: ' + this.appVersion.version + '-' + this.appVersion.build_id +
            ' (' + this.appVersion.total_build + ')');
        if (this.options.enableCommitHash) {
            this.appVersion.commit_hash = this.commitHash;
            console.info('Commit Hash: ' + this.commitHash);
        }
        if (this.options.disableBumpSameStatus) {
            if (this.gitPath) {
                this.appVersion.status_hash = this.statusHash;
                console.info('Status Hash: ' + this.statusHash);
            }
            else {
                console.info('Status Hash Not Work');
            }
        }
        const content = JSON.stringify(this.appVersion);
        const relativePath = dir ?
            path.isAbsolute(dir) ? path.relative(this.root, dir) : dir
            : undefined;
        const versionPath = relativePath ? this.resolvePath(relativePath, 'version.json') : this.rootVerPath;
        console.info('Saved version.json to ' + (relativePath ?? this.options.destination));
        fs.writeFileSync(versionPath, content, { encoding: 'utf-8', flag: 'w' });
    }
}
// noinspection JSUnusedGlobalSymbols
export default async function vitePluginBuildId(options = {}) {
    let __v;
    return {
        name: 'vite-plugin-build-id',
        async config(_config, { command }) {
            // resolve root
            const resolvedRoot = normalizePath(_config?.root ? path.resolve(_config.root) : process.cwd());
            __v = new VitePluginBuildId(resolvedRoot, optionsWithDefaults(options));
            await __v.init();
            if (command === 'build') {
                __v.bump();
                __v.buildVersionJson();
            }
        },
        writeBundle(options) {
            __v.buildVersionJson(options.dir);
        }
    };
}
//# sourceMappingURL=index.js.map