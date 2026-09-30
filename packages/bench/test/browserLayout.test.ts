import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureLayout } from '../src/browserLayout.js'

let browser: Browser
let page: Page

beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage()
})

afterAll(async () => {
  await browser.close()
})

const PAGE =
  '<!doctype html><html><head><style>.block { display: block } .flex { display: flex } .gone { display: none } .sr { position: absolute; width: 1px; overflow: hidden }</style></head><body>' +
  '<div><span class="block">One</span><span>two</span><a class="flex" href="#x">Three</a><span style="display: inline-block">four</span><span class="sr">five</span></div>' +
  '<p>Open <span class="gone">Terminal</span><span hidden>Git Bash</span>.</p>' +
  '<div class="gone"><span class="block">Footnote</span><span class="gone">x</span></div><span class="gone"><div>Popup</div></span><script>void 0</script></body></html>'

describe('captureLayout', () => {
  it('marks CSS blocks and hidden inline content in a copy, and leaves the page as it was', async () => {
    await page.setContent(PAGE)
    const body = await page.content()
    const layout = await captureLayout(page, body)
    expect(layout.detail).toMatchObject({ outcome: 'annotated', elements: 15, blocks: 3, hidden: 3 })
    expect(layout.html).toContain('<span class="block" data-w2l-display="block">One</span><span>two</span><a class="flex" href="#x" data-w2l-display="block">Three</a>')
    // Inline-block and out-of-flow boxes stay inline.
    expect(layout.html).toContain('<span style="display: inline-block">four</span><span class="sr">five</span>')
    expect(layout.html).toContain('<p>Open <span class="gone" data-w2l-hidden="">Terminal</span><span hidden="" data-w2l-hidden="">Git Bash</span>.</p>')
    // A hidden block keeps its content, marked by its own layout.
    expect(layout.html).toContain('<div class="gone"><span class="block" data-w2l-display="block">Footnote</span><span class="gone" data-w2l-hidden="">x</span></div><span class="gone"><div>Popup</div></span>')
    // The copy is the evidence plus the markers, and the live page keeps none of them.
    expect(layout.html!.replace(/ data-w2l-(?:display="block"|hidden="")/g, '')).toBe(body)
    expect(await page.content()).toBe(body)
  })

  it('falls back to the unannotated page and records why', async () => {
    await page.setContent(PAGE)
    const body = await page.content()
    expect(await captureLayout(page, body, { maxElements: 14 })).toMatchObject({ html: null, detail: { outcome: 'element_cap', elements: 15 } })
    expect(await captureLayout(page, `${body} `)).toMatchObject({ html: null, detail: { outcome: 'dom_changed' } })
    await page.setContent(`<div>${'<b>x</b>'.repeat(400)}</div>`)
    expect(await captureLayout(page, await page.content(), { maxMs: 0 })).toMatchObject({ html: null, detail: { outcome: 'time_cap' } })
    await page.setContent('<p data-w2l-hidden>A page that uses the marker name itself</p>')
    expect(await captureLayout(page, await page.content())).toMatchObject({ html: null, detail: { outcome: 'marker_conflict' } })
    expect(await captureLayout(page, body, { deadlineAt: Date.now() })).toMatchObject({ html: null, detail: { outcome: 'deadline' } })
  })
})
