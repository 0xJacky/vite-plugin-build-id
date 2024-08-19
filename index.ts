import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import {Logger, normalizePath, ResolvedConfig} from 'vite'
import type {OutputOptions} from 'rollup'
import git from 'isomorphic-git'
import {hasher} from 'node-object-hash'
import colors from 'picocolors'

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
        result[k] = result[k] ?? defs[k];
      }
      return result;
    }
  }
}

class VitePluginBuildId {
  public root: string
  private readonly options: Options
  private readonly logger: Logger
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

  constructor(root: string, options: Options, logger: Logger) {
    this.root = root
    this.options = options
    this.logger = logger
    this.rootVerPath = this.resolvePath(options.destination, 'version.json')
    this.projectJsonPath = this.resolvePath('package.json')
  }

  async init() {
    if (this.options.enableCommitHash || this.options.disableBumpSameStatus) {
      try {
        this.gitPath = await git.findRoot({fs, filepath: path.resolve(this.resolvePath())})
      } catch (err) {
        this.logger.warnOnce('git info not found, some functions may not work')
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
      this.logger.warnOnce(err)
    }

    this.packageVer = await this.getVersionInPackage()
  }

  private async getVersionInPackage() {
    let r = this.importJson(this.projectJsonPath)
    return r.version
  }

  private async getCommitHash() {
    return await git.resolveRef({fs, dir: this.gitPath, ref: 'HEAD'})
  }

  private async getStatusHash() {
    const hashSortCoerce = hasher()
    const rootVerGitRelativePath = path.relative(this.gitPath, path.resolve(this.rootVerPath))
        .replaceAll(path.sep, path.posix.sep)
    const status = (await git.statusMatrix({fs, dir: this.gitPath}))
        .filter(row =>
            row[1] !== row[2] &&
            row[2] !== 0 &&
            row[3] !== 0 &&
            row[0] !== rootVerGitRelativePath)
        .map(row => [row[0], fs.statSync(path.join(this.gitPath, row[0])).mtime])

    return hashSortCoerce.hash(status)
  }

  private nextBuildId() {
    if (this.appVersion['version'] !== this.packageVer) {
      return 1
    }
    return this.appVersion.build_id + 1
  }

  private buildVersion() {
    this.logger.info('Package Version: ' + colors.cyan(this.packageVer))

    this.logger.info('Build Version: ' + colors.green(this.appVersion.version + '-' + this.appVersion.build_id +
        ' (' + this.appVersion.total_build + ')'))
    if (this.options.enableCommitHash) {
      this.appVersion.commit_hash = this.commitHash
      this.logger.info('Commit Hash: ' + colors.green(this.commitHash))
    }

    if (this.options.disableBumpSameStatus) {
      if (this.gitPath) {
        this.appVersion.status_hash = this.statusHash
        this.logger.info('Status Hash: ' + this.statusHash)
      } else {
        this.logger.info('Status Hash Not Work')
      }
    }
  }

  bump() {
    if (this.options.disableBumpSameStatus && this.statusHash === this.appVersion.status_hash) {
      this.logger.info('Same file status, skip bump.')
      return
    }

    this.appVersion.version = this.packageVer
    this.appVersion.build_id = this.nextBuildId()
    this.appVersion.total_build = this.appVersion.total_build + 1
    this.buildVersion()
  }

  buildVersionJson(dir: string | undefined = undefined) {
    const content = JSON.stringify(this.appVersion)

    const relativePath = dir ?
        path.isAbsolute(dir) ? path.relative(this.root, dir): dir
        : undefined
    const versionPath = relativePath ? this.resolvePath(relativePath, 'version.json') : this.rootVerPath
    this.logger.info('Saved version.json to ' + colors.cyan(relativePath ?? this.options.destination))
    fs.writeFileSync(versionPath, content, {encoding: 'utf-8', flag: 'w'})
  }
}

// noinspection JSUnusedGlobalSymbols
export default async function vitePluginBuildId(options: Options = {}) {
  let __v: VitePluginBuildId

  return {
    name: 'vite-plugin-build-id',
    async configResolved(config: ResolvedConfig) {
      const { logger } = config

      __v = new VitePluginBuildId(config.root, optionsWithDefaults(options), logger)
      await __v.init()
    },
    writeBundle(options: OutputOptions) {
      // bump version and build json to project root directory
      __v.bump()
      __v.buildVersionJson()

      // build json to distribute directory
      __v.buildVersionJson(options.dir)
    }
  }
}
