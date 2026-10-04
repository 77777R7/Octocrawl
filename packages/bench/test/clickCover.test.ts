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

  it('keeps a try covered through checks that found the control moving, but not one that ends moving', () => {
    expect(coverOf(log(['element is not stable', COVER, 'element is not stable', COVER]))).toEqual({ last: COVER, whole: COVER })
    // The cover gone and the control still moving: the try did not end covered.
    expect(coverOf(log([COVER, COVER, 'element is not stable', 'element is not stable']))).toEqual({ last: null, whole: null })
  })

  it('is not whole when a check found the control hidden, and none when the last check did', () => {
    expect(coverOf(log(['element is not visible', COVER]))).toEqual({ last: COVER, whole: null })
    expect(coverOf(log([COVER, 'element is not visible']))).toEqual({ last: null, whole: null })
    expect(coverOf(log(['waiting for locator(\'#go\')']))).toEqual({ last: null, whole: null })
  })
})
