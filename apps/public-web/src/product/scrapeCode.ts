/** From your code on /scrape/: the request that read the Wikipedia page (scrapeRun.ts), in five ways. Pure functions
 * for the snippets, so they are tested without a page; mountScrapeCode puts them on it. */
import { HOSTED_API, HOSTED_MCP, LOCAL_API, shellQuote } from '../getCode'
import { track } from '../analytics'
import { WIKIPEDIA_REQUEST } from './scrapeRun'

export type Lang = 'curl' | 'mcp' | 'cli' | 'ts' | 'py'

/** A JSON value as a Python literal. */
function py(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (Array.isArray(value)) return `[${value.map(py).join(', ')}]`
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${py(v)}`).join(', ')}}`
  return JSON.stringify(value)
}

export function scrapeSnippet(lang: Lang): string {
  const { url, formats } = WIKIPEDIA_REQUEST
  if (lang === 'curl') {
    return [`curl -sS -X POST ${HOSTED_API}/v1/scrape \\`, `  -H 'content-type: application/json' \\`, `  -d ${shellQuote(JSON.stringify(WIKIPEDIA_REQUEST))}`].join('\n')
  }
  if (lang === 'mcp') {
    return [`claude mcp add --transport http octocrawl ${HOSTED_MCP}`, '', '# Then ask your agent:', `Use Octocrawl's scrape tool on ${url} and return its Markdown, its links, its tables and these fields: kingdom, phylum, class, order.`].join('\n')
  }
  if (lang === 'cli') return `npx octocrawl scrape ${shellQuote(url)} --formats ${shellQuote(JSON.stringify(formats))}`
  if (lang === 'ts') {
    return [`import { W2L } from '@octocrawl/sdk'`, '', `// npx octocrawl serve runs the API on your computer`, `const client = new W2L({ baseUrl: '${LOCAL_API}' })`, `const page = await client.scrape('${url}', { formats: ${JSON.stringify(formats)} })`, `console.log(page.markdown, page.json?.data, page.evidenceRecord.rawSha256)`].join('\n')
  }
  return [`import octocrawl_client  # pip install octocrawl-client; npx octocrawl serve`, '', 'page = octocrawl_client.scrape(', `    ${JSON.stringify(url)},`, `    formats=${py(formats)},`, ')', `print(page["markdown"], page["json"]["data"], page["evidenceRecord"]["rawSha256"])`].join('\n')
}

const NOTES: Record<Lang, string> = {
  curl: 'Hosted, no key needed for 20 pages a day; add <code>-H \'authorization: Bearer &lt;key&gt;\'</code> for an account’s credits. On your computer: <code>npx octocrawl serve</code>, then <code>http://127.0.0.1:8787</code>.',
  mcp: 'Claude Code shown; <a href="/docs/connect-mcp/">Connect MCP</a> has the line for Cursor, Codex and OpenCode. For an Amazon.sg product, the <code>scrape_product</code> tool sends the product schema for you.',
  cli: 'Runs on your own computer with Node.js 22.13 or later, no limit. It prints the result as JSON.',
  ts: '<code>npm install @octocrawl/sdk</code>. The client also crawls, maps and batches.',
  py: 'The Python client of a running API, with pandas support for batches.',
}

export function mountScrapeCode(section: HTMLElement): void {
  const code = section.querySelector<HTMLElement>('#cd-code code')
  const pane = section.querySelector<HTMLElement>('#cd-code')
  const note = section.querySelector<HTMLElement>('#cd-note')
  const copy = section.querySelector<HTMLButtonElement>('#cd-copy')
  const tabs = [...section.querySelectorAll<HTMLButtonElement>('.cd-tab')]
  if (!code || !pane) return
  let lang: Lang = 'curl'
  const render = (): void => {
    code.textContent = scrapeSnippet(lang)
    if (note) note.innerHTML = NOTES[lang]
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      lang = tab.dataset.lang as Lang
      tabs.forEach((t) => {
        t.setAttribute('aria-selected', String(t === tab))
        t.tabIndex = t === tab ? 0 : -1
      })
      pane.setAttribute('aria-labelledby', tab.id)
      render()
    })
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      const next = tabs[(i + step + tabs.length) % tabs.length]!
      next.click()
      next.focus()
    })
  })
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? '')
      track('docs_code_copy', { tab: lang })
      copy.textContent = 'Copied'
    } catch { copy.textContent = 'Select to copy' }
    window.setTimeout(() => { copy.textContent = 'Copy' }, 1800)
  })
  render()
}
