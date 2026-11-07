import { describe, expect, it } from 'vitest'
import { ChromeLoginError, type CdpConnection } from '../src/chromeLogin.js'
import { sharedChrome } from '../src/sharedChrome.js'

/**
 * Chrome's side of the connection: each connect waits for the person's Allow (`allow()`), can be dropped while it waits
 * (its signal), and is a connection Chrome can close (`quit`).
 */
function chrome() {
  const connects: Array<{ endpoint: string; dropped: boolean; allow: () => void; connection: ReturnType<typeof connection> }> = []
  const connection = () => {
    let closed = false
    const listeners = new Map<string, Set<() => void>>()
    const conn: CdpConnection & { quit(): void; listening(): number; closes: number } = {
      closes: 0,
      async send(method) { if (closed) throw new ChromeLoginError('Chrome closed the connection'); return { method } },
      on(method, sessionId) {
        const key = `${sessionId ?? ''}|${method}`
        const set = listeners.get(key) ?? new Set()
        const listener = () => {}
        set.add(listener)
        listeners.set(key, set)
        return () => { set.delete(listener) }
      },
      isClosed: () => closed,
      close() { closed = true; conn.closes++ },
      quit() { closed = true },
      listening: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    }
    return conn
  }
  const connect = (endpoint: string, _timeoutMs: number, signal?: AbortSignal) => new Promise<CdpConnection>((resolve, reject) => {
    const entry = { endpoint, dropped: false, allow: () => resolve(entry.connection), connection: connection() }
    connects.push(entry)
    signal?.addEventListener('abort', () => { entry.dropped = true; reject(new ChromeLoginError('the connection to Chrome was cancelled')) }, { once: true })
  })
  return { connects, connect }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('one connection to the person\'s Chrome', () => {
  it('connects once for every use, those waiting for the Allow included, and again only after Chrome closed it', async () => {
    const fake = chrome()
    const shared = sharedChrome(fake.connect)
    const first = shared.connect('ws://chrome/a', 1_000)
    const second = shared.connect('ws://chrome/a', 1_000)
    await tick()
    expect(fake.connects).toHaveLength(1)
    fake.connects[0]!.allow()
    const [a, b] = await Promise.all([first, second])
    expect(await a.send('Browser.getVersion')).toEqual({ method: 'Browser.getVersion' })
    // Letting go of a use leaves the connection to the others, and to the next.
    a.close()
    await expect(a.send('Browser.getVersion')).rejects.toThrow('Chrome closed the connection')
    expect(await b.send('Browser.getVersion')).toEqual({ method: 'Browser.getVersion' })
    const third = await shared.connect('ws://chrome/a', 1_000)
    expect(fake.connects).toHaveLength(1)
    expect(shared.opened()).toBe(1)
    third.close()
    // Chrome quit: the next use connects again.
    fake.connects[0]!.connection.quit()
    const again = shared.connect('ws://chrome/a', 1_000)
    await tick()
    expect(fake.connects).toHaveLength(2)
    fake.connects[1]!.allow()
    await again
    // Chrome restarted, with a new endpoint: the old connection is closed and a new one opened.
    const restarted = shared.connect('ws://chrome/b', 1_000)
    await tick()
    expect(fake.connects).toHaveLength(3)
    expect(fake.connects[1]!.connection.closes).toBe(1)
    fake.connects[2]!.allow()
    await restarted
    expect(shared.opened()).toBe(3)
  })

  it('drops the connect when every use waiting for the Allow is cancelled, so a later Allow attaches to nothing', async () => {
    const fake = chrome()
    const shared = sharedChrome(fake.connect)
    const one = new AbortController()
    const two = new AbortController()
    const first = shared.connect('ws://chrome/a', 1_000, one.signal)
    const second = shared.connect('ws://chrome/a', 1_000, two.signal)
    await tick()
    one.abort()
    await expect(first).rejects.toThrow('cancelled')
    // Another use still waits: the connect stands.
    expect(fake.connects[0]!.dropped).toBe(false)
    two.abort()
    await expect(second).rejects.toThrow('cancelled')
    expect(fake.connects[0]!.dropped).toBe(true)
    // The next use connects anew.
    const next = shared.connect('ws://chrome/a', 1_000)
    await tick()
    expect(fake.connects).toHaveLength(2)
    fake.connects[1]!.allow()
    await next
  })

  it('lets go of what a use listened to when it is closed, and closes the connection with the server', async () => {
    const fake = chrome()
    const shared = sharedChrome(fake.connect)
    const pending = shared.connect('ws://chrome/a', 1_000)
    await tick()
    fake.connects[0]!.allow()
    const use = await pending
    use.on!('Page.frameNavigated', 's:1', () => {})
    use.on!('Network.responseReceived', 's:1', () => {})
    expect(fake.connects[0]!.connection.listening()).toBe(2)
    use.close()
    expect(fake.connects[0]!.connection.listening()).toBe(0)
    expect(fake.connects[0]!.connection.closes).toBe(0)
    shared.close()
    expect(fake.connects[0]!.connection.closes).toBe(1)
    await expect(shared.connect('ws://chrome/a', 1_000)).rejects.toThrow('shutting down')
  })

  it('drops a connect still waiting for the Allow when the server stops', async () => {
    const fake = chrome()
    const shared = sharedChrome(fake.connect)
    const pending = shared.connect('ws://chrome/a', 1_000)
    await tick()
    shared.close()
    // Dropped as the server stopped: the wait ends, and nothing stays open.
    await expect(pending).rejects.toThrow()
    expect(fake.connects[0]!.dropped).toBe(true)
  })

  it('closes a connection Chrome opens after the server stopped, when Chrome does not heed the drop', async () => {
    // A connect that answers after it was dropped (the Allow clicked as the server stopped).
    let allow!: (connection: CdpConnection) => void
    const late: CdpConnection & { closes: number } = { closes: 0, send: async () => ({}), isClosed: () => late.closes > 0, close() { late.closes++ } }
    const shared = sharedChrome(() => new Promise<CdpConnection>((resolve) => { allow = resolve }))
    const pending = shared.connect('ws://chrome/a', 1_000)
    await tick()
    shared.close()
    allow(late)
    await expect(pending).rejects.toThrow('shutting down')
    await tick()
    expect(late.closes).toBe(1)
  })
})
