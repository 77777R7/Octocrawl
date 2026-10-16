/** Publisher state can explicitly reject a data target even though its HTTP page arrived. */
import type { FetchWarning } from '@w2l/contracts'

/** No extra DOM parse, and at most this many characters scanned/parsed per capture. */
export const SOURCE_DATA_MAX_CHARS = 1_000_000

interface BrowseState {
  page?: unknown
  query?: { seo?: unknown }
  props?: { pageProps?: { initialData?: {
    searchResult?: { itemStacks?: unknown }
    pageMetadata?: { pageContext?: { browseContext?: { errorResponse?: { errors?: unknown } } } }
  } } }
}

/**
 * Walmart's browse state says which category the capture belongs to. A fatal invalid category with
 * no declared stacks and no product links is evidence of a source error, not a promise that more
 * waiting will load products. This deliberately recognizes one observed publisher declaration:
 * no keyword classification of visible notices or hidden Nasdaq widgets, and no URL substitutions.
 */
export function sourceDataWarnings(html: string, finalUrl: string): FetchWarning[] {
  let url: URL
  try { url = new URL(finalUrl) } catch { return [] }
  if (!/^(?:www\.)?walmart\.com$/.test(url.hostname) || !url.pathname.startsWith('/browse/') || html.length > SOURCE_DATA_MAX_CHARS) return []
  // Product markup contradicts an empty-state declaration (which can be stale after hydration).
  if (/<a\b[^>]*\bhref\s*=\s*["'][^"']*\/ip\//i.test(html)) return []
  const source = html.replace(/<!--[\s\S]*?-->/g, '')
  const match = /(<script\b[^>]*\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>)([\s\S]*?)<\/script\s*>/i.exec(source)
  if (match === null || !/\btype\s*=\s*["']application\/json["']/i.test(match[1]!)) return []
  let state: BrowseState | null
  try { state = JSON.parse(match[2]!) as BrowseState | null } catch { return [] }
  if (state?.page !== '/browse/[...seo]' || !Array.isArray(state.query?.seo) || !state.query.seo.every(part => typeof part === 'string')) return []
  let path: string[]
  try { path = url.pathname.replace(/\/$/, '').split('/').slice(2).map(decodeURIComponent) } catch { return [] }
  if (JSON.stringify(path) !== JSON.stringify(state.query.seo)) return []
  const data = state.props?.pageProps?.initialData
  const stacks = data?.searchResult?.itemStacks
  if (!Array.isArray(stacks) || stacks.length !== 0) return []
  const errors = data?.pageMetadata?.pageContext?.browseContext?.errorResponse?.errors
  if (!Array.isArray(errors) || !errors.some(error => error !== null && typeof error === 'object' && error.errorType === 'FATAL' && error.statusCode === 'POLARIS_1001' && error.statusMsg === 'INVALID_CAT_ID')) return []
  return [{ code: 'source_data_error', message: 'The publisher declares INVALID_CAT_ID for the requested Walmart category, with no product stacks or product links in this capture. Target product data was not served; waiting or extracting navigation does not establish task completion.' }]
}
