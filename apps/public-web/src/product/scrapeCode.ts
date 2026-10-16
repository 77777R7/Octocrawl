/** The call for what the reader chose on /scrape/ (scrapeState.ts), on the page it shows, in five ways. Pure functions
 * for the snippets, so they are tested without a page; mountScrapeCode puts them on it. */
import { HOSTED_API, HOSTED_MCP, LOCAL_API, fieldsSchema, shellQuote } from '../getCode'
import { track } from '../analytics'
import type { Choice } from './scrapeState'

export type Lang = 'curl' | 'mcp' | 'cli' | 'ts' | 'py'

/** The formats a choice asks for: the hero's view, and the fields once the reader has picked some. */
export function scrapeFormats(choice: Choice): unknown[] {
  const schema = fieldsSchema(choice.fields.map((name) => ({ name, type: 'string' as const })))
  const json = schema ? [{ type: 'json', schema }] : []
  if (choice.view === 'fields') return json.length ? json : ['markdown']
  const base = choice.view === 'links' ? ['links'] : choice.view === 'table' ? ['tables'] : ['markdown']
  return choice.fieldsTouched ? [...base, ...json] : base
}

export function scrapeBody(url: string, choice: Choice): Record<string, unknown> {
  return { url, formats: scrapeFormats(choice), ...(choice.whole ? { onlyMainContent: false } : {}) }
}

/** A JSON value as a Python literal. */
function py(value: unknown, indent = ''): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (Array.isArray(value)) return `[${value.map((v) => py(v, indent)).join(', ')}]`
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${py(v, indent)}`).join(', ')}}`
  return JSON.stringify(value)
}

/** What the result holds for the choice, as the SDKs name it. */
function wanted(choice: Choice): { ts: string; py: string; words: string } {
  const formats = scrapeFormats(choice)
  if (formats.some((f) => typeof f === 'object')) return { ts: 'page.json?.data', py: 'page["json"]["data"]', words: `these fields: ${choice.fields.join(', ')}` }
  if (formats[0] === 'links') return { ts: 'page.links', py: 'page["links"]', words: 'its links' }
  if (formats[0] === 'tables') return { ts: 'page.tables?.[0]?.csv', py: 'page["tables"][0]["csv"]', words: 'its tables' }
  return { ts: 'page.markdown', py: 'page["markdown"]', words: 'its readable Markdown' }
}

export function scrapeSnippet(lang: Lang, url: string, choice: Choice): string {
  const body = scrapeBody(url, choice)
  const formats = scrapeFormats(choice)
  const out = wanted(choice)
  if (lang === 'curl') {
    return [`curl -sS -X POST ${HOSTED_API}/v1/scrape \\`, `  -H 'content-type: application/json' \\`, `  -d ${shellQuote(JSON.stringify(body))}`].join('\n')
  }
  if (lang === 'mcp') {
    return [`claude mcp add --transport http octocrawl ${HOSTED_MCP}`, '', '# Then ask your agent:', `Use Octocrawl's scrape tool on ${url}${choice.whole ? ' (the whole page, not only the main content)' : ''} and return ${out.words}.`].join('\n')
  }
  if (lang === 'cli') {
    const flags = formats.length === 1 && formats[0] === 'markdown' ? '--markdown'
      : formats.every((f) => typeof f === 'string') ? `--formats ${formats.join(',')}`
        : `--formats ${shellQuote(JSON.stringify(formats))}`
    return `npx octocrawl scrape ${shellQuote(url)} ${flags}${choice.whole ? ' --no-only-main-content' : ''}`
  }
  if (lang === 'ts') {
    const options = `{ formats: ${JSON.stringify(formats)}${choice.whole ? ', onlyMainContent: false' : ''} }`
    return [`import { W2L } from '@octocrawl/sdk'`, '', `// npx octocrawl serve runs the API on your computer`, `const client = new W2L({ baseUrl: '${LOCAL_API}' })`, `const page = await client.scrape('${url}', ${options})`, `console.log(${out.ts}, page.evidenceRecord.rawSha256)`].join('\n')
  }
  return [`import octocrawl_client  # pip install octocrawl-client; npx octocrawl serve`, '', 'page = octocrawl_client.scrape(', `    ${JSON.stringify(url)},`, `    formats=${py(formats)},`, ...(choice.whole ? ['    only_main_content=False,'] : []), ')', `print(${out.py}, page["evidenceRecord"]["rawSha256"])`].join('\n')
}

const NOTES: Record<Lang, string> = {
  curl: 'Hosted, no key needed for 20 pages a day; add <code>-H \'authorization: Bearer &lt;key&gt;\'</code> for an account’s credits. On your computer: <code>npx octocrawl serve</code>, then <code>http://127.0.0.1:8787</code>.',
  mcp: 'Claude Code shown; <a href="/docs/connect-mcp/">Connect MCP</a> has the line for Cursor, Codex and OpenCode.',
  cli: 'Runs on your own computer with Node.js 22.13 or later, no limit. It prints the result as JSON, or the Markdown alone with <code>--markdown</code>.',
  ts: '<code>npm install @octocrawl/sdk</code>. The client also crawls, maps and batches.',
  py: 'The Python client of a running API, with pandas support for batches.',
}

export function mountScrapeCode(section: HTMLElement, url: string, follow: (listener: (choice: Choice) => void) => void): void {
  const code = section.querySelector<HTMLElement>('#cd-code code')
  const pane = section.querySelector<HTMLElement>('#cd-code')
  const note = section.querySelector<HTMLElement>('#cd-note')
  const followed = section.querySelector<HTMLElement>('#cd-follow')
  const copy = section.querySelector<HTMLButtonElement>('#cd-copy')
  const tabs = [...section.querySelectorAll<HTMLButtonElement>('.cd-tab')]
  if (!code || !pane) return
  let lang: Lang = 'curl'
  let choice: Choice | undefined
  const render = (): void => {
    if (!choice) return
    code.textContent = scrapeSnippet(lang, url, choice)
    if (note) note.innerHTML = NOTES[lang]
    const formats = scrapeFormats(choice).map((f) => (typeof f === 'string' ? f : `json (${choice!.fields.length} fields)`))
    if (followed) followed.innerHTML = `Following your choices: ${formats.map((f) => `<span>${f}</span>`).join('')}<span>${choice.whole ? 'whole page' : 'main content'}</span>`
    pane.classList.remove('is-fresh')
    void pane.offsetWidth
    pane.classList.add('is-fresh')
  }
  tabs.forEach((tab, i) => {
    const pick = (focus: boolean): void => {
      lang = tab.dataset.lang as Lang
      tabs.forEach((t) => {
        t.setAttribute('aria-selected', String(t === tab))
        t.tabIndex = t === tab ? 0 : -1
      })
      pane.setAttribute('aria-labelledby', tab.id)
      if (focus) tab.focus()
      render()
    }
    tab.addEventListener('click', () => pick(false))
    tab.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      tabs[(i + step + tabs.length) % tabs.length]!.click()
      tabs[(i + step + tabs.length) % tabs.length]!.focus()
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
  follow((next) => {
    choice = next
    render()
  })
}
