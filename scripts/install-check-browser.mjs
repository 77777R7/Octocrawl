#!/usr/bin/env node
// The one-line install (ROADMAP P1) for a page that needs the browser, as a new user meets it: a clean machine with no
// browser for Playwright. In an empty directory, with an empty npm cache and PLAYWRIGHT_BROWSERS_PATH on an empty
// directory, it runs
//   1. `npx -y octocrawl@<version> scrape <url>`: the answer must name the missing browser and the command to install it
//      (a `browser_not_installed` warning, and that command in the first hint), from the version that says so on;
//   2. that command, `npx -y playwright install chromium`;
//   3. the same scrape again: the browser lane must read the page, and its Markdown hold the expected text.
// All within the limit, timed from the first npx call. Reports a JSON line and, under GitHub Actions, a summary row.
//
// Usage: node scripts/install-check-browser.mjs [--version latest] [--url https://quotes.toscrape.com/js/]
//          [--expect Einstein] [--hint-since 0.4.2] [--limit-ms 300000]

import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}
const version = arg('version', 'latest')
const url = arg('url', 'https://quotes.toscrape.com/js/')
const expected = arg('expect', 'Einstein')
// The first published version that names a missing browser (CHANGELOG, Unreleased on 2026-10-13); earlier ones are
// checked from step 2 on.
const hintSince = arg('hint-since', '0.4.2')
const limitMs = Number(arg('limit-ms', '300000'))

const dir = mkdtempSync(join(tmpdir(), 'octocrawl-install-browser-'))
const env = {
  ...process.env,
  npm_config_cache: join(dir, 'npm-cache'),
  npm_config_update_notifier: 'false',
  W2L_TASK_ROOT: join(dir, 'tasks'),
  // No browser Playwright could find, whatever the runner has cached.
  PLAYWRIGHT_BROWSERS_PATH: join(dir, 'browsers'),
}
const started = Date.now()
const deadline = started + limitMs

function run(args) {
  return new Promise((resolve) => {
    const child = spawn('npx', args, { cwd: dir, env, shell: process.platform === 'win32' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), Math.max(1, deadline - Date.now()))
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}
const parse = (stdout) => { try { return JSON.parse(stdout) } catch { return null } }
/** a >= b for x.y.z versions; a prerelease or a tag compares by its numbers alone. */
function atLeast(a, b) {
  const pa = String(a).split(/[.-]/).map(Number)
  const pb = String(b).split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return true
}

const first = await run(['-y', `octocrawl@${version}`, 'scrape', url])
const before = parse(first.stdout)
const listed = await run(['-y', `octocrawl@${version}`, '--version'])
const installed = listed.stdout.trim() || null
const hinted = before?.warnings?.some((warning) => warning.code === 'browser_not_installed') === true
  && /npx (playwright|patchright) install chromium/.test(before?.agentHints?.[0] ?? '')
const hintChecked = installed !== null && atLeast(installed, hintSince)

const install = await run(['-y', 'playwright', 'install', 'chromium'])
const second = await run(['-y', `octocrawl@${version}`, 'scrape', url])
const after = parse(second.stdout)
const elapsedMs = Date.now() - started
rmSync(dir, { recursive: true, force: true })

const read = after?.status === 'success' && after?.lane !== 'http' && String(after?.markdown ?? '').includes(expected)
const pass = (!hintChecked || hinted) && install.code === 0 && read && elapsedMs <= limitMs
const result = {
  pass, platform: process.platform, arch: process.arch, node: process.version, package: `octocrawl@${version}`, installed, url,
  before: { status: before?.status ?? null, lane: before?.lane ?? null, hinted, hintChecked },
  install: { exitCode: install.code },
  after: { status: after?.status ?? null, lane: after?.lane ?? null, expected, found: read },
  elapsedMs, limitMs,
}
console.log(JSON.stringify(result))
if (!pass) console.error([first.stderr, install.stderr, second.stderr].map((text) => text.slice(-2000)).join('\n---\n'))
if (process.env.GITHUB_STEP_SUMMARY) {
  const hint = hintChecked ? (hinted ? 'named' : 'MISSING') : `not checked before ${hintSince}`
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| ${process.platform} ${process.arch} | ${process.version} | ${installed ?? 'unknown'} | ${url} | ${before?.status ?? 'none'}, hint ${hint} | exit ${install.code} | ${after?.status ?? 'none'} on ${after?.lane ?? 'none'} | ${(elapsedMs / 1000).toFixed(1)} s | ${pass ? 'pass' : 'FAIL'} |\n`)
}
process.exitCode = pass ? 0 : 1
