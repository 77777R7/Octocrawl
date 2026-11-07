import { describe, expect, it } from 'vitest'
import { browserKeeper } from '../src/subjects/browserKeeper.js'
import type { Browser } from 'playwright'

// A keeper holds one launched browser for every subject of a process that asks for one, across the engines that come and
// go (a hosted job slice builds an engine and closes it): a browser launched once, not once a slice.

function fakeBrowser() {
  const handlers: Array<() => void> = []
  let connected = true
  const browser = {
    isConnected: () => connected,
    close: async () => { connected = false; for (const handler of handlers) handler() },
    on: (event: string, handler: () => void) => { if (event === 'disconnected') handlers.push(handler); return browser },
  }
  return { browser: browser as unknown as Browser, disconnect: () => { connected = false; for (const handler of handlers) handler() } }
}

describe('a process\'s browser keeper', () => {
  it('launches once for every caller, launches again after the browser died, and closes what it holds', async () => {
    const launched: ReturnType<typeof fakeBrowser>[] = []
    const launch = async () => { const made = fakeBrowser(); launched.push(made); return made.browser }
    const keeper = browserKeeper()
    const [a, b] = await Promise.all([keeper.get(launch), keeper.get(launch)])
    expect(a).toBe(b)
    expect(launched).toHaveLength(1)
    expect(await keeper.get(launch)).toBe(a)
    launched[0]!.disconnect()
    const c = await keeper.get(launch)
    expect(c).not.toBe(a)
    expect(launched).toHaveLength(2)
    await keeper.close()
    expect(c.isConnected()).toBe(false)
    // After close it serves again, with a new launch.
    expect(await keeper.get(launch)).not.toBe(c)
    expect(launched).toHaveLength(3)
    await keeper.close()
  })

  it('does not keep a launch that failed', async () => {
    const keeper = browserKeeper()
    await expect(keeper.get(async () => { throw new Error('no chromium') })).rejects.toThrow('no chromium')
    const made = fakeBrowser()
    expect(await keeper.get(async () => made.browser)).toBe(made.browser)
    await keeper.close()
  })

  it('closes a browser nobody has asked for in idleMs, and launches again on the next ask', async () => {
    const keeper = browserKeeper({ idleMs: 30 })
    const first = fakeBrowser()
    expect(await keeper.get(async () => first.browser)).toBe(first.browser)
    await new Promise<void>((resolve) => setTimeout(resolve, 80))
    expect(first.browser.isConnected()).toBe(false)
    const second = fakeBrowser()
    expect(await keeper.get(async () => second.browser)).toBe(second.browser)
    await keeper.close()
  })
})
