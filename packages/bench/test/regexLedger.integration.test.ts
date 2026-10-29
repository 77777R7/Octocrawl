import { describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { currentRegexLedger, verify, withRegexLedger, type RegexStats } from '@w2l/runtime'

/**
 * A browser shared by requests is launched outside them, as the browser lane's is (once, by whichever request came
 * first): the partial judgements a request makes after its page reads still charge that request's ledger, and only it.
 */
describe("a request's regular-expression ledger across a shared browser (ADR 0006, amendment of 2026-10-29)", () => {
  it('charges each of two concurrent requests its own reads, and is not what a page event sees', async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent('<p>read</p>')
      const heard: unknown[] = []
      page.on('console', () => { heard.push(currentRegexLedger()) })
      const seen: RegexStats[] = []
      const request = (reads: number) => withRegexLedger(async () => {
        for (let i = 0; i < reads; i++) {
          const text = await page.evaluate((n) => { console.log('read', n); return `${document.body.innerText} ${n}` }, i)
          verify({ checks: [{ type: 'markdownMatches', pattern: `read ${i}$` }] }, { status: 'success', markdown: text }, { partial: true })
        }
      }, (stats) => { seen.push(stats) })
      await Promise.all([request(3), request(5)])
      expect(seen.map((stats) => stats.scans).sort()).toEqual([3, 5])
      // A listener runs in the store of whoever made the page (here none), never in a request's: the ledger is not read there.
      expect(heard.length).toBeGreaterThan(0)
      expect(heard.every((ledger) => ledger === undefined)).toBe(true)
    } finally {
      await browser.close()
    }
  }, 60_000)
})
