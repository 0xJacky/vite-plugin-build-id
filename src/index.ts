import type { Logger, Plugin, ResolvedConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
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
   * Specifies the environment variable for setting the build ID
   *
   * Useful for integrating CI/CD build numbers as the build ID.
   */
  buildIdEnv?: string
}

export interface AppVersion {
  version: string
  build_id: number
  total_build: number
}

const optionsWithDefaults = withDefaults<Options>()({
  prepare: false,
  destination: 'src',
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
  private packageVer: string

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
    this.projectJsonPath = this.resolvePath('package.json')
  }

  async init() {
    if (process.env.CI) {
      this.options.prepare = true
    }

    await this.resolveCurrentVersion()
  }

  private resolvePath(...filename: string[]) {
    return normalizePath(path.join(this.root, ...filename))
  }

  private importJson(path: string) {
    try {
      if (!fs.existsSync(path)) {
        this.logger.info(`File not found: ${path}, creating a new one`)
        return {}
      }

      return JSON.parse(
        fs.readFileSync(path, { encoding: 'utf8', flag: 'r' }),
      )
    }
    catch (err) {
      const errno = (err as NodeJS.ErrnoException | null | undefined)?.code
      if (errno === 'ENOENT') {
        this.logger.info(`File not found: ${path}, creating a new one`)
        return {}
      }

      throw err
    }
  }

  private async resolveCurrentVersion() {
    try {
      const r = this.importJson(this.rootVerPath)
      Object.assign(this.appVersion, {
        version: r.version || '',
        build_id: r.build_id || 0,
        total_build: r.total_build || 0,
      })
    }
    catch (err) {
      this.logger.warnOnce(`Error resolving version: ${err.message}`)
      // Initialize with default values
      Object.assign(this.appVersion, {
        version: '',
        build_id: 0,
        total_build: 0,
      })
    }

    this.packageVer = await this.getVersionInPackage()
  }

  private async getVersionInPackage() {
    const r = this.importJson(this.projectJsonPath)
    return r.version
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
  }

  bump() {
    const env = this.options.buildIdEnv ? process.env[this.options.buildIdEnv] : undefined
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
    fs.mkdirSync(path.dirname(versionPath), { recursive: true })
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
    writeBundle(options) {
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
