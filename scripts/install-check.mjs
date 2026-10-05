#!/usr/bin/env node
// The one-line install (ROADMAP P1), as a new user meets it: in an empty
// directory, with an empty npm cache, `npx -y octocrawl@<version> scrape <url>`
// must print a successful result within the limit. Times the whole run, from
// the npx call to the answer, and reports it as a JSON line (and, under
// GitHub Actions, a row of the job summary).
//
// Usage: node scripts/install-check.mjs [--version latest] [--url https://example.com] [--limit-ms 300000]

import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const version = arg('version', 'latest')
const url = arg('url', 'https://example.com')
const limitMs = Number(arg('limit-ms', '300000'))

const dir = mkdtempSync(join(tmpdir(), 'octocrawl-install-'))
// A cache of its own: nothing a previous install left behind makes the run faster.
const env = { ...process.env, npm_config_cache: join(dir, 'npm-cache'), npm_config_update_notifier: 'false', W2L_TASK_ROOT: join(dir, 'tasks') }
const started = Date.now()
const child = spawn('npx', ['-y', `octocrawl@${version}`, 'scrape', url], { cwd: dir, env, shell: process.platform === 'win32' })
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })
const timer = setTimeout(() => child.kill('SIGKILL'), limitMs)
const code = await new Promise((resolve) => child.on('close', resolve))
clearTimeout(timer)
const elapsedMs = Date.now() - started

let status = null
let installed = null
try {
  const answer = JSON.parse(stdout)
  status = answer.status ?? null
} catch {
  // Not JSON: the run failed before the scrape answered; stderr says why.
}
try {
  const listed = await new Promise((resolve) => {
    const npx = spawn('npx', ['-y', `octocrawl@${version}`, '--version'], { cwd: dir, env, shell: process.platform === 'win32' })
    let out = ''
    npx.stdout.on('data', (chunk) => { out += chunk })
    npx.on('close', () => resolve(out.trim()))
  })
  installed = listed === '' ? null : listed
} catch {
  installed = null
}
rmSync(dir, { recursive: true, force: true })

const pass = code === 0 && status === 'success' && elapsedMs <= limitMs
const result = { pass, platform: process.platform, arch: process.arch, node: process.version, package: `octocrawl@${version}`, installed, url, exitCode: code, status, elapsedMs, limitMs }
console.log(JSON.stringify(result))
if (!pass) console.error(stderr.slice(-4000))
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| ${process.platform} ${process.arch} | ${process.version} | ${installed ?? 'unknown'} | ${url} | ${status ?? 'none'} (exit ${code}) | ${(elapsedMs / 1000).toFixed(1)} s | ${pass ? 'pass' : 'FAIL'} |\n`)
}
process.exitCode = pass ? 0 : 1
