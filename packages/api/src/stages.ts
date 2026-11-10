import type { TraceEvent } from '@w2l/contracts'

/**
 * What a scrape has got to while it runs, for a caller that shows progress: robots.txt was read (`allowed` false
 * when it disallows the page, with `unreachable` when it could not be read, which counts as a disallow; `overridden`
 * when it disallows the page and the page is fetched all the same, on the record, as a local server does for a URL
 * the request names), then the page's body was received and parsed. `page` does not mean the page was read: a
 * challenge page or an empty shell is still refused after it, and only the result says. Only the HTTP lane reports
 * them, so a scrape that starts in a browser tells none; any step may never come. The robots stage is the first
 * check's alone: when an https URL is read again over http (a site with no HTTPS), that second read checks robots.txt
 * for itself and is not told, so a page can follow a refusal, and a refusal an override.
 */
export type ScrapeStage = { stage: 'robots'; allowed: boolean; unreachable?: true; overridden?: true } | { stage: 'page' }

/**
 * A listener for a scrape's `onTrace` (ExecutionContext) that tells `onStage` each stage once, in order:
 * `engine.scrape(request, { onTrace: scrapeStages(onStage) })`. The result's trace stays the record; this only says
 * early what it will hold, and an `onStage` that throws changes nothing.
 *
 * A disallow is told at the end of the turn that recorded it, not at once: the lane records an override right
 * after the disallow, in the same turn, and the stage has to say which of the two it was.
 */
export function scrapeStages(onStage: (stage: ScrapeStage) => void): (event: TraceEvent) => void {
  let robotsTold = false
  let pageTold = false
  let overridden = false
  const tell = (stage: ScrapeStage): void => { try { onStage(stage) } catch { /* Progress is advisory. */ } }
  return (event) => {
    if (event.event === 'robots_overridden') { overridden = true; return }
    if (event.event === 'robots_checked' && !robotsTold) {
      robotsTold = true
      const unreachable = event.detail?.unreachable === undefined ? {} : { unreachable: true as const }
      if (event.detail?.decision !== 'disallowed') { tell({ stage: 'robots', allowed: true }); return }
      queueMicrotask(() => tell({ stage: 'robots', allowed: overridden, ...unreachable, ...(overridden ? { overridden: true as const } : {}) }))
      return
    }
    if (event.event === 'extract' && !pageTold) { pageTold = true; tell({ stage: 'page' }) }
  }
}
