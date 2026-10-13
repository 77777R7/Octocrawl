import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from '../../../packages/extract-tf/src/markdown.js'
import { markdownToText } from '../src/markdownText'

// Website to Text strips the Markdown the engine's converter writes, which escapes literal * and _ and keeps
// parentheses in link targets; so the cases go through that converter, as a page does.
const text = (html: string): string => markdownToText(htmlToMarkdown(html))

describe('markdownToText', () => {
  it('keeps the words and drops the markup, on the converter’s own Markdown', () => {
    const html = `<article>
      <img src="https://books.toscrape.com/media/a.jpg" alt="A Light in the Attic">
      <h1>A Light in the Attic</h1><p>£51.77</p><hr>
      <p><strong>Warning!</strong> This is a <a href="https://books.toscrape.com/">demo website</a> for <em>scraping</em> and <code>code</code>.</p>
      <h2>Product Information</h2>
      <table><tr><th>UPC</th><td>a897fe39b1053632</td></tr><tr><th>Tax</th><td>£0.00</td></tr></table>
      <ul><li>one</li><li>two</li></ul><blockquote><p>quoted line</p></blockquote>
    </article>`
    const out = text(html)
    for (const kept of ['A Light in the Attic', '£51.77', 'Warning! This is a demo website for scraping and code.', 'Product Information', 'UPC\ta897fe39b1053632', 'Tax\t£0.00', '- one', '- two', 'quoted line']) {
      expect([kept, out.includes(kept)]).toEqual([kept, true])
    }
    for (const gone of ['#', '**', '](', 'https://books.toscrape.com/media/a.jpg', '| ---', '>']) expect([gone, out.includes(gone)]).toEqual([gone, false])
  })

  it('leaves literal asterisks, underscores, code and parenthesised links as written', () => {
    const out = text('<p>See <a href="https://en.wikipedia.org/wiki/Foo_(bar)">Foo</a> after. File __init__.py and 2*3*4 and a * b and _x_ and *y* and https://ex.com/_foo_ path.</p><p><code>__init__</code> and <em>emph</em></p><p><img src="https://x/a(1).png" alt="pic"> img</p>')
    expect(out).toBe('See Foo after. File __init__.py and 2*3*4 and a * b and _x_ and *y* and https://ex.com/_foo_ path.\n\n__init__ and emph\n\nimg\n')
  })

  it('keeps a code block’s lines without its fences, drops page markers, and leaves an empty page empty', () => {
    expect(markdownToText('Run:\n\n```bash\nnpx octocrawl serve # *not* emphasis\n```\n')).toBe('Run:\n\nnpx octocrawl serve # *not* emphasis\n')
    expect(markdownToText('<!-- page 1 -->\n\nDummy PDF file\n')).toBe('Dummy PDF file\n')
    expect(markdownToText('')).toBe('\n')
  })
})
