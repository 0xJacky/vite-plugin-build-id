"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const path = require('path');
const fs = require('fs');
const verPath = 'version.json';
let _args = [{ dest: 'dist' }];
let json = {};
try {
    fs.accessSync(verPath, fs.constants.F_OK | fs.constants.R_OK);
    json = JSON.parse(fs.readFileSync(verPath).toString());
}
catch (err) {
    console.log(err);
}
const version = get_version_in_package();
let total_build = current_total_build();
let build_id = current_build_id();
// serve.fn = async (...args) => {
//     process.env['VUE_APP_VERSION'] = await version
//     return serveFn(...args)
// }
//
// build.fn = async (...args) => {
//     _args = args
//     process.env['VUE_APP_VERSION'] = await version
//     process.env['VUE_APP_BUILD_ID'] = await next_build_id()
//     process.env['VUE_APP_TOTAL_BUILD'] = await (total_build + 1)
//     await buildFn(...args)
//     if (!process.env.VUE_CLI_MODERN_BUILD) {
//         return inject()
//     }
// }
function get_version_in_package() {
    const path = 'package.json';
    let content = fs.readFileSync(path);
    content = JSON.parse(content.toString());
    console.info('Package Version: ' + content['version']);
    return content['version'];
}
function current_build_id() {
    if (!Number.isInteger(json['build_id'])) {
        return 0;
    }
    return json['build_id'];
}
function next_build_id() {
    if (json['version'] !== version) {
        return 1;
    }
    return build_id + 1;
}
function current_total_build() {
    if (!Number.isInteger(json['total_build'])) {
        return current_build_id();
    }
    return json['total_build'];
}
function get_dest() {
    var _a, _b;
    return (_b = (_a = _args[0]) === null || _a === void 0 ? void 0 : _a.dest) !== null && _b !== void 0 ? _b : 'dist';
}
function inject() {
    let lines = {
        version: version,
        build_id: next_build_id(),
        total_build: ++total_build
    };
    const content = JSON.stringify(lines);
    console.info('Build Version: ' + lines['version'] + '-' + lines['build_id'] +
        ' (' + lines['total_build'] + ')');
    console.info('Saving version.json');
    fs.writeFileSync(verPath, content, { encoding: 'utf-8' });
    console.info('Copying version.json to ' + get_dest());
    fs.copyFileSync(verPath, (0, vite_1.normalizePath)(path.join(get_dest(), 'version.json')));
    console.info('Done');
}
function vitePluginBuildId() {
    return {
        name: 'vite-plugin-build-id',
        buildStart(options) {
            console.log('buildStart', options);
        },
        buildEnd() {
            inject();
        }
    };
}
exports.default = vitePluginBuildId;
module.exports = vitePluginBuildId;
vitePluginBuildId['default'] = vitePluginBuildId;
//# sourceMappingURL=index.js.map