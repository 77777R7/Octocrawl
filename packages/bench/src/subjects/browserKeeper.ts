/**
 * A process's browser keeper: one launched Chromium for every public browser rung of the process that asks for one, across
 * the engines that come and go. A hosted job worker builds an engine for each slice and closes it; without a keeper each
 * slice launched Chromium again (about 5 s on Cloud Run) and the slice's first browser page paid for it. The keeper's
 * browser is closed when the process ends, or after `idleMs` without a page, and launched again on the next ask.
 */
import type { Browser } from 'playwright'

export interface BrowserKeeper {
  /** The kept browser, launched with `launch` when none is kept or the kept one died; every caller of one launch gets the same browser. */
  get(launch: () => Promise<Browser>): Promise<Browser>
  /** Close the kept browser, if any; a later `get` launches again. */
  close(): Promise<void>
}

export function browserKeeper(options: { idleMs?: number } = {}): BrowserKeeper {
  let browser: Browser | null = null
  let pending: Promise<Browser> | null = null
  let idle: NodeJS.Timeout | null = null
  const drop = (gone: Browser): void => { if (browser === gone) { browser = null; pending = null } }
  const letGo = async (): Promise<void> => {
    const held = pending
    browser = null
    pending = null
    if (held !== null) await held.then((kept) => kept.close()).catch(() => {})
  }
  /** The idle timer runs from the last ask; it never holds the process open. */
  const touch = (): void => {
    if (idle !== null) clearTimeout(idle)
    idle = null
    if (options.idleMs === undefined) return
    idle = setTimeout(() => { idle = null; void letGo() }, options.idleMs)
    idle.unref()
  }
  return {
    async get(launch) {
      // The idle timer restarts at the ask, so one armed before a relaunch cannot close the browser a caller is about to get.
      touch()
      if (browser !== null && !browser.isConnected()) drop(browser)
      if (browser !== null) return browser
      if (pending === null) {
        const launching: Promise<Browser> = launch().then((launched) => {
          if (pending === launching) { browser = launched; launched.on('disconnected', () => drop(launched)) }
          return launched
        }).catch((error: unknown) => { if (pending === launching) pending = null; throw error })
        pending = launching
      }
      return await pending
    },
    async close() {
      if (idle !== null) { clearTimeout(idle); idle = null }
      await letGo()
    },
  }
}
