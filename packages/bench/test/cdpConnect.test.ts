import { afterEach, describe, expect, it, vi } from 'vitest'
import { playwrightConnector } from '../src/vendors/cdp.js'

// Playwright's connectOverCDP stands in here as it behaves: it gives up at the timeout it is handed.
const { connectOverCDP } = vi.hoisted(() => ({
  connectOverCDP: vi.fn((_url: string, options: { timeout: number }) => new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error(`browserType.connectOverCDP: Timeout ${options.timeout}ms exceeded.`)), options.timeout)
  })),
}))
vi.mock('playwright', () => ({ chromium: { connectOverCDP } }))

describe('playwrightConnector', () => {
  afterEach(() => {
    vi.useRealTimers()
    connectOverCDP.mockClear()
  })

  it('cuts a CDP connect that hangs at 30 s, though the session may last 120 s (O7)', async () => {
    vi.useFakeTimers()
    let settled: string | null = null
    void playwrightConnector('wss://cdp.example/st_1', Date.now() + 120_000).then(() => { settled = 'connected' }, (error: Error) => { settled = error.message })
    await vi.advanceTimersByTimeAsync(29_999)
    expect(connectOverCDP).toHaveBeenCalledWith('wss://cdp.example/st_1', { timeout: 30_000 })
    expect(settled).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toContain('Timeout 30000ms exceeded')
  })

  it('gives a connect no more than the time left before the deadline', async () => {
    vi.useFakeTimers()
    void playwrightConnector('wss://cdp.example/st_1', Date.now() + 8_000).catch(() => {})
    await vi.advanceTimersByTimeAsync(0)
    expect(connectOverCDP.mock.calls[0]![1].timeout).toBeLessThanOrEqual(8_000)
    await vi.advanceTimersByTimeAsync(8_000)
  })
})
