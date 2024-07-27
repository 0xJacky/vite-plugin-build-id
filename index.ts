import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import {normalizePath, UserConfig} from 'vite'
import type {OutputOptions} from 'rollup'
import git from 'isomorphic-git'

export interface Options {
  destination?: string
  enableCommitHash?: boolean
}

export interface AppVersion {
  version: string
  build_id: number,
  total_build: number,
  commit_hash?: string
}

const optionsWithDefaults = withDefaults<Options>()({
  destination: 'src',
  enableCommitHash: false,
} as Partial<Options>)

function withDefaults<T>() {
  return function <TDefaults extends Partial<T>>(defs: TDefaults) {
    return function (p: Pick<T, Exclude<keyof T, keyof TDefaults>> & Partial<TDefaults>): T {
      let result: any = p;
      for (let k of Object.keys(defs)) {
        result[k] = result[k] || defs[k];
      }
      return result;
    }
  }
}

class VitePluginBuildId {
  public root: string
  private options: Options
  private readonly project_json_path: string
  private readonly root_ver_path: string
  private commit_hash: string
  private package_ver: string
  public app_version: AppVersion = {
    version: '',
    build_id: 0,
    total_build: 0
  }

  constructor(root: string, options: Options) {
    this.root = root
    this.options = options
    this.root_ver_path = this.resolve_path(options.destination, 'version.json')
    this.project_json_path = this.resolve_path('package.json')
  }

  async init() {
    if (this.options.enableCommitHash) {
      try {
        this.commit_hash = await this.get_commit_hash()
      } catch (err) {
        console.warn('git commit hash not found', err)
      }
    }
    await this.resolve_current_version()
  }

  resolve_path(...filename: string[]) {
    return normalizePath(path.join(this.root, ...filename))
  }

  import_json(path: string) {
    return JSON.parse(
      fs.readFileSync(
        new URL(url.pathToFileURL(path), import.meta.url), {encoding: 'utf8', flag: 'r'}
      )
    )
  }

  async resolve_current_version() {
    try {
      let r = this.import_json(this.root_ver_path)
      Object.assign(this.app_version, {
        version: r.version,
        build_id: r.build_id,
        total_build: r.total_build
      })
    } catch (err) {
      console.log(err)
    }

    this.package_ver = await this.get_version_in_package()
  }

  async get_version_in_package() {
    let r = this.import_json(this.project_json_path)
    const v = r.version
    console.info('Package Version: ' + v)

    return v
  }

  async get_commit_hash() {
    const git_path = await git.findRoot({fs, filepath: path.resolve(this.resolve_path())})
    return await git.resolveRef({fs, dir: git_path, ref: 'HEAD'})
  }

  next_build_id() {
    if (this.app_version['version'] !== this.package_ver) {
      return 1
    }
    return this.app_version.build_id + 1
  }

  bump() {
    this.app_version.version = this.package_ver
    this.app_version.build_id = this.next_build_id()
    this.app_version.total_build = this.app_version.total_build + 1
  }

  build_version_json(dir: string | undefined = undefined) {
    console.info('Build Version: ' + this.app_version.version + '-' + this.app_version.build_id +
      ' (' + this.app_version.total_build + ')')
    if (this.options.enableCommitHash) {
      this.app_version.commit_hash = this.commit_hash
      console.info('Commit Hash: ' + this.commit_hash)
    }
    const content = JSON.stringify(this.app_version)

    const relative_path = dir ?
        path.isAbsolute(dir) ? path.relative(this.root, dir): dir
        : undefined
    const version_path = relative_path ? this.resolve_path(relative_path, 'version.json') : this.root_ver_path
    console.info('Saved version.json to ' + (relative_path ?? this.options.destination))
    fs.writeFileSync(version_path, content, {encoding: 'utf-8', flag: 'w'})
  }
}

// noinspection JSUnusedGlobalSymbols
export default function vitePluginBuildId(options: Options = {}) {
  let v: VitePluginBuildId
  return {
    name: 'vite-plugin-build-id',
    config(_config: UserConfig, {command}) {
      // resolve root
      const resolvedRoot = normalizePath(
        _config?.root ? path.resolve(_config.root) : process.cwd()
      )
      v = new VitePluginBuildId(resolvedRoot, optionsWithDefaults(options))
      v.init().then(async () => {
        v.bump()

        if (command != 'build') {
          v.app_version.build_id = 0
          v.app_version.total_build = 0
          return
        }

        v.build_version_json()
      })
    },
    writeBundle(options: OutputOptions) {
      v.build_version_json(options.dir)
    }
  }
}
