/** How the hero demo shows a page's Markdown: as returned, with its link syntax folded so the content reads. A link
 * shows as its text (its target kept for a tooltip), an image as its alt text, a footnote mark as [a]; the first link
 * to another page stays whole, so one shows what Octocrawl returns. Nothing is reworded or dropped but link targets. */

export type Segment = { text: string; url?: string }

// A link or image, its text holding at most one level of brackets ([[a]], [![alt](src)]) and its target one level of
// parentheses (Order_(biology)).
const LINK = /(!?)\[((?:[^[\]]|\[[^[\]]*\])*)\]\(((?:[^()\s]|\([^()\s]*\))*)\)/g

/** One line's segments. `kept` says whether the whole text's first link has been shown whole yet. */
function foldLine(line: string, state: { kept: boolean }): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const match of line.matchAll(LINK)) {
    const [whole, bang, inner, url] = match
    if (match.index! > at) out.push({ text: line.slice(at, match.index) })
    at = match.index! + whole.length
    if (!bang && !state.kept && /^https?:\/\//.test(url!)) {
      state.kept = true
      out.push({ text: whole })
      continue
    }
    // A link's text may itself hold an image or a footnote mark: fold those too.
    const text = bang ? inner! : inner!.replace(LINK, (_m, _b: string, i: string) => i)
    if (text) out.push({ text, url: url! })
  }
  if (at < line.length) out.push({ text: line.slice(at) })
  return out
}

/** The Markdown's lines as shown, segment by segment. */
export function foldMarkdown(markdown: string): Segment[][] {
  const state = { kept: false }
  return markdown.split('\n').map((line) => foldLine(line, state))
}

/** The same lines as plain text: what the octopus decodes the raw HTML into, cell by cell. */
export const foldedText = (markdown: string): string => foldMarkdown(markdown).map((line) => line.map((s) => s.text).join('')).join('\n')
