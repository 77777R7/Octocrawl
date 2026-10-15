import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'

const card = (id: string, caption: string, media = `<video src="/clip-${id}.mp4"></video>`) =>
  `<article class="clip">${media}<a href="/author/${id}">${id}</a><p>${caption}</p></article>`
const cards = card('Ada', 'Glass sculpture') + card('Bo', 'Clay carving')
const page = (body: string) => `<!doctype html><html><head><title>Video feed</title></head><body><nav><a href="/help">Help menu</a></nav>${body}</body></html>`

describe('a sparse media feed with no article prose', () => {
  it('keeps two distinct semantic video articles in main as list content', () => {
    const out = extractTf.extract(page(`<main><div>${cards}</div></main>`), { url: 'https://example.com/' })
    expect(out.strategy).toBe('list')
    expect(out.escalate).toBe(false)
    expect(out.lastResort).toBe(true)
    const markdown = htmlToMarkdown(out.mainHtml, { baseUrl: 'https://example.com/' })
    expect(markdown).toContain('Glass sculpture')
    expect(markdown).toContain('Clay carving')
    expect(markdown).toContain('https://example.com/author/Ada')
    expect(markdown).not.toContain('Help menu')
  })

  it('does not relax ordinary two-card, single-video, duplicate or navigation-only fallbacks', () => {
    for (const body of [
      `<main><div>${card('Ada', 'Glass sculpture', '')}${card('Bo', 'Clay carving', '')}</div></main>`,
      `<main><div>${card('Ada', 'Glass sculpture')}</div></main>`,
      `<main><div>${card('Ada', 'Glass sculpture', '<video src=""></video>')}${card('Bo', 'Clay carving', '<video></video>')}</div></main>`,
      `<main><div>${card('Ada', 'Glass sculpture')}${card('Ada', 'Glass sculpture')}</div></main>`,
      `<div>${cards}</div>`,
      `<main><nav><div>${cards}</div></nav></main>`,
      `<main><div aria-roledescription="carousel">${cards}</div></main>`,
      `<main><h1>Sign in</h1><div>${cards}</div></main>`,
    ]) expect(extractTf.extract(page(body)).strategy, body).not.toBe('list')
  })

  it('still honours explicit selections and exclusions ahead of inferred media content', () => {
    const html = page(`<main><div>${cards}</div><section id="chosen"><p>The user chose this.</p></section></main>`)
    const out = extractTf.extract(html, { includeSelectors: ['#chosen'] })
    expect(out.mainHtml).toContain('The user chose this.')
    expect(out.mainHtml).not.toContain('Glass sculpture')
    const excluded = extractTf.extract(page(`<main><div>${cards}</div></main>`), { pruneSelectors: ['article'] })
    expect(excluded.mainHtml).not.toContain('Glass sculpture')
    expect(excluded.mainHtml).not.toContain('Clay carving')
  })
})
