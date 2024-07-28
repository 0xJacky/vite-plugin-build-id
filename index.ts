import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import {normalizePath, UserConfig} from 'vite'
import type {OutputOptions} from 'rollup'
import git from 'isomorphic-git'
import { hasher } from 'node-object-hash'

export interface Options {
  destination?: string
  enableCommitHash?: boolean
  disableBumpSameStatus?: boolean
}

export interface AppVersion {
  version: string
  build_id: number,
  total_build: number,
  commit_hash?: string,
  status_hash?: string
}

const optionsWithDefaults = withDefaults<Options>()({
  destination: 'src',
  enableCommitHash: false,
  disableBumpSameStatus: true,
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
  private readonly projectJsonPath: string
  private readonly rootVerPath: string
  private gitPath: string
  private packageVer: string

  private commitHash: string
  private statusHash: string
  public appVersion: AppVersion = {
    version: '',
    build_id: 0,
    total_build: 0
  }

  constructor(root: string, options: Options) {
    this.root = root
    this.options = options
    this.rootVerPath = this.resolvePath(options.destination, 'version.json')
    this.projectJsonPath = this.resolvePath('package.json')
  }

  async init() {
    if (this.options.enableCommitHash || this.options.disableBumpSameStatus) {
      try {
        this.gitPath = await git.findRoot({fs, filepath: path.resolve(this.resolvePath())})
      } catch (err) {
        console.warn('git info not found, some functions may not work')
      }
    }

    if (this.options.enableCommitHash && this.gitPath) {
      this.commitHash = await this.getCommitHash()
    }

    if (this.options.disableBumpSameStatus && this.gitPath) {
      this.statusHash = await this.getStatusHash()
    }

    await this.resolveCurrentVersion()
  }

  private resolvePath(...filename: string[]) {
    return normalizePath(path.join(this.root, ...filename))
  }

  private importJson(path: string) {
    return JSON.parse(
      fs.readFileSync(
        new URL(url.pathToFileURL(path), import.meta.url), {encoding: 'utf8', flag: 'r'}
      )
    )
  }

  private async resolveCurrentVersion() {
    try {
      let r = this.importJson(this.rootVerPath)
      Object.assign(this.appVersion, {
        version: r.version,
        build_id: r.build_id,
        total_build: r.total_build
      })
    } catch (err) {
      console.log(err)
    }

    this.packageVer = await this.getVersionInPackage()
  }

  private async getVersionInPackage() {
    let r = this.importJson(this.projectJsonPath)
    const v = r.version
    console.info('Package Version: ' + v)

    return v
  }

  private async getCommitHash() {
    return await git.resolveRef({fs, dir: this.gitPath, ref: 'HEAD'})
  }

  private async getStatusHash() {
    const hashSortCoerce = hasher()
    const rootVerGitRelativePath = path.relative(this.gitPath, path.resolve(this.rootVerPath))
        .replaceAll(path.sep, path.posix.sep)
    const status = (await git.statusMatrix({fs, dir: this.gitPath}))
        .filter(row => row[1] !== row[2] && row[0] !== rootVerGitRelativePath)
        .map(row => [row[0], fs.statSync(path.join(this.gitPath, row[0])).mtime])

    return hashSortCoerce.hash(status)
  }

  private nextBuildId() {
    if (this.appVersion['version'] !== this.packageVer) {
      return 1
    }
    return this.appVersion.build_id + 1
  }

  bump() {
    if (this.options.disableBumpSameStatus && this.statusHash === this.appVersion.status_hash) {
      console.info('Same file status, skip bump.')
      return
    }

    this.appVersion.version = this.packageVer
    this.appVersion.build_id = this.nextBuildId()
    this.appVersion.total_build = this.appVersion.total_build + 1
  }

  buildVersionJson(dir: string | undefined = undefined) {
    console.info('Build Version: ' + this.appVersion.version + '-' + this.appVersion.build_id +
      ' (' + this.appVersion.total_build + ')')
    if (this.options.enableCommitHash) {
      this.appVersion.commit_hash = this.commitHash
      console.info('Commit Hash: ' + this.commitHash)
    }

    if (this.options.disableBumpSameStatus) {
      if (this.gitPath) {
        this.appVersion.status_hash = this.statusHash
        console.info('Status Hash: ' + this.statusHash)
      } else {
        console.info('Status Hash Not Work')
      }
    }

    const content = JSON.stringify(this.appVersion)

    const relativePath = dir ?
        path.isAbsolute(dir) ? path.relative(this.root, dir): dir
        : undefined
    const versionPath = relativePath ? this.resolvePath(relativePath, 'version.json') : this.rootVerPath
    console.info('Saved version.json to ' + (relativePath ?? this.options.destination))
    fs.writeFileSync(versionPath, content, {encoding: 'utf-8', flag: 'w'})
  }
}

// noinspection JSUnusedGlobalSymbols
export default async function vitePluginBuildId(options: Options = {}) {
  let __v: VitePluginBuildId

  return {
    name: 'vite-plugin-build-id',
    async config(_config: UserConfig, {command}) {
      // resolve root
      const resolvedRoot = normalizePath(
        _config?.root ? path.resolve(_config.root) : process.cwd()
      )

      __v = new VitePluginBuildId(resolvedRoot, optionsWithDefaults(options))
      await __v.init()

      if (command === 'build') {
        __v.bump()
        __v.buildVersionJson()
      }
    },
    writeBundle(options: OutputOptions) {
      __v.buildVersionJson(options.dir)
    }
  }
}
