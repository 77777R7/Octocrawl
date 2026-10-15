import { describe, expect, it } from 'vitest'
import type { FetchOptions } from '@w2l/contracts'
import { pageFromUserBrowser } from '../src/subjects/userBrowserPage.js'
import { verify } from '@w2l/runtime'
import { contentSelectors, contentSelectionEvent, MAX_TASK_SELECTION_HTML } from '../src/subjects/errorPage.js'

// Synthetic counterpart of the TikTok capture: a prose candidate beside the
// records the task names. No captured page or personal feed is committed.
const html = `<html><head><title>A feed</title><base href="https://feed.test/"></head><body>
<nav><a href="/explore">Explore the site</a></nav>
<article id="intro"><h1>About the feed</h1>${'<p>This introduction describes how the service works and how readers discover content on the site.</p>'.repeat(8)}</article>
<section id="feed">
<article class="video"><a class="author" href="/@one">Author One</a><p class="description">First video caption</p></article>
<article class="video excluded"><a class="author" href="/@two">Author Two</a><p class="description">Second video caption</p></article>
</section></body></html>`
const list = { type: 'list', itemSelector: 'section#feed > article.video', fields: [
  { name: 'description', selector: '.description' },
  { name: 'author', selector: 'a.author' },
  { name: 'authorUrl', selector: 'a.author', attribute: 'href' },
] } as const
const read = (options: FetchOptions = {}) => pageFromUserBrowser({
  requestedUrl: 'https://feed.test/', finalUrl: 'https://feed.test/', status: 200,
  contentType: 'text/html', html, fetchedAt: '2026-10-15T05:00:00Z', wallMs: 10,
  sawGate: null, act: null, browser: 'offline replay',
}, null, options)

describe('content chosen by an explicit list task', () => {
  it('bounds the additional candidate selection without overriding a caller\'s own region', () => {
    expect(contentSelectors({ list }, MAX_TASK_SELECTION_HTML)).toEqual([list.itemSelector])
    expect(contentSelectors({ list }, MAX_TASK_SELECTION_HTML + 1)).toBeUndefined()
    expect(contentSelectionEvent({ list }, 'http', 0, MAX_TASK_SELECTION_HTML + 1)[0]).toMatchObject({ event: 'content_selection_skipped', detail: { reason: 'html_too_large' } })
    expect(contentSelectors({ list, includeTags: ['#intro'] }, MAX_TASK_SELECTION_HTML + 1)).toEqual(['#intro'])
  })

  it('delivers the named records in Markdown and HTML instead of a neighbouring article', () => {
    const result = read({ list, includeHtml: true })
    expect(result.list?.records.map(record => record.values)).toEqual([
      { description: 'First video caption', author: 'Author One', authorUrl: 'https://feed.test/@one' },
      { description: 'Second video caption', author: 'Author Two', authorUrl: 'https://feed.test/@two' },
    ])
    expect(result.markdown).toContain('First video caption')
    expect(result.markdown).toContain('Second video caption')
    expect(result.markdown).not.toContain('About the feed')
    expect(result.markdown).not.toContain('Explore the site')
    expect(result.html).toContain('First video caption')
    expect(result.html).not.toContain('About the feed')
    expect(verify({ checks: [
      { type: 'recordFields', fields: ['description', 'author', 'authorUrl'], min: 2 },
      { type: 'markdownIncludes', text: 'First video caption' },
    ] }, { ...result }).status).toBe('passed')
    expect(result.trace.find(event => event.event === 'content_selected')?.detail).toMatchObject({ basis: 'list_items', itemSelector: list.itemSelector })
  })

  it('keeps an explicit include selection ahead of the inferred list content', () => {
    const result = read({ list, includeTags: ['#intro'] })
    expect(result.markdown).toContain('About the feed')
    expect(result.markdown).not.toContain('First video caption')
    expect(result.list?.records).toEqual([])
  })

  it('does not reintroduce excluded records or fields through the list format', () => {
    const result = read({ list, excludeTags: ['.excluded', '.video .description'] })
    expect(result.markdown).not.toContain('Second video caption')
    expect(result.list?.records).toHaveLength(1)
    expect(result.list?.records[0]).toMatchObject({ values: { description: null, author: 'Author One' }, missing: ['description'] })
  })

  it('honours a whole-page request and leaves ordinary extraction unchanged', () => {
    const whole = read({ list, onlyMainContent: false })
    expect(whole.markdown).toContain('Explore the site')
    expect(whole.markdown).toContain('First video caption')
    expect(read().markdown).toContain('About the feed')
  })
})
