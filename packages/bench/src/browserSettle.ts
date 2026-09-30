export interface SettlePage {
  evaluate(expression: string): Promise<unknown>
  waitForTimeout(ms: number): Promise<void>
}

export interface SettleOptions {
  maxMs?: number
  minMs?: number
  sampleMs?: number
}

/**
 * Wait for a minimum observation window, then require two equal snapshots of
 * both rendered text and DOM size. A stable loading shell must not finish the
 * wait before the minimum window, while long-polling pages remain bounded.
 * A page that loads another document meanwhile (a script or a meta refresh
 * navigates) is observed afresh, within the same bound.
 */
export async function waitForRenderedStability(
  page: SettlePage,
  options: SettleOptions = {},
): Promise<void> {
  const maxMs = options.maxMs ?? 1_500
  const minMs = Math.min(options.minMs ?? 500, maxMs)
  const sampleMs = options.sampleMs ?? 100
  const deadline = Date.now() + maxMs
  let observedSince = Date.now()
  let previous = ''
  let stableRounds = 0

  while (Date.now() < deadline) {
    let snapshot: unknown
    try {
      snapshot = await page.evaluate(`(() => {
        const root = document.documentElement
        const body = document.body
        return JSON.stringify({
          size: root?.outerHTML.length ?? 0,
          text: body?.innerText ?? '',
        })
      })()`)
    } catch (error) {
      if (!isNavigationError(error)) throw error
      // The document went away mid-sample: the next one starts a new window.
      observedSince = Date.now()
      previous = ''
      stableRounds = 0
      await page.waitForTimeout(Math.min(sampleMs, Math.max(1, deadline - Date.now())))
      continue
    }
    const current = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
    if (current === previous) stableRounds++
    else stableRounds = 0
    previous = current

    if (Date.now() - observedSince >= minMs && stableRounds >= 2) return
    await page.waitForTimeout(Math.min(sampleMs, Math.max(1, deadline - Date.now())))
  }
}

/**
 * Playwright's error for an evaluation or a read the page's own navigation
 * cut off: the document it ran in was replaced while it ran.
 */
export function isNavigationError(error: unknown): boolean {
  return error instanceof Error && /Execution context was destroyed|because of a navigation|page is navigating and changing the content|Cannot find context with specified id/i.test(error.message)
}
