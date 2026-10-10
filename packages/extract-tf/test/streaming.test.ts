import { describe, expect, it } from 'vitest'
import { parse } from '../src/dom.js'
import { extractTf, htmlToMarkdown } from '../src/index.js'
import { resolveReactStreaming } from '../src/streaming.js'

const resolved = (html: string) => {
  const doc = parse(html)
  const applied = resolveReactStreaming(doc.document)
  const body = doc.document.body?.innerHTML ?? ''
  doc.close()
  return { applied, body }
}

describe('resolveReactStreaming (ROADMAP PA item 4)', () => {
  it('moves a streamed segment into its placeholder ($RS)', () => {
    const { applied, body } = resolved('<!doctype html><html><body><main><h1>Profile</h1><template id="P:1"></template></main><div hidden id="S:1"><article>Post one</article><article>Post two</article></div><script>$RS("S:1","P:1")</script></body></html>')
    expect(applied).toBe(1)
    expect(body).toContain('<main><h1>Profile</h1><article>Post one</article><article>Post two</article></main>')
    expect(body).not.toContain('id="S:1"')
    expect(body).not.toContain('id="P:1"')
  })

  it('replaces a boundary\'s fallback with its streamed part, nested boundaries counted ($RC, $RR)', () => {
    const page = (call: string) => `<!doctype html><html><body><main><h1>Council approves library budget</h1><!--$?--><template id="B:0"></template><div class="skeleton">Loading…</div><!--$--><span>inner fallback</span><!--/$--><!--/$--><footer>After</footer></main><div hidden id="S:0"><p>The council approved the budget.</p></div><script>${call}</script></body></html>`
    for (const call of ['$RC("B:0","S:0")', '$RR("B:0","S:0",[["/style.css"]])']) {
      const { applied, body } = resolved(page(call))
      expect(applied, call).toBe(1)
      expect(body, call).toContain('<h1>Council approves library budget</h1><!--$--><p>The council approved the budget.</p><!--/$--><footer>After</footer>')
      expect(body, call).not.toContain('Loading…')
      expect(body, call).not.toContain('inner fallback')
    }
  })

  it('applies the calls in the order the page makes them, a segment streamed into a boundary\'s part', () => {
    // x.com: $RS moves the posts into a placeholder inside S:0, and $RC then moves S:0 into the boundary inside <main>.
    const { applied, body } = resolved('<!doctype html><html><body><main><h1>NASA</h1><!--$?--><template id="B:0"></template><div>Loading…</div><!--/$--></main><div hidden id="S:0"><section><h2>Posts</h2><template id="P:1"></template></section></div><div hidden id="S:1"><article>Brewing up baby stars</article></div><script>$RS("S:1","P:1")</script><script>$RC("B:0","S:0")</script></body></html>')
    expect(applied).toBe(2)
    expect(body).toContain('<main><h1>NASA</h1><!--$--><section><h2>Posts</h2><article>Brewing up baby stars</article></section><!--/$--></main>')
  })

  it('leaves a page alone whose calls name no part in it: one a browser already put together, or a malformed call', () => {
    const together = '<!doctype html><html><body><main><h1>Profile</h1><!--$--><article>Post one</article><!--/$--></main><script>$RC("B:0","S:0");$RS("S:1","P:1")</script></body></html>'
    expect(resolved(together)).toMatchObject({ applied: 0 })
    expect(resolved(together).body).toContain('<article>Post one</article>')
    // A boundary with no marker before it, and a segment that holds its own placeholder, take nothing: the part goes, as React's calls remove it first.
    for (const page of [
      '<!doctype html><html><body><main><template id="B:0"></template></main><div hidden id="S:0"><p>x</p></div><script>$RC("B:0","S:0")</script></body></html>',
      '<!doctype html><html><body><div hidden id="S:1"><template id="P:1"></template><p>x</p></div><script>$RS("S:1","P:1")</script></body></html>',
      '<!doctype html><html><body><div hidden id="S:0"><!--$?--><template id="B:0"></template><p>x</p><!--/$--></div><script>$RC("B:0","S:0")</script></body></html>',
    ]) {
      expect(resolved(page), page).toMatchObject({ applied: 0 })
      expect(resolved(page).body, page).not.toContain('<p>x</p>')
    }
    // A boundary whose sibling before it is an element, not its marker, is left as it is.
    const unmarked = resolved('<!doctype html><html><body><main><span>Kept</span><template id="B:0"></template><p>Also kept</p></main><div hidden id="S:0"><p>Streamed</p></div><script>$RC("B:0","S:0")</script></body></html>')
    expect(unmarked.applied).toBe(0)
    expect(unmarked.body).toContain('<main><span>Kept</span><template id="B:0"></template><p>Also kept</p></main>')
    expect(unmarked.body).not.toContain('Streamed')
    // A script that only defines the functions applies nothing.
    expect(resolved('<!doctype html><html><body><script>$RS=function(a,b){a=document.getElementById(a)}</script></body></html>').applied).toBe(0)
  })

  it('counts every kind of boundary nested in a fallback: completed, pending, errored and queued ($, $?, $!, $~)', () => {
    const { applied, body } = resolved('<!doctype html><html><body><main><!--$?--><template id="B:0"></template><!--$--><i>a</i><!--/$--><!--$?--><template id="B:9"></template><i>b</i><!--/$--><!--$!--><i>c</i><!--/$--><!--$~--><i>d</i><!--/$--><!--/$--><footer>After</footer></main><div hidden id="S:0"><p>Part</p></div><script>$RC("B:0","S:0")</script></body></html>')
    expect(applied).toBe(1)
    expect(body).toContain('<main><!--$--><p>Part</p><!--/$--><footer>After</footer></main>')
  })

  it('applies the calls in their order, and removes a part whose target an earlier call removed, as React does', () => {
    // P:7 sits in B:0's fallback: moved into it first, the late part goes with the fallback; once the fallback is gone, it has nowhere to go.
    const page = (calls: string) => `<!doctype html><html><body><main><h1>Title</h1><!--$?--><template id="B:0"></template><div class="skeleton"><template id="P:7"></template></div><!--/$--></main><div hidden id="S:0"><p>Body</p></div><div hidden id="S:7"><p>Late part</p></div><script>${calls}</script></body></html>`
    const intoFallback = resolved(page('$RS("S:7","P:7");$RC("B:0","S:0")'))
    expect(intoFallback.applied).toBe(2)
    expect(intoFallback.body).toContain('<main><h1>Title</h1><!--$--><p>Body</p><!--/$--></main>')
    expect(intoFallback.body).not.toContain('Late part')
    const afterFallback = resolved(page('$RC("B:0","S:0");$RS("S:7","P:7")'))
    expect(afterFallback.applied).toBe(1)
    expect(afterFallback.body).toContain('<main><h1>Title</h1><!--$--><p>Body</p><!--/$--></main>')
    expect(afterFallback.body).not.toContain('Late part')
    // A boundary nested in a fallback an outer boundary replaced, completed after it (React 19 sends these): its part goes too.
    const nested = resolved('<!doctype html><html><body><main><!--$?--><template id="B:8"></template><div><!--$?--><template id="B:9"></template><i>Loading</i><!--/$--></div><!--/$--></main><div hidden id="S:8"><p>Product</p></div><div hidden id="S:9"><p>Reviews</p></div><script>$RC("B:8","S:8");$RC("B:9","S:9")</script></body></html>')
    expect(nested.applied).toBe(1)
    expect(nested.body).toContain('<main><!--$--><p>Product</p><!--/$--></main>')
    expect(nested.body).not.toContain('Reviews')
  })

  it('finds the first element of an id, as getElementById does', () => {
    const { applied, body } = resolved('<!doctype html><html><body><main><template id="P:1"></template></main><aside><template id="P:1"></template></aside><div hidden id="S:1"><p>Part</p></div><script>$RS("S:1","P:1")</script></body></html>')
    expect(applied).toBe(1)
    expect(body).toContain('<main><p>Part</p></main><aside><template id="P:1"></template></aside>')
  })

  it('reads at most 10,000 calls from a page', () => {
    const { applied } = resolved(`<!doctype html><html><body><main><template id="P:1"></template></main><div hidden id="S:1"><p>Part</p></div><script>${'$RS("x","y");'.repeat(10_000)}$RS("S:1","P:1")</script></body></html>`)
    expect(applied).toBe(0)
  })

  it('stops once the calls have taken four steps per element of the page, leaving no part half moved ($RS, $RC)', () => {
    // Each part holds the placeholder or boundary of the next, completed innermost first: every call moves again what the earlier ones moved.
    const n = 60
    for (const kind of ['S', 'C'] as const) {
      const target = (i: number) => (kind === 'S' ? `<template id="P:${i}"></template>` : `<!--$?--><template id="B:${i}"></template><b>Loading</b><!--/$-->`)
      const segments = Array.from({ length: n }, (_, i) => `<div hidden id="S:${i}"><span>part ${i}</span>${i + 1 < n ? target(i + 1) : ''}</div>`).join('')
      const calls = Array.from({ length: n }, (_, j) => (kind === 'S' ? `$RS("S:${n - 1 - j}","P:${n - 1 - j}");` : `$RC("B:${n - 1 - j}","S:${n - 1 - j}");`)).join('')
      const doc = parse(`<!doctype html><html><body><main>${target(0)}</main>${segments}<script>${calls}</script></body></html>`)
      const applied = resolveReactStreaming(doc.document)
      expect(applied, kind).toBeGreaterThan(0)
      expect(applied, kind).toBeLessThan(n)
      // The parts it did not apply are as the page sent them, their targets and fallbacks in place, and no part's nodes were lost.
      for (let i = 0; i < n - applied; i++) {
        const segment = doc.document.getElementById(`S:${i}`)
        expect(segment?.firstElementChild?.textContent, `${kind} S:${i}`).toBe(`part ${i}`)
        const own = doc.document.getElementById(kind === 'S' ? `P:${i}` : `B:${i}`)
        expect(own, `${kind} target ${i}`).not.toBeNull()
        if (kind === 'C') expect(own?.nextElementSibling?.textContent, `C fallback ${i}`).toBe('Loading')
      }
      expect(doc.document.querySelectorAll('span').length, kind).toBe(n)
      doc.close()
    }
  })

  it('reads a streamed page over HTTP as a browser shows it: the profile and its posts in one <main>', () => {
    const posts = Array.from({ length: 3 }, (_, i) => `<article><p>Post ${i + 1}: Webb used infrared light to peer through the dust in this nebula, revealing many stars of different ages.</p></article>`).join('')
    const html = `<!doctype html><html><body><main><h1>NASA</h1><p>Making the seemingly impossible, possible. 115 Following 89.2M Followers</p><!--$?--><template id="B:0"></template><div>Loading…</div><!--/$--></main><div hidden id="S:0"><section><h2>Posts</h2><template id="P:1"></template></section></div><div hidden id="S:1">${posts}</div><script>$RS("S:1","P:1")</script><script>$RC("B:0","S:0")</script></body></html>`
    const out = extractTf.extract(html, { url: 'https://x.com/NASA' })
    const markdown = htmlToMarkdown(out.mainHtml)
    expect(markdown).toContain('89.2M Followers')
    expect(markdown).toContain('Post 3')
    expect(markdown).not.toContain('Loading…')
  })
})
