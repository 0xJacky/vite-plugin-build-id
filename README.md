# vite-plugin-build-id

A Vite plugin that automatically generates a unique `build_id` each time the project is compiled.

Developed by [0xJacky](https://jackyu.cn/) and [Hintay](https://blog.kugeek.com/).

## Install

```bash
pnpm i -D vite-plugin-build-id
```

## Usage

In `vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import vitePluginBuildId from 'vite-plugin-build-id'

export default defineConfig({
  plugins: [vitePluginBuildId()]
})
```

This will create a `version.json` file in your `src` folder with the following structure:

```json
{
  "version": "{the-verion-in-package.json}",
  "build_id": 1,
  "total_build": 1
}
```

- **version**: Mirrors the version field from your `package.json`.
- **build_id**: Starts at `1` for each new version and increments with each build.
- **total_build**: Tracks the total number of builds since the plugin was first configured.

The plugin no longer depends on a git repository. By default, each build increments `build_id`, and each new package version resets it back to `1`.

### Tips

If you'd like to use a CI build number as the `build_id`, set the `buildIdEnv` option. For example, in a Drone CI environment:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vitePluginBuildId({
      buildIdEnv: 'DRONE_BUILD_NUMBER',
    }),
  ]
})
```

## Options

```ts
interface Options {
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
```
