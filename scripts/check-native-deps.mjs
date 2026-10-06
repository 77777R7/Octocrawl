#!/usr/bin/env node
// Installs the packed CLI on this platform and runs it with its native dependencies, against a site on
// loopback. The task store's better-sqlite3 loads for every command. impit, the browser-compatible HTTP
// transport (W2L_COMPAT_HOSTS, ADR 0005 compatible_transport), loads only when a host is listed. Each
// ships prebuilt binaries per platform, so a package that installs and runs on Linux can still fail on
// Windows or macOS. scripts/check-packages.mjs covers the packages' features on Linux; this covers the
// native modules on any platform, Windows included, using node and npm only.
//
// Usage: node scripts/check-native-deps.mjs <directory with the octocrawl-cli-*.tgz tarball>

import { execFile, execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const tarballs = resolve(process.argv[2] ?? '.w2l/pack/tarballs')
const tarball = readdirSync(tarballs).find((file) => /^octocrawl-cli-\d.*\.tgz$/.test(file))
if (tarball === undefined) throw new Error(`no octocrawl-cli-*.tgz in ${tarballs}`)
const project = mkdtempSync(join(tmpdir(), 'octocrawl-native-check-'))
const results = []
const check = (name, pass, detail) => { results.push(pass); console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${detail}`) }

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day and publishes them each morning. '.repeat(3)
const PAGE = `<!doctype html><html lang="en"><head><title>Tides</title></head><body><main><article><h1>Tides</h1><p>${PROSE}</p></article></main></body></html>`
const site = createServer((req, res) => {
  if (req.url === '/robots.txt') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
})
await new Promise((done) => site.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${site.address().port}/tides`
const env = { ...process.env, W2L_TASK_ROOT: join(project, 'tasks'), NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }
// The CLI runs by node itself, so no shim (npx, a .cmd on Windows) stands between it and the check.
const cli = join(project, 'node_modules', '@octocrawl', 'cli', 'dist', 'cli.js')
const scrape = async (extra) => JSON.parse((await promisify(execFile)(process.execPath, [cli, 'scrape', url], { cwd: project, env: { ...env, ...extra }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000 })).stdout)

try {
  // better-sqlite3 needs its install script (its native binding); npm 11 runs it only when the project allows it.
  writeFileSync(join(project, 'package.json'), `${JSON.stringify({ name: 'octocrawl-native-check', version: '1.0.0', private: true, allowScripts: { 'better-sqlite3': true } }, null, 2)}\n`)
  // npm is npm.cmd on Windows, which runs only through a shell.
  execFileSync('npm', ['install', '--no-audit', '--no-fund', join(tarballs, tarball)], { cwd: project, stdio: 'inherit', env, shell: process.platform === 'win32' })
  check('install', true, `${tarball} on ${process.platform}-${process.arch}, node ${process.version}`)

  const plain = await scrape({})
  check('scrape over undici (better-sqlite3 loaded)', plain.status === 'success' && plain.evidenceRecord?.access?.route === 'http' && plain.evidenceRecord.access.executor === 'undici', JSON.stringify({ status: plain.status, access: plain.evidenceRecord?.access }))

  const compat = await scrape({ W2L_ACCESS_GRANT: JSON.stringify({ tier: 'standard', capabilities: ['compatible_transport'] }), W2L_COMPAT_HOSTS: '127.0.0.1' })
  const access = compat.evidenceRecord?.access
  check('scrape over impit (its binary loaded)', compat.status === 'success' && access?.route === 'http_compat' && access.executor === 'impit' && typeof access.executorVersion === 'string', JSON.stringify({ status: compat.status, access }))
} catch (error) {
  check('run', false, error instanceof Error ? `${error.message}\n${error.stderr ?? ''}`.slice(0, 2000) : String(error))
} finally {
  await new Promise((done) => site.close(done))
  rmSync(project, { recursive: true, force: true })
}
const failed = results.filter((pass) => !pass).length
console.log(`${results.length - failed} of ${results.length} checks passed`)
process.exitCode = failed === 0 ? 0 : 1
