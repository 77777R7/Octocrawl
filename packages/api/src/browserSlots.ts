/**
 * The pages a server renders in a browser at once (`browserPagesAtOnce`). A worker whose page needs the browser waits for
 * one of the slots while HTTP pages flow on the other workers: a browser page takes about 115 MiB and a share of a core, an
 * HTTP page neither, so a hosted job slice reads 8 pages at once and renders 2 of them (hostedJobRoutes.ts). The slot is
 * taken in the rung's admission, just before it starts, and given back when its read is settled, so a page HTTP read
 * takes none.
 */
import type { Channel, ChannelAdmission } from '@w2l/bench'

export interface BrowserSlots {
  readonly size: number
  /** A slot, when one is free; the release gives it back once, however often it is called. A cancelled wait rejects with the signal's reason. */
  acquire(signal?: AbortSignal): Promise<() => void>
}

export function browserSlots(size: number): BrowserSlots {
  const total = Math.max(1, Math.floor(size))
  let free = total
  type Waiter = { grant: () => void; signal: AbortSignal | undefined; onAbort: () => void }
  const waiting: Waiter[] = []
  const wake = (): void => {
    while (free > 0 && waiting.length > 0) {
      const next = waiting.shift()!
      next.signal?.removeEventListener('abort', next.onAbort)
      free--
      next.grant()
    }
  }
  const releaser = (): (() => void) => {
    let given = false
    return () => { if (given) return; given = true; free++; wake() }
  }
  return {
    size: total,
    acquire(signal) {
      if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('The browser slot wait was aborted', 'AbortError'))
      if (free > 0) { free--; return Promise.resolve(releaser()) }
      return new Promise<() => void>((resolve, reject) => {
        const waiter: Waiter = {
          grant: () => resolve(releaser()),
          signal,
          onAbort: () => {
            const at = waiting.indexOf(waiter)
            if (at >= 0) waiting.splice(at, 1)
            reject(signal?.reason ?? new DOMException('The browser slot wait was aborted', 'AbortError'))
          },
        }
        waiting.push(waiter)
        signal?.addEventListener('abort', waiter.onAbort, { once: true })
      })
    },
  }
}

const ADMITTED: ChannelAdmission = { ok: true, settle: async () => {} }

/** The rungs that run a browser (`waitsFor`) each taking a slot before they start, after their own admission is asked; the others as they are. */
export function withBrowserSlots(channels: readonly Channel[], slots: BrowserSlots): Channel[] {
  return channels.map((channel) => channel.waitsFor !== true ? channel : {
    ...channel,
    admit: async (url, execution) => {
      const release = await slots.acquire(execution.signal)
      let own: ChannelAdmission
      try { own = channel.admit === undefined ? ADMITTED : await channel.admit(url, execution) }
      catch (error) { release(); throw error }
      if (!own.ok) { release(); return own }
      return { ...own, settle: async (result, called) => { try { return await own.settle(result, called) } finally { release() } } }
    },
  })
}
