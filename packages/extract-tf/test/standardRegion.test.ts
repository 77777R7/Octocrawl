import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown } from '../src/index.js'

// Synthetic counterparts of the retained RFC/WCAG failures: the page header
// and numbered chapters are body siblings, without an article/main wrapper.
function standardDocument(tag: 'div' | 'section' = 'section'): string {
  const chapter = (n: number) => `<${tag} id="chapter-${n}"><h2>${n}. Requirement ${n}</h2>${Array.from({ length: 3 }, (_, i) => `<p>Requirement ${n}, paragraph ${i + 1}: implementations MUST preserve the declared unit and the observation date when returning a measured value.</p>`).join('')}</${tag}>`
  return `<!doctype html><html><head><title>Measurement standard</title></head><body>
<nav><a href="/">Home</a><a href="/plans">Plans</a></nav>
<div><h1>Measurement standard</h1><p>Recommendation <time>12 December 2024</time></p><dl><dt>Authors</dt><dd>A. Writer; B. Editor</dd></dl></div>
${[1, 2, 3].map(chapter).join('')}
<${tag} id="appendix"><h2>Appendix A. Grammar and glossary</h2><div><pre>${'measurement = value unit date; rule\n'.repeat(25)}</pre></div></${tag}>
<footer><p>Unrelated company footer and promotional messages.</p></footer>
</body></html>`
}

const markdown = (html: string, options = {}) => htmlToMarkdown(extractTf.extract(html, options).mainHtml)

describe('sibling chapters in a document', () => {
  it.each(['div', 'section'] as const)('retains the header and normative chapters beside a long appendix (%s)', (tag) => {
    const md = markdown(standardDocument(tag))
    for (const value of ['Measurement standard', 'Recommendation', '12 December 2024', 'A. Writer; B. Editor', 'Requirement 1, paragraph 1', 'Requirement 3, paragraph 3', 'Grammar and glossary']) expect(md).toContain(value)
    expect(md).not.toContain('Plans')
    expect(md).not.toContain('Unrelated company footer')
  })

  it('does not promote unnumbered competing regions to the whole body', () => {
    const md = markdown(standardDocument().replace(/<h2>\d\. /g, '<h2>'))
    expect(md).not.toContain('Recommendation')
    expect(md).toContain('measurement = value unit date')
  })

  it('does not treat numbered independent articles as chapters', () => {
    const html = standardDocument().replace(/<section/g, '<article').replace(/<\/section>/g, '</article>')
    expect(markdown(html)).not.toContain('Recommendation')
  })

  it('requires a page heading preceding the chapter sequence', () => {
    for (const html of [standardDocument().replace(/<h1>.*?<\/h1>/, ''), standardDocument().replace('<h1>Measurement standard</h1>', '').replace('</body>', '<h1>Late unrelated title</h1></body>')]) expect(markdown(html)).not.toContain('Recommendation')
  })

  it('does not promote an incomplete or out-of-order sequence', () => {
    for (const html of [standardDocument().replace('<h2>3.', '<h2>4.'), standardDocument().replace('<h2>2.', '<h2>4.')]) expect(markdown(html)).not.toContain('Recommendation')
  })

  it('keeps a final references chapter whose short linked entries are not prose blocks', () => {
    const html = standardDocument().replace('<section id="appendix">', '<section><h2>4. References</h2><dl><dt><a href="/ref">Reference</a></dt><dd>ABC</dd></dl></section><section id="appendix">')
    expect(markdown(html)).toContain('Recommendation')
    expect(markdown(html)).toContain('4. References')
  })

  it('requires three substantive chapters holding most of the classified text', () => {
    const sparse = standardDocument().replace(/<p>Requirement 3,[\s\S]*?<\/p>/g, '')
    const appendixDominates = standardDocument().replace('measurement = value unit date; rule\n', 'An unrelated appendix contains most of this page. '.repeat(100))
    for (const html of [sparse, appendixDominates]) expect(markdown(html)).not.toContain('Recommendation')
  })

  it('continues to prefer an explicit article over unrelated sections', () => {
    const article = `<article><h1>Independent article</h1>${'<p>This independent report records a different measurement and explains how the station equipment was calibrated.</p>'.repeat(40)}</article>`
    const md = markdown(standardDocument().replace('</body>', article + '</body>'))
    expect(md).toContain('Independent article')
    expect(md).not.toContain('Recommendation')
    expect(md).not.toContain('Requirement 1')
  })

  it('honors explicit inclusion and exclusion instead of restoring excluded chapters', () => {
    const html = standardDocument()
    const included = markdown(html, { includeSelectors: ['#chapter-2'] })
    expect(included).toContain('Requirement 2, paragraph 1')
    expect(included).not.toContain('Recommendation')
    expect(included).not.toContain('Requirement 1')
    const excluded = markdown(html, { pruneSelectors: ['#appendix'] })
    expect(excluded).toContain('Recommendation')
    expect(excluded).toContain('Requirement 3, paragraph 3')
    expect(excluded).not.toContain('measurement = value unit date')
  })
})
