import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// This repo uses node's built-in test runner for now.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import vitePluginBuildId from '../.tmp-test-dist/index.js'

test('first run: should not throw when version.json is missing', async () => {
  const oldCI = process.env.CI
  try {
    // Ensure CI does not force prepare=true which would change behavior.
    delete process.env.CI

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-build-id-'))
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'utf8',
    )

    const logs = []
    const logger = {
      info: msg => logs.push(String(msg)),
      warnOnce: msg => logs.push(String(msg)),
      warn: msg => logs.push(String(msg)),
      error: msg => logs.push(String(msg)),
    }

    const plugin = vitePluginBuildId()
    await assert.doesNotReject(async () => {
      await plugin.configResolved?.({
        root: tmpRoot,
        logger,
        command: 'build',
      })
    })

    // The only contract here is "no throw"; avoid asserting on logs to keep the test stable.
  }
  finally {
    if (oldCI === undefined)
      delete process.env.CI
    else
      process.env.CI = oldCI
  }
})
