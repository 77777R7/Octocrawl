/**
 * One connection to the person's Chrome for a server's whole life (login UX A2). Chrome asks "Allow remote debugging?"
 * for every connection; a server that connected once per request had the person click it for every scrape, every batch
 * run and every saved login. Here the first use connects, and every later use (a my-browser read, a handoff, a login
 * import) borrows the same connection, until the server stops or Chrome closes it (Chrome quit, or remote debugging
 * turned off): then the next use connects again, and Chrome rightly asks again.
 *
 * Keeping the connection open changes nothing a page sees: with remote debugging on, every page sees
 * `navigator.webdriver` true and Chrome shows its "controlled by automated test software" bar whether a client is
 * connected or not (docs/access.md, seen 2026-10-07 on Chrome 153).
 *
 * A borrowed connection is a lease: closing it lets go of what it listened to, never the connection itself. A use
 * cancelled while Chrome still asks lets go of the wait; when every waiting use has, the connection is dropped, so an
 * Allow clicked later attaches to nothing.
 */

import { ChromeLoginError, connectCdp, type CdpConnection } from './chromeLogin.js'

export interface SharedChrome {
  /** A lease on the one connection to `endpoint`: the open one, the one being opened, or a new one. */
  connect(endpoint: string, timeoutMs: number, signal?: AbortSignal): Promise<CdpConnection>
  /** Connections opened so far (Chrome's Allow asked each time). */
  opened(): number
  /** Close the connection: the server stops. A lease taken after this fails. */
  close(): void
}

type Connect = (endpoint: string, timeoutMs: number, signal?: AbortSignal) => Promise<CdpConnection>

interface Current {
  endpoint: string
  connection: Promise<CdpConnection>
  /** The connection once opened: its state is read to tell one Chrome closed. */
  open: CdpConnection | null
  /** Uses waiting for Chrome's answer; when the last one lets go, the connect is dropped. */
  waiting: number
  drop: AbortController
}

export function sharedChrome(connect: Connect | undefined = connectCdp): SharedChrome {
  const open = connect ?? connectCdp
  let current: Current | null = null
  let opened = 0
  let closed = false
  const gone = (connection: CdpConnection | null) => connection !== null && connection.isClosed?.() === true

  const start = (endpoint: string, timeoutMs: number): Current => {
    const drop = new AbortController()
    const entry: Current = { endpoint, connection: open(endpoint, timeoutMs, drop.signal), open: null, waiting: 0, drop }
    entry.connection.then((connection) => {
      opened++
      if (current === entry) entry.open = connection
      // Opened after the server stopped, or after every use let go: not kept.
      if (closed || current !== entry) connection.close()
    }, () => { if (current === entry) current = null })
    return entry
  }

  return {
    async connect(endpoint, timeoutMs, signal) {
      if (closed) throw new ChromeLoginError('Octocrawl is shutting down')
      if (signal?.aborted === true) throw new ChromeLoginError('the connection to Chrome was cancelled')
      // Another Chrome (a restart writes a new endpoint), or this one closed: connect again.
      if (current !== null && (current.endpoint !== endpoint || gone(current.open))) {
        current.open?.close()
        current.drop.abort()
        current = null
      }
      const entry = current ??= start(endpoint, timeoutMs)
      entry.waiting++
      let connection: CdpConnection
      try {
        connection = await new Promise<CdpConnection>((resolve, reject) => {
          const cancel = () => reject(new ChromeLoginError('the connection to Chrome was cancelled'))
          signal?.addEventListener('abort', cancel, { once: true })
          entry.connection.then(resolve, reject).finally(() => signal?.removeEventListener('abort', cancel))
        })
      } catch (error) {
        // The last use waiting for Chrome's Allow let go: drop the connect, so a later Allow attaches to nothing.
        if (entry.open === null && --entry.waiting === 0 && current === entry) { current = null; entry.drop.abort() }
        throw error
      }
      entry.waiting = Math.max(0, entry.waiting - 1)
      if (closed) throw new ChromeLoginError('Octocrawl is shutting down')
      return lease(connection)
    },
    opened: () => opened,
    close() {
      closed = true
      current?.open?.close()
      current?.drop.abort()
      current = null
    },
  }
}

/** A use of the connection: its listeners end with it; the connection stays. */
function lease(connection: CdpConnection): CdpConnection {
  const stops = new Set<() => void>()
  let released = false
  return {
    send(method, params, sessionId, timeoutMs) {
      if (released) return Promise.reject(new ChromeLoginError('Chrome closed the connection'))
      return connection.send(method, params, sessionId, timeoutMs)
    },
    ...(connection.on === undefined ? {} : {
      on(method: string, sessionId: string | undefined, listener: (params: Record<string, unknown>) => void) {
        const stop = connection.on!(method, sessionId, listener)
        const wrapped = () => { stops.delete(wrapped); stop() }
        stops.add(wrapped)
        return wrapped
      },
    }),
    isClosed: () => released || connection.isClosed?.() === true,
    close() {
      released = true
      for (const stop of [...stops]) stop()
    },
  }
}
