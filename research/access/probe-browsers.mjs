// Library-level probe of other browsers on the 16 challenge and bot-check tasks (label: library_probe).
// Arms: camoufox (Firefox with C++ fingerprint patches, npm `camoufox`), playwright (stock Chromium, control).
// Headed, a fresh browser per URL, the egress as its proxy (HTTPS_PROXY, or none for direct).
// After domcontentloaded the page is read once its challenge wording is gone, at most WAIT_MS later.
// A crude pass is HTTP 200 on the main response or a cleared challenge, over 2,000 bytes, no challenge wording;
// `data` runs the task's own checks (markdownMatches, markdownCountMin) on the page's visible text.
// Usage: [HTTPS_PROXY=...] ARMS=camoufox,playwright node probe-browsers.mjs input.json out.json
import { readFile, writeFile } from 'node:fs/promises'
const [inFile, outFile] = process.argv.slice(2)
const tasks = JSON.parse(await readFile(inFile, 'utf8'))
const arms = (process.env.ARMS ?? 'camoufox,playwright').split(',').filter(Boolean)
const WAIT_MS = Number(process.env.WAIT_MS ?? 20000)
const proxyUrl = process.env.HTTPS_PROXY
const proxy = proxyUrl ? (() => { const u = new URL(proxyUrl); return { server: `${u.protocol}//${u.hostname}:${u.port || 80}`, ...(u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } : {}) } })() : undefined
const CHALLENGE = /just a moment|checking your browser|verify you are human|access denied|captcha|attention required|press & hold|are you a robot|unusual activity/i

function checks(task, text) {
  return task.predicates.map((p) => {
    const re = new RegExp(p.pattern, (p.flags ?? '').includes('g') ? p.flags : `${p.flags ?? ''}g`)
    const n = (text.match(re) ?? []).length
    return p.type === 'markdownCountMin' ? n >= p.min : n > 0
  }).every(Boolean)
}

async function launch(arm) {
  if (arm === 'camoufox') {
    const { Camoufox } = await import('camoufox')
    return Camoufox({ headless: false, ...(proxy ? { proxy, geoip: true } : {}) })
  }
  const { chromium } = await import('playwright')
  return chromium.launch({ headless: false, ...(proxy ? { proxy } : {}) })
}

async function look(arm, task) {
  const started = Date.now()
  const browser = await launch(arm)
  try {
    const page = await browser.newPage()
    const response = await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    let text = ''
    let html = ''
    const until = Date.now() + WAIT_MS
    for (;;) {
      await page.waitForTimeout(1000)
      html = await page.content().catch(() => '')
      text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      if (!CHALLENGE.test(html.slice(0, 200000)) && text.length > 200) break
      if (Date.now() > until) break
    }
    const status = response?.status() ?? 0
    const challenge = CHALLENGE.test(html.slice(0, 200000))
    const cleared = status !== 200 && !challenge && html.length > 2000
    return {
      status, bytes: html.length, textChars: text.length, title: (await page.title().catch(() => '')).slice(0, 80),
      challenge, pass: (status === 200 || cleared) && html.length > 2000 && !challenge, data: checks(task, text),
      finalUrl: page.url(), ms: Date.now() - started,
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

const rows = []
for (const task of tasks) {
  const row = { id: task.id, url: task.url }
  for (const arm of arms) {
    try { row[arm] = await look(arm, task) } catch (e) { row[arm] = { error: String(e).slice(0, 160) } }
  }
  rows.push(row)
  console.log(task.id, ...arms.map((a) => `| ${a} ${row[a].error ? 'ERR' : `${row[a].status} pass=${row[a].pass} data=${row[a].data}`}`))
}
await writeFile(outFile, JSON.stringify({ meta: { at: new Date().toISOString(), egress: proxy ? proxy.server : 'direct', arms, headed: true, waitMs: WAIT_MS, label: 'library_probe' }, rows }, null, 2))
