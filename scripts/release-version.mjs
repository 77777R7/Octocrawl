#!/usr/bin/env node
// The version of what W2L publishes, kept in one place per package but checked
// together: the CLI (`octocrawl`, `@octocrawl/cli`), `@octocrawl/mcp`,
// `@octocrawl/sdk` and the Python client `octocrawl-client` are released as one
// version. A release tag `vX.Y.Z` publishes only when every place says X.Y.Z.
//
// Usage: node scripts/release-version.mjs check [X.Y.Z]   (no version: every place agrees)
//        node scripts/release-version.mjs set X.Y.Z       (writes every place, then the lockfile)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Each place a published version is written: its file, how to read it, how to write it. */
const PLACES = [
  ...['cli', 'mcp', 'sdk'].map((dir) => jsonVersion(`packages/${dir}/package.json`)),
  serverJsonVersion('server.json'),
  textVersion('packages/cli/src/run.ts', /export const CLI_VERSION = '([^']+)'/, (v) => `export const CLI_VERSION = '${v}'`),
  textVersion('packages/mcp/src/server.ts', /const MCP_VERSION = '([^']+)'/, (v) => `const MCP_VERSION = '${v}'`),
  textVersion('packages/sdk/src/version.ts', /export const SDK_VERSION = '([^']+)'/, (v) => `export const SDK_VERSION = '${v}'`),
  textVersion('python/pyproject.toml', /^version = "([^"]+)"$/m, (v) => `version = "${v}"`),
  textVersion('python/src/octocrawl_client/_version.py', /^__version__ = "([^"]+)"$/m, (v) => `__version__ = "${v}"`),
]

/** The MCP Registry entry: its own version and the npm package's, which must equal the packages' version. */
function serverJsonVersion(file) {
  return {
    file,
    read: () => {
      const doc = JSON.parse(readFileSync(join(root, file), 'utf8'))
      const versions = new Set([doc.version, ...doc.packages.map((p) => p.version)])
      return versions.size === 1 ? doc.version : `${doc.version} (packages: ${doc.packages.map((p) => p.version).join(', ')})`
    },
    write: (version) => {
      const doc = JSON.parse(readFileSync(join(root, file), 'utf8'))
      doc.version = version
      for (const p of doc.packages) p.version = version
      writeFileSync(join(root, file), `${JSON.stringify(doc, null, 2)}\n`)
    },
  }
}

function jsonVersion(file) {
  return {
    file,
    read: () => JSON.parse(readFileSync(join(root, file), 'utf8')).version,
    write: (version) => {
      const text = readFileSync(join(root, file), 'utf8')
      writeFileSync(join(root, file), text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
    },
  }
}

function textVersion(file, pattern, line) {
  return {
    file,
    read: () => pattern.exec(readFileSync(join(root, file), 'utf8'))?.[1] ?? null,
    write: (version) => {
      const text = readFileSync(join(root, file), 'utf8')
      if (!pattern.test(text)) throw new Error(`${file} has no version where one is expected`)
      writeFileSync(join(root, file), text.replace(pattern, line(version)))
    },
  }
}

const [command, wanted] = process.argv.slice(2)
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
if (wanted !== undefined && !SEMVER.test(wanted)) {
  console.error(`${wanted} is not a version like 1.2.3`)
  process.exit(2)
}

if (command === 'set') {
  if (wanted === undefined) { console.error('set takes a version'); process.exit(2) }
  for (const place of PLACES) place.write(wanted)
  // The lockfile names each workspace's version: it follows the manifests.
  execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' })
}

if (command === 'set' || command === 'check') {
  const found = PLACES.map((place) => ({ file: place.file, version: place.read() }))
  const expected = wanted ?? found[0].version
  const wrong = found.filter((place) => place.version !== expected)
  for (const place of found) console.log(`${place.version === expected ? 'ok  ' : 'FAIL'} ${place.file}: ${place.version}`)
  if (wrong.length > 0) {
    console.error(`${wrong.length} of ${found.length} places do not say ${expected}`)
    process.exit(1)
  }
  console.log(`all ${found.length} places say ${expected}`)
} else {
  console.error('usage: node scripts/release-version.mjs check [X.Y.Z] | set X.Y.Z')
  process.exit(2)
}
