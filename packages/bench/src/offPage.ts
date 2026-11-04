/**
 * A page delivered in place of the one asked for: the site sent the request on
 * to its home page, or to a page above the requested one, and answered that
 * page as a success. www.english.ids-cologne.de did so on 2026-11-04 for 98 of
 * 272 exhibitor pages, each HTTP 200 and read as `success` with no caveat, so
 * a batch of 272 said `failed: 0` and only the fields it extracted told. The
 * result now says so with a `redirected_off_page` warning, which its readiness
 * reads as `not_served`: the content is real, and it is another page's. A
 * redirect that keeps the page (http to https, www and apex, a trailing slash,
 * index.html, a new slug beside the old one, a deeper default page) is not off
 * the page; the redirect chain records it as before.
 */

import type { FetchResult, FetchWarning } from '@w2l/contracts'

export const REDIRECTED_OFF_PAGE = 'redirected_off_page'

/** A language or locale segment at the start of a path (`en`, `de-ch`, `zh_hant`): a site's default locale collapses to its root and back. */
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][a-z]{2,4})?$/
/** A segment that names a section's own page (`index.html`, `default.aspx`, `home`): the section itself, as map folds `index.html`. */
const INDEX_SEGMENT = /^(?:index|default|home|start|welcome|main)(?:\.[a-z]{2,5})?$/

/**
 * The path a URL names once folded: as map's deduplicateSimilarURLs folds it (a final index file, a trailing slash,
 * lower-cased), and with a leading locale segment and a final index-like name set aside, so `/en/`, `/home` and `/en/home`
 * all name the root, and `/en/docs/guide` the page `/docs/guide`. Null for a URL that does not parse.
 */
function foldedPath(url: string): string | null {
  try {
    const segments = new URL(url).pathname.toLowerCase().split('/').filter((segment) => segment.length > 0)
    if (segments.length > 0 && LOCALE_SEGMENT.test(segments[0]!)) segments.shift()
    if (segments.length > 0 && INDEX_SEGMENT.test(segments.at(-1)!)) segments.pop()
    return `/${segments.join('/')}`
  } catch {
    return null
  }
}

/**
 * Whether `finalUrl` is above the page `requestedUrl` asked for: the root of any site, an ancestor of the requested path
 * (`/exhibitors/acme` to `/exhibitors`), or a shorter path with no segment in common with it (`/wrong/redirect-home` to
 * `/home`; `/en/exhibitor/x` to `/de`, a home in another language). The host, the scheme and the query do not count: a
 * redirect may change them and keep the page. False when the requested path is the root itself (`/`, `/en/`, `/home`),
 * when the two fold to the same path, and when the final path is as deep or deeper (a renamed slug, a default sub-page).
 */
export function redirectedOffPage(requestedUrl: string, finalUrl: string): boolean {
  const requested = foldedPath(requestedUrl)
  const final = foldedPath(finalUrl)
  if (requested === null || final === null || requested === '/' || requested === final) return false
  if (final === '/' || requested.startsWith(`${final}/`)) return true
  const requestedSegments = requested.split('/').filter((segment) => segment.length > 0)
  const finalSegments = final.split('/').filter((segment) => segment.length > 0)
  return finalSegments.length < requestedSegments.length && !finalSegments.some((segment) => requestedSegments.includes(segment))
}

/** The caveat a result delivered in place of the page asked for carries; null when the final URL keeps the page. */
export function offPageWarning(requestedUrl: string, finalUrl: string): FetchWarning | null {
  if (!redirectedOffPage(requestedUrl, finalUrl)) return null
  const where = foldedPath(finalUrl) === '/' ? 'its home page' : 'a page above the one asked for'
  return { code: REDIRECTED_OFF_PAGE, message: `The site sent the request for ${requestedUrl} on to ${finalUrl}, ${where}: the content is that page's, not the requested page's.` }
}

/**
 * The result with the `redirected_off_page` warning when its page was delivered in place of the one asked for. A result
 * not read as content keeps its own verdict; one whose steps ran on the page (`actions`) is where the steps led it, by
 * design; one that already carries the warning is left as it is.
 */
export function withOffPageWarning<T extends FetchResult>(result: T): T {
  if (result.status !== 'success' && result.status !== 'partial') return result
  if (result.actions !== undefined || result.warnings?.some((warning) => warning.code === REDIRECTED_OFF_PAGE) === true) return result
  const warning = offPageWarning(result.requestedUrl, result.evidence.finalUrl)
  return warning === null ? result : { ...result, warnings: [...(result.warnings ?? []), warning] }
}
