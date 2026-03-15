import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// This repo uses node's built-in test runner for now.
// eslint-disable-next-line test/no-import-node-test
import test from 'node:test'

import vitePluginBuildId from '../.tmp-test-dist/index.js'

function createLogger(logs = []) {
  return {
    info: msg => logs.push(String(msg)),
    warnOnce: msg => logs.push(String(msg)),
    warn: msg => logs.push(String(msg)),
    error: msg => logs.push(String(msg)),
  }
}

async function runBuild(tmpRoot, pluginOptions = {}) {
  const plugin = vitePluginBuildId(pluginOptions)
  await plugin.configResolved?.({
    root: tmpRoot,
    logger: createLogger(),
    command: 'build',
  })
  plugin.writeBundle?.({
    dir: path.join(tmpRoot, 'dist'),
  })
}

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

    const plugin = vitePluginBuildId()
    await assert.doesNotReject(async () => {
      await plugin.configResolved?.({
        root: tmpRoot,
        logger: createLogger(),
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

test('build: should increment build_id without a git repository', async () => {
  const oldCI = process.env.CI
  try {
    delete process.env.CI

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plugin-build-id-'))
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, 'package.json'),
      JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'utf8',
    )

    await runBuild(tmpRoot)
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(tmpRoot, 'src', 'version.json'), 'utf8')),
      {
        version: '1.0.0',
        build_id: 1,
        total_build: 1,
      },
    )

    await runBuild(tmpRoot)
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(tmpRoot, 'src', 'version.json'), 'utf8')),
      {
        version: '1.0.0',
        build_id: 2,
        total_build: 2,
      },
    )
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(tmpRoot, 'dist', 'version.json'), 'utf8')),
      {
        version: '1.0.0',
        build_id: 2,
        total_build: 2,
      },
    )
  }
  finally {
    if (oldCI === undefined)
      delete process.env.CI
    else
      process.env.CI = oldCI
  }
})
