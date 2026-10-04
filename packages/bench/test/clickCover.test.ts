import { describe, expect, it } from 'vitest'
import { coverOf } from '../src/subjects/browserActions.js'

/**
 * Reading what covers a control from a trial click's call log, as Playwright
 * writes it: dimmed by colour codes in a terminal that takes colour, and with
 * "not stable" checks while it scrolls a smooth-scrolling page.
 */

const log = (lines: string[], dim = false) => Object.assign(new Error(['locator.click: Timeout 5000ms exceeded.', 'Call log:', ...lines.map((line) => dim ? `\u001b[2m  - ${line}\u001b[22m` : `  - ${line}`)].join('\n')), { name: 'TimeoutError' })
const COVER = '<div class="tp-modal">…</div> intercepts pointer events'

describe('the cover a trial click saw', () => {
  it('is read through the colour codes a terminal adds', () => {
    expect(coverOf(log(['element is visible, enabled and stable', COVER, 'retrying click action', COVER], true))).toEqual({ last: COVER, whole: COVER })
  })

  it('counts a check that found the control moving as neither covered nor reachable', () => {
    expect(coverOf(log([COVER, 'element is not stable', COVER, 'element is not stable']))).toEqual({ last: COVER, whole: COVER })
  })

  it('is not whole when a check found the control hidden, and none when the last check did', () => {
    expect(coverOf(log(['element is not visible', COVER]))).toEqual({ last: COVER, whole: null })
    expect(coverOf(log([COVER, 'element is not visible']))).toEqual({ last: null, whole: null })
    expect(coverOf(log(['waiting for locator(\'#go\')']))).toEqual({ last: null, whole: null })
  })
})
