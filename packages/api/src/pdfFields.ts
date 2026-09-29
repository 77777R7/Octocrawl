import type { FetchResult, LabelledValue } from '@w2l/contracts'

/**
 * The label/value pairs JSON extraction may read from a PDF: each line of a
 * page's text of the form `Label: value`, with the page it is on as its path
 * (`page N`, N the page's 1-based position in the file). Nothing else is
 * read: not prose, not table cells (PDF tables are unverified), not the
 * PDF's metadata. A value is taken as written; the schema's type decides
 * whether it fits (see structured.ts labelValue).
 */
export function pdfLabelledValues(result: Pick<FetchResult, 'markdown' | 'file'>): Array<LabelledValue & { source: 'pdf' }> {
  const pages = result.file?.pdf?.pages
  if (result.markdown === null || result.markdown === undefined || pages === undefined) return []
  const values: Array<LabelledValue & { source: 'pdf' }> = []
  for (const page of pages) {
    for (const line of result.markdown.slice(page.start, page.end).split('\n')) {
      const match = /^([^:]{1,80}?)\s*:\s+(\S.{0,199})$/u.exec(line.trim())
      if (match === null || !/\p{L}/u.test(match[1]!) || /^(https?|mailto|ftp)$/i.test(match[1]!)) continue
      values.push({ label: match[1]!.trim(), value: match[2]!.trim(), path: `page ${page.number}`, source: 'pdf' })
    }
  }
  return values
}
