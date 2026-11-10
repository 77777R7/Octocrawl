import { track } from '../analytics'
import { MCP_ADD } from './toolSections'

/** Under a free tool's result that read something: where to take the same task next. Most of these visitors come from
 * ChatGPT, run the tool once and leave (site events 2026-10-20..11-02: 49 of 58 ran it, 3 opened sign-in), so the
 * result names two ways on: the keyless MCP in their own agent, and the Playground on an account's credits. It reports
 * being shown unless `counted` says this run already did; a click on one of its links is a link_click with trigger
 * next-step (analytics.ts). */

export type NextStepKind = 'page' | 'map'

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

/** The tool's slug from the page's path (/tools/<slug>/), for the docs link's `from` tag. */
const toolSlug = (): string => /^\/tools\/([a-z0-9-]{1,60})\//.exec(location.pathname)?.[1] ?? 'tools'

/** `url` is the address the visitor ran; `code` opens the page's Get code dialog, when the page has one; `morePages`
 * says a map stopped at its 500, so the site has more than it listed; `counted` says this run's block was already
 * reported (a run shown again from Recent runs). */
export function toolNextStep(kind: NextStepKind, url: string, { code, morePages = false, counted = false }: { code?: () => void; morePages?: boolean; counted?: boolean } = {}): HTMLElement {
  const signedIn = /(?:^|;\s*)w2l_account=1(?:;|$)/.test(document.cookie)
  const box = el('div', 'tool-next')
  box.dataset.nextStep = kind
  box.append(el('p', 'tool-next-title', 'Next: take this into your own work'))
  const list = el('ul', 'tool-next-list')
  list.setAttribute('role', 'list')

  const item = (head: string, text: string, action: HTMLElement, code = ''): void => {
    const row = el('li', 'tool-next-item')
    row.append(el('strong', '', head), el('span', '', text))
    // The line itself, to copy straight into a terminal without opening the guide.
    if (code) {
      const line = el('code', 'tool-next-code', code)
      // The line has no Copy button: a visitor selects it and copies by hand, which the browser reports as a copy.
      line.addEventListener('copy', () => track('setup_copy', { target: 'tool-next' }))
      row.append(line)
    }
    row.append(action)
    list.append(row)
  }
  const link = (text: string, href: string): HTMLAnchorElement => {
    const anchor = el('a', 'tool-next-link', text)
    anchor.href = href
    return anchor
  }

  item('In your agent', 'Add Octocrawl to Claude Code with this line, and your agent reads pages itself. No key for 20 pages a day.', link('Cursor, Codex and others →', `/docs/connect-mcp/?from=tool-${toolSlug()}`), MCP_ADD)
  // Signed in, the Playground opens with this URL, as main.ts's playgroundLink does. Signed out, the link goes through
  // sign-in without it: the dashboard's address would carry it into request logs, which the privacy page rules out for
  // a visitor who has not signed in.
  const dashboard = `/dashboard/${kind === 'map' ? 'map' : 'scrape'}/`
  const playground = signedIn ? `${dashboard}?${new URLSearchParams({ url })}` : `/signin/?${new URLSearchParams({ next: dashboard })}`
  item(kind === 'map' ? 'Up to 5,000 URLs' : 'Past five a day',
    kind === 'map' ? `${morePages ? 'This site has more than 500 pages. ' : ''}List up to 5,000 of its URLs in the Playground, 1 credit a map, from 1,000 free credits a month.` :'Run this page in the Playground, read in a browser when it needs one, from 1,000 free credits a month.',
    link(signedIn ? 'Open it in your Playground →' : 'Sign in and run it →', playground))
  if (code) {
    const open = el('button', 'tool-next-link', 'Get the same call as code →')
    open.type = 'button'
    open.addEventListener('click', code)
    item('From your code', 'The same request for the REST API, the MCP server or the CLI.', open)
  }
  box.append(list)
  if (!counted) track('next_step_view', { view: kind })
  return box
}
