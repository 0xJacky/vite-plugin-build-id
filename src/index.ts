import type { NormalizedOutputOptions } from 'rollup'
import type { Logger, Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import url from 'node:url'
import git from 'isomorphic-git'
import { hasher } from 'node-object-hash'
import colors from 'picocolors'
import { normalizePath } from 'vite'

export interface Options {
  /**
   * Prepares the version file before the Vite build process
   *
   * Default: `false`
   * Useful for special cases where the version file needs to be available before the build.
   */
  prepare?: boolean

  /**
   * Specifies the destination folder
   *
   * Default is `src`
   */
  destination?: string

  /**
   * Enables inclusion of the latest git commit hash
   *
   * Default is `false`
   * Compare git's commit hash with the last time it was generated to avoid unwanted build id bump.
   */
  enableCommitHash?: boolean

  /**
   * Disables build ID increment when no changes are detected in the git workspace
   *
   * Default is `true`
   * Prevents `build_id` from incrementing if the current workspace status is unchanged.
   */
  disableBumpSameStatus?: boolean

  /**
   * Specifies the environment variable for setting the build ID
   *
   * Default is `true`
   * Useful for integrating CI/CD build numbers as the build ID.
   */
  buildIdEnv?: string
}

export interface AppVersion {
  version: string
  build_id: number
  total_build: number
  commit_hash?: string
}

export interface StatusHash {
  previous?: string
  current?: string
}

const optionsWithDefaults = withDefaults<Options>()({
  prepare: false,
  destination: 'src',
  enableCommitHash: false,
  disableBumpSameStatus: true,
} as Partial<Options>)

function withDefaults<T>() {
  return function <TDefaults extends Partial<T>>(defs: TDefaults) {
    return function (p: Pick<T, Exclude<keyof T, keyof TDefaults>> & Partial<TDefaults>): T {
      const result: any = p
      for (const k of Object.keys(defs)) {
        result[k] = result[k] ?? defs[k]
      }
      return result
    }
  }
}

class VitePluginBuildId {
  public root: string
  private readonly options: Options
  private readonly logger: Logger
  private readonly projectJsonPath: string
  private readonly rootVerPath: string
  private readonly hashPath: string
  private gitPath: string
  private packageVer: string

  private commitHash: string
  private statusHash: StatusHash = {}
  public appVersion: AppVersion = {
    version: '',
    build_id: 0,
    total_build: 0,
  }

  constructor(root: string, options: Options, logger: Logger) {
    this.root = root
    this.options = options
    this.logger = logger
    this.rootVerPath = this.resolvePath(options.destination, 'version.json')
    this.hashPath = this.resolvePath('.status_hash')
    this.projectJsonPath = this.resolvePath('package.json')
  }

  async init() {
    if (this.options.enableCommitHash || this.options.disableBumpSameStatus) {
      try {
        this.gitPath = await git.findRoot({ fs, filepath: path.resolve(this.resolvePath()) })
      }
      catch {
        this.logger.warnOnce('git info not found, some functions may not work')
      }
    }

    if (this.options.enableCommitHash && this.gitPath) {
      this.commitHash = await this.getCommitHash()
    }

    if (this.options.disableBumpSameStatus && this.gitPath) {
      this.statusHash.previous = fs.existsSync(this.hashPath)
        ? fs.readFileSync(this.hashPath, { encoding: 'utf-8' })
        : undefined
      this.statusHash.current = await this.getStatusHash()
    }

    if (process.env.CI) {
      this.options.prepare = true
    }

    await this.resolveCurrentVersion()
  }

  private resolvePath(...filename: string[]) {
    return normalizePath(path.join(this.root, ...filename))
  }

  private importJson(path: string) {
    return JSON.parse(
      fs.readFileSync(
        new URL(url.pathToFileURL(path), import.meta.url),
        { encoding: 'utf8', flag: 'r' },
      ),
    )
  }

  private async resolveCurrentVersion() {
    try {
      const r = this.importJson(this.rootVerPath)
      Object.assign(this.appVersion, {
        version: r.version,
        build_id: r.build_id,
        total_build: r.total_build,
      })
    }
    catch (err) {
      this.logger.warnOnce(err)
    }

    this.packageVer = await this.getVersionInPackage()
  }

  private async getVersionInPackage() {
    const r = this.importJson(this.projectJsonPath)
    return r.version
  }

  private async getCommitHash() {
    return await git.resolveRef({ fs, dir: this.gitPath, ref: 'HEAD' })
  }

  private async getStatusHash() {
    const hashSortCoerce = hasher()
    const rootVerGitRelativePath = path.relative(this.gitPath, path.resolve(this.rootVerPath))
      .replaceAll(path.sep, path.posix.sep)
    const statusHashGitRelativePath = path.relative(this.gitPath, path.resolve(this.hashPath))
      .replaceAll(path.sep, path.posix.sep)
    const status = (await git.statusMatrix({ fs, dir: this.gitPath }))
      .filter(row =>
        row[1] !== row[2]
        && row[2] !== 0
        && row[3] !== 0
        && row[0] !== rootVerGitRelativePath
        && row[0] !== statusHashGitRelativePath)
      .map(row => [row[0], fs.statSync(path.join(this.gitPath, row[0])).mtime])

    return status.length === 0 ? undefined : hashSortCoerce.hash(status)
  }

  private saveStatusHash() {
    if (this.options.disableBumpSameStatus) {
      if (this.gitPath) {
        if (this.statusHash.current === undefined) {
          try {
            fs.unlinkSync(this.hashPath)
          }
          catch (err) {
            if (err.code !== 'ENOENT')
              throw err
          }

          this.logger.info(`Status Hash: ${colors.green('NO MODIFIED FILE')}`)
          return
        }

        fs.writeFileSync(this.hashPath, this.statusHash.current, { encoding: 'utf-8', flag: 'w' })
        this.logger.info(`Status Hash: ${this.statusHash.current}`)
      }
      else {
        this.logger.info('Status Hash Not Work')
      }
    }
  }

  private sameStatusHash() {
    return this.statusHash.current === this.statusHash.previous
  }

  private nextBuildId() {
    if (this.appVersion.version !== this.packageVer) {
      return 1
    }
    return this.appVersion.build_id + 1
  }

  private buildVersion() {
    this.logger.info(`Package Version: ${colors.cyan(this.packageVer)}`)

    this.logger.info(`Build Version: ${colors.green(`${this.appVersion.version}-${this.appVersion.build_id
    } (${this.appVersion.total_build})`)}`)
    if (this.options.enableCommitHash) {
      this.appVersion.commit_hash = this.commitHash
      this.logger.info(`Commit Hash: ${colors.green(this.commitHash)}`)
    }

    this.saveStatusHash()
  }

  bump() {
    const env = this.options.buildIdEnv ? process.env[this.options.buildIdEnv] : undefined
    if (this.options.disableBumpSameStatus && env === undefined && this.sameStatusHash()) {
      this.logger.info('Same file status, skip bump.')
      return
    }

    this.appVersion.build_id = env ? Number.parseInt(env) : this.nextBuildId()
    this.appVersion.version = this.packageVer
    this.appVersion.total_build = this.appVersion.total_build + 1
    this.buildVersion()
  }

  buildVersionJson(dir: string | undefined = undefined) {
    const content = JSON.stringify(this.appVersion)

    const relativePath = dir
      ? path.isAbsolute(dir) ? path.relative(this.root, dir) : dir
      : undefined
    const versionPath = relativePath ? this.resolvePath(relativePath, 'version.json') : this.rootVerPath
    this.logger.info(`Saved version.json to ${colors.cyan(relativePath ?? this.options.destination)}`)
    fs.writeFileSync(versionPath, content, { encoding: 'utf-8', flag: 'w' })
  }
}

// noinspection JSUnusedGlobalSymbols
export default function vitePluginBuildId(options: Options = {}): Plugin {
  let __v: VitePluginBuildId

  const pluginOptions = optionsWithDefaults(options)
  return {
    name: 'vite-plugin-build-id',
    async configResolved(config: ResolvedConfig) {
      const { logger } = config

      __v = new VitePluginBuildId(config.root, pluginOptions, logger)
      await __v.init()

      // bump version for prepare
      if (pluginOptions.prepare && config.command === 'build') {
        __v.bump()
        __v.buildVersionJson()
      }
    },
    writeBundle(options: NormalizedOutputOptions) {
      // bump version and build json to project root directory
      if (!pluginOptions.prepare) {
        __v.bump()
        __v.buildVersionJson()
      }

      // build json to distribute directory
      __v.buildVersionJson(options.dir)
    },
  }
}
