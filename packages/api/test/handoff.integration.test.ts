import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { buildChannels } from '@w2l/bench'
import type { CrawlPage } from '@w2l/contracts'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/**
 * The handoff end to end: a batch stopped at a captcha, handed to "the
 * person" in a real Chromium that remote debugging is on in (as the person's
 * Chrome would be), who gets through it there; W2L reads the page and the
 * item's stopped result is replaced. The test plays the person: it clicks the
 * page's button in the tab W2L opened.
 */

let server: Server
let base: string
let root: string
let chrome: BrowserContext

const ARTICLE = `<article><h1>The member page</h1>${'<p>What is behind the check: a page of prose, long enough to be read as an article and not as a stub. </p>'.repeat(4)}</article>`

beforeAll(async () => {
  server = createServer((req, res) => {
    const html = (body: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html><head><title>Members</title></head><body>${body}</body></html>`) }
    if (req.url === '/robots.txt') { res.writeHead(404); res.end(); return }
    if (req.url === '/open') return html(ARTICLE.replace('member page', 'open page'))
    if (req.url === '/gate') {
      // A captcha until the person passes it: their browser then holds the cookie the page checks.
      if ((req.headers.cookie ?? '').includes('passed=1')) return html(ARTICLE)
      return html('<div class="g-recaptcha" data-sitekey="test-key"></div><button id="pass" onclick="document.cookie=\'passed=1; path=/\'; location.reload()">I am human</button>')
    }
    res.writeHead(404); res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  root = await mkdtemp(join(tmpdir(), 'w2l-handoff-'))
  // "The person's Chrome": remote debugging on, so Chrome writes DevToolsActivePort in its user data directory.
  chrome = await chromium.launchPersistentContext(join(root, 'chrome'), { args: ['--remote-debugging-port=0'] })
}, 60_000)

afterAll(async () => {
  await chrome?.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(root, { recursive: true, force: true })
})

function engineFor(taskRoot: string): ApiEngine {
  const http = buildChannels('standard', { localSubjects: { browser_local: { fetch: async () => { throw new Error('unused') } } } })[0]!
  return createApiEngine({ taskRoot, channelsFor: () => [http], userChrome: { userDataDir: join(root, 'chrome') } })
}

async function finished(engine: ApiEngine, taskId: string) {
  for (let i = 0; i < 300; i++) {
    const report = await engine.getBatch(taskId)
    if (report !== null && ['completed', 'failed', 'cancelled'].includes(report.status)) return report
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('batch did not finish')
}

async function itemsOf(engine: ApiEngine, taskId: string): Promise<CrawlPage[]> {
  return (await engine.getBatchItems(taskId, { limit: 50, debug: true }))!.items
}

describe('handing a page a check stopped to the person, in their own Chrome', () => {
  it('the stopped item waits for the person; once they are through, W2L reads the page there and the item is the page', async () => {
    const engine = engineFor(join(root, 'tasks'))
    // The person: in each tab W2L opens, they pass the check.
    const opened: string[] = []
    chrome.on('page', (page) => {
      opened.push(page.url())
      void page.waitForSelector('#pass', { timeout: 20_000 }).then(() => page.click('#pass')).catch(() => undefined)
    })
    try {
      const { taskId } = await engine.startBatch({ urls: [`${base}/gate`, `${base}/open`], formats: ['markdown'] } as never)
      const report = await finished(engine, taskId)
      expect(report).toMatchObject({ status: 'completed', waitingForPerson: 1 })
      const stopped = (await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/gate'))!
      expect(stopped).toMatchObject({ status: 'blocked', blockReason: 'captcha', handoff: { reason: 'captcha_required', liveViewUrl: null } })
      expect((await itemsOf(engine, taskId)).find((item) => item.url.endsWith('/open'))!.handoff).toBeUndefined()

      const done = await engine.handOffBatch(taskId, {})
      expect(done).toMatchObject({ id: taskId, handedOff: 1, through: 1, notThrough: 0, items: [{ id: stopped.id, url: `${base}/gate`, through: true, status: 'success' }] })
      // W2L opened the stopped page alone, and closed its tab when it had read it.
      expect(opened).toEqual([`${base}/gate`])
      for (let i = 0; i < 40 && chrome.pages().some((page) => page.url().startsWith(base)); i++) await new Promise((resolve) => setTimeout(resolve, 50))
      expect(chrome.pages().some((page) => page.url().startsWith(base))).toBe(false)

      const item = (await itemsOf(engine, taskId)).find((entry) => entry.url.endsWith('/gate'))!
      expect(item).toMatchObject({ id: stopped.id, status: 'success', lane: 'browser_local_authed', blockReason: null })
      expect(item.handoff).toBeUndefined()
      expect(item.markdown).toContain('What is behind the check')
      // W2L sent nothing for it: the person's browser did, as them.
      expect(item.evidenceRecord).toMatchObject({ lane: 'browser_local_authed', status: 'success', identity: { mode: 'authed', userAgent: null }, robotsDecision: { decision: 'no_robots' } })
      expect(item.trace.map((event) => event.event)).toContain('user_browser_read')
      expect(await engine.getBatch(taskId)).toMatchObject({ waitingForPerson: 0, succeeded: 2, failed: 0 })
      // Nothing left to hand over.
      expect(await engine.handOffBatch(taskId, {})).toMatchObject({ handedOff: 0, items: [] })
    } finally {
      chrome.removeAllListeners('page')
      await engine.close()
    }
  }, 120_000)
})
