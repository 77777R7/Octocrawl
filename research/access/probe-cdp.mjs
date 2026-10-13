// Library-level probe (label: library_probe): the installed Google Chrome, launched with the flags nodriver 0.50.6 uses
// and driven over raw CDP from Node, with no Playwright layer: Page.navigate, then Runtime.evaluate to read the page (no
// Runtime.enable, no Network domain). A fresh temporary profile per URL. No dependencies (Node 22+ WebSocket).
// Pass and data are judged as in probe-browsers.mjs and probe_nodriver.py.
//
// Knobs (2026-10-13, research/access/runs/2026-10-13-library-probe-cdp-16-*.md):
//   HEADLESS=1          adds --headless=new
//   PROBE_PROXY=url     Chrome's --proxy-server (no credentials; probe-forward.mjs adds a gateway's login), else --no-proxy-server
//   ALLOW_ORIGINS=none  no --remote-allow-origins (default '*', as nodriver): a page then cannot open the DevTools
//                       WebSocket, and Node's own connection, which sends no Origin, still can (2026-10-14)
//   RANDOM_PORT=1       a free port the OS hands out, chosen here and passed as a fixed port with the host flag,
//                       never one of AVOID_PORTS (default 8787,8791,8792,8794,8795,8797,8798,8812-8814)
//   ATTACK_TEST=1       from the read page: can it open the browser's DevTools WebSocket knowing its URL, and read
//                       /json/version? (pageCanConnect in the output)
//   FIXED_PORT_BASE=n   --remote-debugging-host=127.0.0.1 and --remote-debugging-port=n, n+1, ... per launch, as nodriver
//                       launches. Without it the port is 0 (Chrome picks one, read from DevToolsActivePort); on 2026-10-13
//                       Cloudflare's challenge on T002 held with port 0 and cleared with this, the cause not isolated.
//   FIXED_PORT=n        one fixed port for every launch; NO_HOST=1 drops the host flag; HOST_ONLY=1 adds it with port 0
//   READ_MODE=dom       reads the HTML with DOM.getOuterHTML, as nodriver's get_content does
//   FIRST_READ_MS=n     waits n ms before the first read
//   NAV=argv            Chrome opens the URL from its command line instead of Page.navigate; NAV_DELAY_MS delays connecting
//   CLEAN_ENV=1         Chrome gets HOME, PATH, LANG and TMPDIR only
//   CHROME=path         another Chrome binary (default: /Applications/Google Chrome.app)
// Usage: ALLOW_ORIGINS=none RANDOM_PORT=1 PROBE_PROXY=http://127.0.0.1:7890 [HEADLESS=1] node probe-cdp.mjs input.json out.json
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
const [inFile, outFile] = process.argv.slice(2)
const tasks = JSON.parse(await readFile(inFile, 'utf8'))
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HEADLESS = process.env.HEADLESS === '1'
const WAIT_MS = Number(process.env.WAIT_MS ?? 20000)
const PROXY = process.env.PROBE_PROXY
const CHALLENGE = /just a moment|checking your browser|verify you are human|access denied|captcha|attention required|press & hold|are you a robot|unusual activity/i
// nodriver 0.50.6's defaults (core/config.py), so the two differ in the driver, not the launch.
const ARGS = [...(process.env.ALLOW_ORIGINS === 'none' ? [] : [`--remote-allow-origins=${process.env.ALLOW_ORIGINS ?? '*'}`]), '--no-first-run', '--no-service-autorun', '--no-default-browser-check', '--homepage=about:blank', '--no-pings',
  '--password-store=basic', '--disable-infobars', '--disable-breakpad', '--disable-dev-shm-usage', '--disable-session-crashed-bubble',
  '--disable-search-engine-choice-screen', '--disable-features=IsolateOrigins,site-per-process']
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function checks(task, text) {
  return task.predicates.map((p) => {
    const re = new RegExp(p.pattern, (p.flags ?? '').includes('g') ? p.flags : `${p.flags ?? ''}g`)
    const n = (text.match(re) ?? []).length
    return p.type === 'markdownCountMin' ? n >= p.min : n > 0
  }).every(Boolean)
}

async function devtoolsPort(profile) {
  if (process.env.FIXED_PORT) {
    const port = Number(process.env.FIXED_PORT)
    for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); return port } catch { await sleep(100) } }
    throw new Error('Chrome did not open its fixed debugging port')
  }
  for (let i = 0; i < 100; i++) {
    try { return Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]) } catch { await sleep(100) }
  }
  throw new Error('Chrome wrote no DevToolsActivePort')
}

function connect(url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(String(event.data))
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) }
  })
  const opened = new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })) })
  return { opened, send, close: () => ws.close() }
}

let launches = 0
// RANDOM_PORT=1: a free port the OS hands out, chosen here and passed to Chrome as a fixed port (never one in AVOID_PORTS).
const AVOID = new Set((process.env.AVOID_PORTS ?? '8787,8791,8792,8794,8795,8797,8798,8812,8813,8814').split(',').map(Number))
async function freePort() {
  for (;;) {
    const port = await new Promise((resolve, reject) => { const srv = createServer(); srv.once('error', reject); srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)) }) })
    if (!AVOID.has(port)) return port
  }
}
async function look(task) {
  const started = Date.now()
  // FIXED_PORT is the first of a run of ports, one per launch, so a Chrome still exiting never holds the next one's.
  if (process.env.FIXED_PORT_BASE) process.env.FIXED_PORT = String(Number(process.env.FIXED_PORT_BASE) + launches++)
  if (process.env.RANDOM_PORT === '1') process.env.FIXED_PORT = String(await freePort())
  const profile = await mkdtemp(join(tmpdir(), 'probe-cdp-'))
  const args = [...ARGS, `--user-data-dir=${profile}`, ...(process.env.NO_HOST === '1' ? [] : process.env.FIXED_PORT || process.env.HOST_ONLY === '1' ? ['--remote-debugging-host=127.0.0.1'] : []), `--remote-debugging-port=${process.env.FIXED_PORT ?? 0}`, ...(HEADLESS ? ['--headless=new'] : []), ...(PROXY ? [`--proxy-server=${PROXY}`] : ['--no-proxy-server']), process.env.NAV === 'argv' ? task.url : 'about:blank']
  // CLEAN_ENV=1: Chrome gets only HOME, PATH and the user's locale, not this shell's proxy variables and the like.
  const env = process.env.CLEAN_ENV === '1' ? { HOME: process.env.HOME, PATH: process.env.PATH, LANG: process.env.LANG ?? 'en_US.UTF-8', TMPDIR: process.env.TMPDIR } : process.env
  const chrome = spawn(CHROME, args, { stdio: 'ignore', env })
  try {
    const port = await devtoolsPort(profile)
    // NAV_DELAY_MS: connect only this long after launch (with NAV=argv, after the page has had that long on its own).
    if (process.env.NAV_DELAY_MS) await sleep(Number(process.env.NAV_DELAY_MS))
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = targets.find((t) => t.type === 'page')
    const cdp = connect(page.webSocketDebuggerUrl)
    await cdp.opened
    // NAV=argv: Chrome opened the URL itself from its command line; the driver only reads.
    if (process.env.NAV !== 'argv') await cdp.send('Page.navigate', { url: task.url })
    const evaluate = async (expression) => (await cdp.send('Runtime.evaluate', { expression, returnByValue: true, userGesture: true })).result?.value ?? ''
    // READ_MODE=dom reads the HTML through the DOM domain, as nodriver's get_content does; FIRST_READ_MS waits before the first read.
    const outerHtml = async () => process.env.READ_MODE === 'dom'
      ? (await cdp.send('DOM.getOuterHTML', { backendNodeId: (await cdp.send('DOM.getDocument', { depth: -1, pierce: true })).root.backendNodeId })).outerHTML
      : evaluate('document.documentElement ? document.documentElement.outerHTML : ""')
    if (process.env.FIRST_READ_MS) await sleep(Number(process.env.FIRST_READ_MS))
    let html = ''
    let text = ''
    const until = Date.now() + WAIT_MS
    for (;;) {
      await sleep(1000)
      html = await outerHtml().catch(() => '')
      text = await evaluate('document.body ? document.body.innerText : ""').catch(() => '')
      if (!CHALLENGE.test(html.slice(0, 200000)) && text.length > 200) break
      if (Date.now() > until) break
    }
    const challenge = CHALLENGE.test(html.slice(0, 200000))
    const title = await evaluate('document.title').catch(() => '')
    const finalUrl = await evaluate('location.href').catch(() => '')
    // ATTACK_TEST=1: can the page itself open this browser's DevTools WebSocket (knowing its address)? opened / refused.
    let pageCanConnect = null
    if (process.env.ATTACK_TEST === '1') {
      const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
      const target = JSON.stringify(version.webSocketDebuggerUrl)
      pageCanConnect = await (await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `new Promise((resolve) => { try { const ws = new WebSocket(${target}); ws.onopen = () => { ws.close(); resolve('opened') }; ws.onerror = () => resolve('refused'); setTimeout(() => resolve('timeout'), 5000) } catch (e) { resolve('threw ' + e.name) } })` })).result?.value ?? null
      const blind = await (await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `fetch('http://127.0.0.1:${port}/json/version').then((r) => r.text()).then((t) => 'read ' + t.length + ' bytes', (e) => 'blocked: ' + e.name)` })).result?.value ?? null
      pageCanConnect = { websocketWithKnownUrl: pageCanConnect, readJsonVersion: blind }
    }
    cdp.close()
    return { ...(pageCanConnect === null ? {} : { pageCanConnect }), port, bytes: html.length, textChars: text.length, title: String(title).slice(0, 80), challenge, pass: html.length > 2000 && !challenge, data: checks(task, text), finalUrl, ms: Date.now() - started }
  } finally {
    chrome.kill('SIGKILL')
    await sleep(300)
    await rm(profile, { recursive: true, force: true }).catch(() => {})
  }
}

const arm = HEADLESS ? 'cdp_headless' : 'cdp_headed'
const rows = []
for (const task of tasks) {
  let r
  try { r = await look(task) } catch (e) { r = { error: String(e).slice(0, 160) } }
  rows.push({ id: task.id, url: task.url, [arm]: r })
  console.log(task.id, `| ${arm}`, r.error ? `ERR ${r.error}` : `pass=${r.pass} data=${r.data}`)
}
await writeFile(outFile, JSON.stringify({ meta: { at: new Date().toISOString(), egress: PROXY ?? 'direct', arms: [arm], chrome: CHROME, headless: HEADLESS, waitMs: WAIT_MS, label: 'library_probe' }, rows }, null, 2))
