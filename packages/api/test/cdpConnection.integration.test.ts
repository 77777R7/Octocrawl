import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext } from 'playwright'
import { chromeEndpoint, connectCdp, type CdpConnection } from '../src/chromeLogin.js'

/**
 * The connection to the person's Chrome, in real Chromium, when a tab W2L
 * is reading closes: Chrome leaves the command in flight on that tab's
 * session unanswered, and says the tab is gone by detaching the session.
 * A command sent after it is refused at once instead of being sent.
 */

let root: string
let chrome: BrowserContext
let connection: CdpConnection

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'w2l-cdp-'))
  chrome = await chromium.launchPersistentContext(join(root, 'chrome'), { args: ['--remote-debugging-port=0'] })
  connection = await connectCdp(await chromeEndpoint(join(root, 'chrome')), 10_000)
}, 60_000)

afterAll(async () => {
  connection?.close()
  await chrome?.close()
  await rm(root, { recursive: true, force: true })
})

describe('a tab closed while W2L reads it', () => {
  it('fails the command in flight and any sent after at once, as a closed target', async () => {
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' }) as { targetId: string }
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId: string }
    const started = Date.now()
    const inFlight = connection.send('Runtime.evaluate', { expression: 'new Promise((resolve) => setTimeout(resolve, 20000))', awaitPromise: true }, sessionId).catch((error: unknown) => error)
    await connection.send('Target.closeTarget', { targetId })
    expect(String(await inFlight)).toMatch(/Target closed/)
    expect(Date.now() - started).toBeLessThan(5_000)
    const after = Date.now()
    expect(String(await connection.send('Runtime.evaluate', { expression: '1' }, sessionId).catch((error: unknown) => error))).toMatch(/Target closed/)
    expect(Date.now() - after).toBeLessThan(1_000)
    // The browser's own commands still answer.
    expect(await connection.send('Browser.getVersion')).toMatchObject({ product: expect.any(String) })
  }, 60_000)
})
