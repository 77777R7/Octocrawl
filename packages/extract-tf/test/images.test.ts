import { describe, expect, it } from 'vitest'
import { collectImages, srcsetUrls } from '../src/index.js'

const URL_ = 'https://fixture.test/gallery/index.html'

describe('collectImages', () => {
  it('collects img src, every srcset candidate, picture sources, lazy attributes, posters, image_src and og:image, resolved, deduplicated and in document order', () => {
    const html = `<!doctype html><html><head><title>Gallery</title>
<meta property="og:image" content="/og/card.png">
<meta property="og:image" content="/og/card.png">
<meta name="twitter:image" content="https://cdn.fixture.test/tw/card">
<link rel="image_src" href="/link.png"></head><body>
<nav><img src="/logo.svg" alt="Logo"></nav>
<article><h1>Gallery</h1>
<img src="/a.jpg" srcset="/a-480.jpg 480w, /a-960.jpg 960w" alt="A">
<picture><source srcset="/b.avif 1x, /b@2x.avif 2x" type="image/avif"><img src="/b.jpg" alt="B"></picture>
<img data-src="/lazy.jpg" data-srcset="/lazy-1.jpg 1x, /lazy-2.jpg 2x" src="data:image/gif;base64,R0lGOD" alt="Lazy">
<img data-lazy-src="/lazy2.jpg" data-original="https://cdn.fixture.test/images/7f3a" alt="Lazy 2">
<video poster="/poster.png"><source src="/clip.mp4"></video>
<img src="/a.jpg#thumb" alt="A again">
<img src="mailto:x@fixture.test"><img src="javascript:void(0)"><img src=" ">
</article></body></html>`
    const out = collectImages(html, URL_)
    expect(out.images).toEqual([
      'https://fixture.test/og/card.png',
      'https://cdn.fixture.test/tw/card',
      'https://fixture.test/link.png',
      'https://fixture.test/logo.svg',
      'https://fixture.test/a.jpg',
      'https://fixture.test/a-480.jpg',
      'https://fixture.test/a-960.jpg',
      'https://fixture.test/b.avif',
      'https://fixture.test/b@2x.avif',
      'https://fixture.test/b.jpg',
      'https://fixture.test/lazy.jpg',
      'https://fixture.test/lazy-1.jpg',
      'https://fixture.test/lazy-2.jpg',
      'https://fixture.test/lazy2.jpg',
      'https://cdn.fixture.test/images/7f3a',
      'https://fixture.test/poster.png',
    ])
    expect(out).toMatchObject({ srcsetCandidates: 6, lazy: 5, dataUrisDropped: 1 })
    expect(out.images.every((url) => url.startsWith('https://') && !url.includes('#'))).toBe(true)
  })

  it('resolves against <base href>, and gives [] for a page without images or without a base', () => {
    const html = '<!doctype html><html><head><base href="https://cdn.fixture.test/v2/"></head><body><img src="img/kiln.png" alt="Kiln"></body></html>'
    expect(collectImages(html, URL_).images).toEqual(['https://cdn.fixture.test/v2/img/kiln.png'])
    expect(collectImages('<html><body><p>No pictures.</p></body></html>', URL_)).toEqual({ images: [], srcsetCandidates: 0, lazy: 0, dataUrisDropped: 0 })
    expect(collectImages('<img src="/a.png">', 'not a url').images).toEqual([])
  })

  it('reads srcset as HTML does: descriptors dropped, a comma that ends a URL ends the candidate, one inside a URL stays', () => {
    expect(srcsetUrls('/a.jpg 1x, /b.jpg 2x')).toEqual(['/a.jpg', '/b.jpg'])
    expect(srcsetUrls('/a.jpg, /b.jpg')).toEqual(['/a.jpg', '/b.jpg'])
    // Without whitespace the comma is part of the URL, as a browser reads it.
    expect(srcsetUrls('/a.jpg,/b.jpg')).toEqual(['/a.jpg,/b.jpg'])
    expect(srcsetUrls(' /a.jpg 480w ,\n/b.jpg 960w ')).toEqual(['/a.jpg', '/b.jpg'])
    expect(srcsetUrls('data:image/png;base64,iVBORw0KGgo= 1x, /b.jpg 2x')).toEqual(['data:image/png;base64,iVBORw0KGgo=', '/b.jpg'])
    expect(srcsetUrls(null)).toEqual([])
  })
})
