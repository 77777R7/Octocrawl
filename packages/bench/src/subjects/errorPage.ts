import { collectLinks, extractTf, htmlToMarkdown } from '@w2l/extract-tf'

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
 */
export function errorPageEvidence(status: number | null, contentType: string | null, body: string, url: string): ErrorPage | null {
  if (status === null || status < 100 || isSuccessStatus(status) || status === 304) return null
  if (body.trim() === '' || !isTextBody(contentType)) return null
  const extracted = extractTf.extract(body, { url })
  // Error pages are often too small for main-content extraction; then the
  // whole body is what the server said.
  const markdown = htmlToMarkdown(extracted.escalate ? body : extracted.mainHtml)
  return markdown === '' ? null : { markdown, links: collectLinks(body, url) }
}

function isTextBody(contentType: string | null): boolean {
  const type = (contentType ?? '').split(';')[0]!.trim().toLowerCase()
  return type === '' || type.startsWith('text/') || type === 'application/xhtml+xml' || type === 'application/xml' || type.endsWith('+xml')
}
