import { toolSection } from './toolSections'

// A synthetic HTML fragment converted locally on 2026-10-16 at bc47bf0. This is a converter example,
// not a capture of example.com or evidence that an arbitrary page's main region will be extracted.
export const EXAMPLE_HTML = '<h1>Project notes</h1><p>Read the <a href="/guide">guide</a>.</p><table><tr><th>Item</th><th>Count</th></tr><tr><td>Pages</td><td>3</td></tr></table><pre><code>print("ready")</code></pre>'
export const EXAMPLE_MARKDOWN = '# Project notes\n\nRead the [guide](https://example.com/guide).\n\n| Item | Count |\n| --- | --- |\n| Pages | 3 |\n\n```\nprint("ready")\n```'
export const EXAMPLE_TEXT = 'Project notes\n\nRead the guide.\n\nItem\tCount\nPages\t3\n\nprint("ready")\n'

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function conversionExample(format: 'markdown' | 'text'): string {
  const markdown = format === 'markdown'
  return toolSection('output-example', 'OUTPUT EXAMPLE', markdown ? 'What the Markdown keeps.' : 'What plain text leaves out.', `
    <p>Synthetic HTML fragment, converted locally on 16 October 2026 with <code>https://example.com/</code> as the link base. This is a format example, not a live website capture.</p>
    <details><summary>HTML input</summary><pre class="tl-example"><code>${escape(EXAMPLE_HTML)}</code></pre></details>
    <h3>${markdown ? 'Markdown output' : 'Plain-text output'}</h3>
    <pre class="tl-example"><code>${escape(markdown ? EXAMPLE_MARKDOWN : EXAMPLE_TEXT)}</code></pre>
    <p>${markdown ? 'The heading keeps its #, the link keeps its address, the table keeps its columns, and code keeps its fences.' : 'The heading loses its #, the link keeps its words and loses its address, table cells use tabs, and code keeps its text without fences.'} ${markdown ? '<a href="/tools/website-to-text/#output-example">Compare the same input as plain text</a>.' : '<a href="/tools/url-to-markdown/#output-example">Compare the same input as Markdown</a>.'}</p>
    <p>A different page can extract differently. Review missing sections and result states before using the output; <a href="/docs/limits/">see the limits</a>.</p>`)
}
