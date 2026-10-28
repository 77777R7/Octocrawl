// H2b start-of-round self-check, one JSON line on stdout: G4's checks (research/access/g4-cloudrun/selfcheck.mjs) with
// H2b's routing. The installed Chrome is launched as the rung launches it, through W2L_CHROME_PATH (chrome.sh), so its
// egress is the metering forwarder and the arm's exit; the control page it loads shows that exit. DNS covers the run's
// tasks (H2B_TASKS) and the arm's gateways (H2B_GATEWAY_HOSTS, names only). A failed item is reported and the round
// still runs: a round whose control failed is marked, never dropped.
// Run from the repository root: node --import tsx research/access/h2b-egress/selfcheck.mjs
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { findInstalledChrome, launchInstalledChrome } from '../../../packages/bench/src/subjects/installedChrome.ts'

const run = promisify(execFile)
const CONTROL_URL = 'https://api.ipify.org/?format=json'
const tasks = JSON.parse(readFileSync('research/access/tasks.v1.json', 'utf8'))
const list = Array.isArray(tasks) ? tasks : tasks.tasks
const ids = (process.env.H2B_TASKS ?? '').split(',').filter(Boolean)
const hosts = [...new Set(ids.map((id) => new URL(list.find((t) => t.id === id).url).hostname))]
const check = {}
const timed = async (name, fn) => {
  const start = Date.now()
  try { check[name] = { ok: true, ms: Date.now() - start, ...(await fn()) }; check[name].ms = Date.now() - start }
  catch (error) { check[name] = { ok: false, ms: Date.now() - start, error: String(error?.message ?? error).slice(0, 300) } }
}

await timed('display', async () => {
  if (process.platform === 'darwin') return { kind: 'macOS window server (no Xvfb)' }
  const display = process.env.DISPLAY ?? ''
  const socket = `/tmp/.X11-unix/X${display.replace(/^:/, '').split('.')[0]}`
  if (!existsSync(socket)) throw new Error(`no X socket at ${socket} for DISPLAY=${display}`)
  const info = await run('xdpyinfo', ['-display', display]).then(({ stdout }) => stdout.match(/dimensions:\s+(\S+)/)?.[1] ?? null).catch(() => null)
  return { kind: 'Xvfb', display, socket, dimensions: info }
})

await timed('grant', async () => {
  const text = readFileSync(process.env.W2L_ACCESS_GRANT ?? '', 'utf8')
  return { sha256: createHash('sha256').update(text).digest('hex'), capabilities: JSON.parse(text).capabilities }
})

await timed('dns', async () => {
  const names = [...hosts, 'api.ipify.org', ...(process.env.H2B_GATEWAY_HOSTS ?? '').split(',').filter(Boolean)]
  const answers = {}
  for (const name of names) {
    try { answers[name] = (await lookup(name, { all: true })).map((a) => a.address).slice(0, 3) } catch (error) { answers[name] = `error: ${error.code ?? error.message}` }
  }
  const failed = Object.values(answers).filter((a) => typeof a === 'string').length
  if (failed > 0) return { ok: false, failed, answers }
  return { failed, answers }
})

await timed('fonts', async () => {
  const { stdout } = await run('fc-list', [':', 'family'])
  const families = [...new Set(stdout.split('\n').flatMap((line) => line.split(',')).map((s) => s.trim()).filter(Boolean))].sort()
  return { families: families.length, notoCjk: families.some((f) => /Noto Sans CJK/.test(f)), liberation: families.some((f) => /Liberation/.test(f)) }
})

// No environment proxy reaches the rung, so it passes direct://, which chrome.sh turns into the forwarder.
const launch = { timeout: 30_000, args: ['--proxy-server=direct://'] }
let browser = null
await timed('browser', async () => {
  const executable = await findInstalledChrome()
  return { executable, real: process.env.H2B_REAL_CHROME ?? '/usr/bin/google-chrome', version: (await run(executable, ['--version'])).stdout.trim() }
})
await timed('cdp', async () => {
  browser = await launchInstalledChrome(launch)
  return { version: browser.version(), egress: process.env.H2B_CHROME_PROXY ?? null, arm: process.env.H2B_ARM ?? null }
})
if (browser !== null) {
  await timed('egressControl', async () => {
    const page = browser.contexts()[0].pages()[0] ?? await browser.contexts()[0].newPage()
    const response = await page.goto(CONTROL_URL, { timeout: 30_000 })
    const body = await page.textContent('body')
    const ip = body?.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0] ?? null
    const self = await page.evaluate(() => ({
      userAgent: navigator.userAgent, language: navigator.language, languages: navigator.languages,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, webdriver: navigator.webdriver,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`, window: `${outerWidth}x${outerHeight}`, viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory ?? null,
    }))
    if (ip === null) throw new Error(`control page answered ${response?.status() ?? 'nothing'} without an address`)
    return { url: CONTROL_URL, status: response?.status() ?? null, ip, chromeReports: self }
  })
  const closing = Date.now()
  await browser.close()
  check.cleanup = { ok: true, ms: Date.now() - closing }
} else check.egressControl = { ok: false, ms: 0, error: 'Chrome did not start, so the control page was not loaded' }

const items = ['display', 'grant', 'dns', 'fonts', 'browser', 'cdp', 'egressControl']
console.log(JSON.stringify({ selfcheck: { at: new Date().toISOString(), arm: process.env.H2B_ARM ?? null, window: process.env.H2B_WINDOW ?? null, ok: items.every((k) => check[k]?.ok === true), failed: items.filter((k) => check[k]?.ok !== true), ...check } }))
