import type { ScrapeStage, TraceEvent } from '@w2l/contracts'

export type { ScrapeStage }

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
