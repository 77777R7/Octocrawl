import type { ListExtraction, ListFormatRequest, ListRecord, ListSpec } from '@w2l/contracts'
import { extractListRecords, listExtraction, MAX_LIST_RECORDS, MAX_LIST_VALUE_CHARS, resolveListSpec } from '@w2l/extract-tf'

/** One page of a list as read: the URL the browser showed and the page's HTML. */
export interface ListPageHtml { url: string; html: string }

/**
 * The list format over the pages a paginate step read, in order: the records of every page, each page once (a page
 * whose items' whole text repeats a page already merged is not counted twice), the items and fields left to W2L found on
 * the first page and read on every page the same way. `valued` says whether any record has a value: a list of records
 * is content though the extractor finds no article in it. Null when there is no page.
 */
export function mergeListPages(pages: readonly ListPageHtml[], list: ListFormatRequest): { list: ListExtraction; spec: ListSpec | null; valued: boolean } | null {
  if (pages.length === 0) return null
  const records: ListRecord[] = []
  const seen = new Set<string>()
  let page = 0
  let cut = false
  const { spec, detected } = resolveListSpec(pages[0]!.html, list)
  for (const scrape of spec === null ? [] : pages) {
    const budget = { records: MAX_LIST_RECORDS - records.length, chars: MAX_LIST_VALUE_CHARS - records.reduce((sum, record) => sum + Object.values(record.values).reduce((n, value) => n + (value?.length ?? 0), 0), 0) }
    const read = extractListRecords(scrape.html, scrape.url, spec!, page + 1, budget)
    // The items' whole text, not only the fields asked for: two pages agreeing on a stock field are still two pages.
    const key = read.itemText ?? JSON.stringify(read.map((record) => record.values))
    if (read.length > 0 && seen.has(key)) continue
    seen.add(key)
    page++
    records.push(...read)
    if (read.cut === true) { cut = true; break }
  }
  const valued = spec !== null && records.some((record) => record.missing.length < spec.fields.length)
  return { list: listExtraction(spec, records, page, cut, detected), spec, valued }
}
