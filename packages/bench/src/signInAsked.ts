/**
 * A page read with the person's login that shows what a reader without one sees. www.english.ids-cologne.de did so on
 * 2026-11-07 for 90 pages in a row of 272: the session lapsed for twelve minutes, each exhibitor said "Log in for contact
 * details" in place of its phone and email, and each was HTTP 200, `success`, `ready`. The result now says so with a
 * `sign_in_prompt` warning, which its readiness reads as `not_served`. A page that asks for a sign-in as its whole answer
 * is the ladder's (signInPrompt, `login_wall`); this is the line in the middle of a page that came.
 *
 * Only on a read with the person's login, which the caller knows: on any other, the same line is simply what a public page
 * shows. And only a line that holds content back: of 7,790 public pages (WebMainBench, 2026-10-30), 80 had some line asking to sign
 * in, mostly to comment or to reach an account, and 9 this kind.
 */

import type { FetchResult, FetchWarning } from '@w2l/contracts'

export const SIGN_IN_PROMPT = 'sign_in_prompt'

/** A line that begins by asking the reader to sign in to see something: "Log in for contact details", "Sign in to view pricing". */
const HOLDS_CONTENT_BACK = /^(?:please\s+)?(?:log|sign)[\s-]?in\s+(?:to|for)\s+(?:(?:view|see|read|access|show|unlock)\b|(?:more\s+)?(?:contact|details|prices?|pricing|full)\b)/i

/** Lines longer than this are prose that may mention signing in. */
const MAX_LINE = 80

/** The first line of `markdown` that holds content back behind a sign-in, or null. A list item, a table row, a quote or a link is the page's menu or content, not its request. */
export function contentHeldBack(markdown: string | null | undefined): string | null {
  let fenced = false
  for (const raw of (markdown ?? '').split('\n')) {
    if (/^\s*(?:```|~~~)/.test(raw)) { fenced = !fenced; continue }
    const line = raw.trim()
    if (fenced || /^(?:\||[-*+]\s|\d+[.)]\s|>)/.test(line) || line.includes('](')) continue
    const text = line.replace(/^#{1,6}\s+/, '').replace(/^[*_]+|[*_]+$/g, '').trim()
    if (text.length <= MAX_LINE && HOLDS_CONTENT_BACK.test(text)) return text
  }
  return null
}

/** The result of a read with the person's login, with the `sign_in_prompt` warning when its page shows a line that holds content back. */
export function withSignInWarning<T extends FetchResult>(result: T): T {
  if (result.status !== 'success' && result.status !== 'partial') return result
  if (result.warnings?.some((warning) => warning.code === SIGN_IN_PROMPT) === true) return result
  const line = contentHeldBack(result.markdown)
  if (line === null) return result
  const warning: FetchWarning = { code: SIGN_IN_PROMPT, message: `The page was read with your login and says "${line}": the login did not reach it, or has lapsed, so what it holds back is missing.` }
  return { ...result, warnings: [...(result.warnings ?? []), warning] }
}
