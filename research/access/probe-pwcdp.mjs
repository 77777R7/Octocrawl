// Library-level probe (label: library_probe): the installed Google Chrome launched as probe-cdp.mjs's narrowed launch
// (nodriver 0.50.6's flags, no --remote-allow-origins, a free port picked here and passed with
// --remote-debugging-host=127.0.0.1, a fresh temporary profile per URL), then driven by Playwright over connectOverCDP
// in its default context, as the installed_chrome rung does (ADR 0005). Data checks as in probe-cdp.mjs.
// Run on 2026-10-14: research/access/runs/2026-10-14-library-probe-pwcdp.md.
// Usage: PROBE_PROXY=http://127.0.0.1:7890 node probe-pwcdp.mjs input.json out.json (input as probe-cdp.mjs takes it)
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { chromium } from 'playwright'
const [inFile, outFile] = process.argv.slice(2)
const tasks = JSON.parse(await readFile(inFile, 'utf8'))
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PROXY = process.env.PROBE_PROXY
const CHALLENGE = /just a moment|checking your browser|verify you are human|access denied|captcha|attention required|press & hold|are you a robot|unusual activity/i
const ARGS = ['--no-first-run', '--no-service-autorun', '--no-default-browser-check', '--homepage=about:blank', '--no-pings', '--password-store=basic', '--disable-infobars', '--disable-breakpad', '--disable-dev-shm-usage', '--disable-session-crashed-bubble', '--disable-search-engine-choice-screen', '--disable-features=IsolateOrigins,site-per-process']
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
function checks(task, text) { return task.predicates.map((p) => { const re = new RegExp(p.pattern, (p.flags ?? '').includes('g') ? p.flags : `${p.flags ?? ''}g`); const n = (text.match(re) ?? []).length; return p.type === 'markdownCountMin' ? n >= p.min : n > 0 }).every(Boolean) }
async function look(task) {
  const profile = await mkdtemp(join(tmpdir(), 'probe-pwcdp-'))
  const port = await freePort()
  const chrome = spawn(CHROME, [...ARGS, `--user-data-dir=${profile}`, '--remote-debugging-host=127.0.0.1', `--remote-debugging-port=${port}`, ...(PROXY ? [`--proxy-server=${PROXY}`] : []), 'about:blank'], { stdio: 'ignore' })
  try {
    for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { await sleep(100) } }
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const page = browser.contexts()[0].pages()[0] ?? await browser.contexts()[0].newPage()
    const response = await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null)
    let html = '', text = ''
    const until = Date.now() + 20000
    for (;;) { await sleep(1000); html = await page.content().catch(() => ''); text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => ''); if (!CHALLENGE.test(html.slice(0, 200000)) && text.length > 200) break; if (Date.now() > until) break }
    const r = { status: response?.status() ?? null, bytes: html.length, title: (await page.title().catch(() => '')).slice(0, 80), challenge: CHALLENGE.test(html.slice(0, 200000)), data: checks(task, text) }
    await browser.close().catch(() => {})
    return r
  } finally { chrome.kill('SIGKILL'); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {}) }
}
const rows = []
for (const task of tasks) { let r; try { r = await look(task) } catch (e) { r = { error: String(e).slice(0, 160) } } rows.push({ id: task.id, pw_over_cdp: r }); console.log(task.id, '| pw_over_cdp', r.error ? 'ERR ' + r.error : `status=${r.status} data=${r.data}`) }
await writeFile(outFile, JSON.stringify({ meta: { at: new Date().toISOString(), egress: PROXY ?? 'direct', arms: ['pw_over_cdp'] }, rows }, null, 2))
