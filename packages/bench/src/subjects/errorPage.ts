import type { AttributeExtraction, FetchOptions, FetchResult, Lane, PageTable, TraceEvent } from '@w2l/contracts'
import { collectImages, collectLinks, extractAttributes, extractTf, htmlToMarkdown, htmlToTables, wholePageBody, withoutLayoutMarkers, type MarkdownOptions } from '@w2l/extract-tf'
import { sha256Utf8 } from '@w2l/http-core'

/**
 * Response-status rules shared by every lane. A 2xx answer is judged from
 * its content; 204 and 205 say by definition that there is none. Any other
 * final status is an answer about the request, never content: the page it
 * carried is what the server said, kept as evidence on the failed or blocked
 * result.
 */
export function isSuccessStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status < 300
}

/** 2xx statuses that carry no content (RFC 9110 §15.3.5–6). */
export function isNoContentStatus(status: number | null): boolean {
  return status === 204 || status === 205
}

export interface ErrorPage {
  markdown: string
  links: readonly string[]
}

/**
 * Markdown and links of the page an error status carried. Null for a success
 * status, a 304 (it points at a cached representation, it is not one), a
 * missing status, an empty body or a body that is not HTML or text.
 * `onlyMainContent: false` asks for the whole page, and `includeTags` and
 * `excludeTags` shape it, as on a success. Link and image targets resolve
 * against the page URL, as on a success.
 */
export function errorPageEvidence(status: number | null, contentType: string | null, body: string, url: string, options: FetchOptions = {}): ErrorPage | null {
  if (status === null || status < 100 || isSuccessStatus(status) || status === 304) return null
  if (body.trim() === '' || !isTextBody(contentType)) return null
  let markdown: string | null
  if (wholePageAsked(options)) markdown = wholePageMarkdown(body, url, options)
  else {
    const extracted = extractTf.extract(body, { url, pruneSelectors: options.excludeTags, includeSelectors: options.includeTags, blockAds: options.blockAds })
    // Error pages are often too small for main-content extraction; then the
    // whole body is what the server said, unless the caller named the
    // elements to keep.
    markdown = extracted.escalate && !selectionAsked(options) ? wholePageMarkdown(body, url, options) : htmlToMarkdown(extracted.mainHtml, { baseUrl: extracted.baseUrl, ...markdownOptions(options) })
  }
  return markdown === null || markdown === '' ? null : { markdown, links: collectLinks(body, url) }
}

/**
 * The whole page as Markdown, through the converter and base URL a page's
 * main content uses, without the elements the caller excluded
 * (`excludeTags`) and with the caller's `removeBase64Images`; null when it
 * has no text. It is the content that `onlyMainContent: false` asks for, and
 * the evidence a failed result keeps when the extractor found no main content.
 */
export function wholePageMarkdown(html: string, url: string, options: FetchOptions = {}): string | null {
  const markdown = htmlToMarkdown(html, { baseUrl: url, exclude: options.excludeTags, ...markdownOptions(options) })
  return markdown.trim() === '' ? null : markdown
}

/**
 * The Markdown options a request's page options choose: `removeBase64Images:
 * false` keeps `data:` images as targets; the default drops them and keeps
 * their alt text, which every lane always did.
 */
export function markdownOptions(options: FetchOptions): Pick<MarkdownOptions, 'dataUriImages'> {
  return options.removeBase64Images === false ? { dataUriImages: 'keep' } : {}
}

/**
 * The `images` and `attributes` formats of a contentful result, each only
 * when asked for, read from the page as the lane received it (`raw`: the
 * response body on the HTTP lane, the rendered DOM on a browser lane) like
 * `links`, with their trace events (`images_collected`, `attributes_extracted`).
 */
export function extraFormats(raw: string, url: string, options: FetchOptions, trace: TraceEvent[], lane: Lane, at: number): Pick<FetchResult, 'images' | 'attributes'> {
  const out: { images?: readonly string[]; attributes?: readonly AttributeExtraction[] } = {}
  if (options.includeImages === true) {
    const collected = collectImages(raw, url)
    trace.push({ at, lane, event: 'images_collected', detail: { count: collected.images.length, srcsetCandidates: collected.srcsetCandidates, lazy: collected.lazy, dataUrisDropped: collected.dataUrisDropped } })
    out.images = collected.images
  }
  if (options.attributes !== undefined && options.attributes.length > 0) {
    const attributes = extractAttributes(raw, options.attributes)
    trace.push({ at, lane, event: 'attributes_extracted', detail: { selectors: attributes.length, counts: attributes.map((entry) => entry.values.length) } })
    out.attributes = attributes
  }
  return out
}

/**
 * The `tables` format of a contentful result, only when asked for: the data
 * tables of the HTML the Markdown was written from (`source`, with the same
 * Markdown options), so table N is the Nth GFM table of that Markdown, each
 * as rows and CSV, with a `tables_extracted` trace event.
 */
export function tablesFormat(source: { html: string; options: MarkdownOptions }, sourceUrl: string, options: FetchOptions, trace: TraceEvent[], lane: Lane, at: number): Pick<FetchResult, 'tables'> {
  if (options.includeTables !== true) return {}
  const tables: PageTable[] = htmlToTables(source.html, source.options).map((table) => {
    const csv = tableCsv(table.rows)
    return { tableIndex: table.tableIndex, caption: table.caption, sourceUrl, headerRows: table.headerRows, columns: table.rows[0]?.length ?? 0, rows: table.rows, csv, csvSha256: sha256Utf8(csv), ...(table.omitted === undefined ? {} : { omitted: table.omitted }) }
  })
  const omitted = tables.filter((table) => table.omitted !== undefined).map((table) => table.tableIndex)
  trace.push({ at, lane, event: 'tables_extracted', detail: { count: tables.length, rows: tables.map((table) => table.rows.length), columns: tables.map((table) => table.columns), ...(omitted.length === 0 ? {} : { omitted }) } })
  return { tables }
}

/** RFC 4180 CSV: CRLF line ends, a field quoted when it holds a comma, a quote, CR or LF, a quote doubled inside it. */
export function tableCsv(rows: readonly (readonly string[])[]): string {
  const field = (value: string): string => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return rows.map((row) => row.map(field).join(',')).join('\r\n') + (rows.length > 0 ? '\r\n' : '')
}

/**
 * Whether the caller named the elements to keep (`includeTags`). They are
 * then the answer, even when there are none or the page has no main content:
 * a lane still blocks such a page on its gate and still offers it to the
 * browser, but does not fail it as `empty_unverified`.
 */
export function selectionAsked(options: FetchOptions): boolean {
  return options.includeTags !== undefined && options.includeTags.length > 0
}

/**
 * Whether the whole page is the content asked for: `onlyMainContent: false`,
 * unless `includeTags` names the elements to keep, which then are the content.
 */
export function wholePageAsked(options: FetchOptions): boolean {
  return options.onlyMainContent === false && !selectionAsked(options)
}

/** The caller's `includeTags` and `excludeTags`, for the `extract` trace event of a page they shaped. */
export function tagOptions(options: FetchOptions): Pick<FetchOptions, 'includeTags' | 'excludeTags'> {
  return {
    ...(options.includeTags !== undefined && options.includeTags.length > 0 ? { includeTags: options.includeTags } : {}),
    ...(options.excludeTags !== undefined && options.excludeTags.length > 0 ? { excludeTags: options.excludeTags } : {}),
  }
}

/**
 * The `html` and `rawHtml` formats of a contentful result, each only when
 * asked for. `raw` is the page as the lane received it. `page` is the HTML
 * the lane extracted from: `raw` itself, or in the browser lane its copy
 * with layout markers, which `html` never carries. `html` is the HTML the
 * Markdown was written from: `mainHtml` (the main content or the
 * `includeTags` selection), or the whole page.
 */
export function htmlFormats(raw: string, page: string, mainHtml: string, options: FetchOptions): Pick<FetchResult, 'html' | 'rawHtml'> {
  return {
    ...(options.includeHtml ? { html: wholePageAsked(options) ? wholePageBody(page, options.excludeTags) : withoutLayoutMarkers(mainHtml) } : {}),
    ...(options.includeRawHtml ? { rawHtml: raw } : {}),
  }
}

function isTextBody(contentType: string | null): boolean {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return type === '' || type.startsWith('text/') || type === 'application/xhtml+xml' || type === 'application/xml' || type.endsWith('+xml')
}
