/**
 * LadderRunner as a ScrapeAtom. Crawl composes this; it does not rewrite fetch.
 */

import type { ExecutionContext, FetchOptions, ScrapeAtom, ScrapeOutcome } from '@w2l/contracts'
import { LadderRunner } from './routing/ladder.js'

export class LadderScrapeAtom implements ScrapeAtom {
  /** `options` apply to every page this atom scrapes (a batch's or crawl's page options), or are chosen per URL (a batch's recorded robots overrides). */
  constructor(private readonly runner: LadderRunner, private readonly options: FetchOptions | ((url: string) => FetchOptions) = {}) {}

  async scrape(url: string, execution?: ExecutionContext): Promise<ScrapeOutcome> {
    const run = await this.runner.run(url, undefined, execution, typeof this.options === 'function' ? this.options(url) : this.options)
    const robotsTrace = run.result.trace.find((event) => event.event === 'robots_checked')
    const crawlDelayMs = typeof robotsTrace?.detail?.crawlDelayMs === 'number' ? robotsTrace.detail.crawlDelayMs : null
    return {
      result: run.result,
      links: run.result.links ?? [],
      audit: {
        channelsTried: run.channelsTried,
        ladderTrace: run.ladderTrace,
        summary: run.summary,
      },
      crawlDelayMs,
    }
  }

  async close(): Promise<void> {}
}
