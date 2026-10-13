import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_INSTALL_COMMAND, browserInstallCommand, browserNotInstalled } from '../src/browserInstall.js'

/**
 * A new install that has not run `npx playwright install chromium` (ROADMAP P1, one-line install): the browser lane
 * cannot start. Run in a child process with PLAYWRIGHT_BROWSERS_PATH on an empty directory, so Playwright finds no
 * browser, as on a clean machine. The trace must name the missing browser and the command, not a bare connection_error.
 */

let site: Server
let url: string
let dir: string
beforeAll(async () => {
  site = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><html><body><div id="app"></div><script>document.getElementById("app").textContent = "Rendered"</script></body></html>')
  })
  site.listen(0, '127.0.0.1'); await once(site, 'listening')
  url = `http://127.0.0.1:${(site.address() as AddressInfo).port}/shell`
  dir = await mkdtemp(join(tmpdir(), 'octocrawl-no-browser-'))
})
afterAll(async () => {
  await new Promise<void>((resolve) => site.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

it('a browser lane with no browser installed says so in its trace, with the install command', async () => {
  const subject = fileURLToPath(new URL('../src/subjects/browserLocal.ts', import.meta.url))
  const script = join(dir, 'probe.mts')
  await writeFile(script, `
const { BrowserLocalSubject } = await import(${JSON.stringify(subject)})
const browser = new BrowserLocalSubject()
try {
  const result = await browser.fetch(${JSON.stringify(url)})
  const failed = result.trace.find((event) => event.event === 'navigate_failed')
  console.log(JSON.stringify({ status: result.status, failureReason: result.failureReason, error: failed?.detail?.error ?? null, events: result.trace.filter((event) => event.event === 'browser_unavailable') }))
} finally {
  await browser.teardown()
}
`)
  const env: NodeJS.ProcessEnv = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(dir, 'no-browsers') }
  delete env.HTTPS_PROXY; delete env.HTTP_PROXY; delete env.https_proxy; delete env.http_proxy
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(process.execPath, ['--import', 'tsx', script], { env, timeout: 60_000 }, (error, out, err) => error ? reject(new Error(`${error.message}\n${err}`)) : resolve(out))
  })
  const answer = JSON.parse(stdout.trim().split('\n').at(-1)!) as { status: string; failureReason: string; error: string; events: { detail: { install: string } }[] }
  expect(answer).toMatchObject({ status: 'failed', failureReason: 'connection_error' })
  // Playwright's own wording, as a clean machine sees it.
  expect(browserNotInstalled(new Error(answer.error))).toBe(true)
  expect(answer.events).toEqual([expect.objectContaining({ event: 'browser_unavailable', detail: { engine: 'playwright', install: BROWSER_INSTALL_COMMAND } })])
}, 90_000)

it('other launch and navigation errors are not read as a missing browser', () => {
  expect(browserNotInstalled(new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/'))).toBe(false)
  expect(browserNotInstalled(new Error('browserType.launch: Failed to launch: Error: spawn /usr/bin/chromium EACCES'))).toBe(false)
  expect(browserNotInstalled('Executable doesn\'t exist')).toBe(false)
  // Each engine's own browser build.
  expect(browserInstallCommand('playwright')).toBe('npx playwright install chromium')
  expect(browserInstallCommand('patchright')).toBe('npx patchright install chromium')
})
