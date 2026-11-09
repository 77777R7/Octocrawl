import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FAQ } from '../src/page'
import { inlineMarkdown, markdownTwins, plain } from '../src/markdownTwin'
import { SCRAPE_FAQ } from '../src/product/scrapePage'
import { TOOL_PAGES } from '../src/tools/pages'
import { toolPageMarkup, toolPagePath } from '../src/tools/toolPage'

// Each Vite-built page's Markdown copy (index.md beside it): the same words as the page, for an agent that asks for
// Markdown, listed in llms.txt from its first two lines.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const twins = new Map(markdownTwins())

describe('the Vite-built pages’ Markdown copies', () => {
  it('cover the home page, /scrape/, /tools/ and every free tool, each opening with a title and a summary', () => {
    expect([...twins.keys()].sort()).toEqual(['index.md', 'scrape/index.md', 'tools/index.md', ...TOOL_PAGES.map(page => `${toolPagePath(page).slice(1)}index.md`)].sort())
    for (const [file, text] of twins) {
      expect([file, /^# .+\n\n> .+\n/.test(text)]).toEqual([file, true])
      // Markdown only: no page markup left outside code (a placeholder such as `<key>` in code is text), and links root-relative, since the server fills the origin only in HTML,
      // XML and text files.
      expect([file, /<\/?[a-z][^>]*>/i.test(text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, ''))]).toEqual([file, false])
      expect(text).not.toContain('__W2L_ORIGIN__')
      for (const [, target] of text.matchAll(/\]\(([^)]+)\)/g)) expect([file, /^(\/|https:\/\/|mailto:)/.test(target!)]).toEqual([file, true])
    }
  })

  it('say what each tool page says: its definition, the same task from an agent, its questions', () => {
    for (const page of TOOL_PAGES) {
      const text = twins.get(`${toolPagePath(page).slice(1)}index.md`)!
      const markup = toolPageMarkup(page)
      expect(text).toContain(`## ${plain(page.definition.question)}`)
      expect(text).toContain(inlineMarkdown(page.definition.answer))
      // The page shows the same definition and the agent's line right under its card.
      expect(markup).toContain(`<h2 id="what-title">${page.definition.question}</h2>`)
      expect(markup).toContain('claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp')
      expect(text).toContain('claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp')
      expect(page.definition.answer).toContain('Octocrawl')
      for (const [question] of page.faq) expect(text).toContain(`### ${plain(question)}`)
    }
    for (const [question] of FAQ) expect(twins.get('index.md')).toContain(`### ${plain(question)}`)
    for (const [question] of SCRAPE_FAQ) expect(twins.get('scrape/index.md')).toContain(`### ${plain(question)}`)
  })

  it('turn the page’s inline markup into Markdown', () => {
    expect(inlineMarkdown('See <a href="/docs/limits/">Limits</a>, run <code>npx octocrawl serve</code>, <em>free</em>&nbsp;&amp; open.')).toBe('See [Limits](/docs/limits/), run `npx octocrawl serve`, *free* & open.')
    expect(inlineMarkdown('<a href="#faq">FAQ</a>', '/tools/')).toBe('[FAQ](/tools/#faq)')
  })

  it('are written by the build, named in each page’s head and listed in llms.txt', () => {
    const vite = readFileSync(app('vite.config.ts'), 'utf8')
    expect(vite).toContain('for (const [fileName, source] of markdownTwins()) this.emitFile')
    expect(vite).toContain('<link rel="alternate" type="text/markdown" href="${page}index.md" />')
    expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain("'## Product and free tools'")
  })
})
