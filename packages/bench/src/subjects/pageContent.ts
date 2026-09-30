/**
 * What a lane reports about a page's content: the document facts of an
 * extraction, and the readable part of an error page.
 */

import type { FetchResult, PageOptions } from '@w2l/contracts'
import { collectLinks, extractTf, htmlToMarkdown } from '@w2l/extract-tf'

/** The document facts every lane reports for an extraction. */
export function documentOf(extracted: ReturnType<typeof extractTf.extract>): NonNullable<FetchResult['document']> {
  return {
    title: extracted.title,
    pageType: extracted.pageType,
    strategy: extracted.strategy,
    confidence: extracted.confidence,
    product: extracted.product ?? null,
    adapter: extracted.adapter,
    entities: extracted.entities,
    adapterValidation: extracted.adapterValidation,
    ...(extracted.metadata === undefined ? {} : { metadata: extracted.metadata }),
  }
}

/** What a non-2xx HTML response says, when it says anything; null for an empty shell. */
export function errorPageContent(body: string, finalUrl: string, page: PageOptions): { markdown: string; links: readonly string[]; document: NonNullable<FetchResult['document']> } | null {
  const extracted = extractTf.extract(body, { url: finalUrl, onlyMainContent: page.onlyMainContent ?? true, pruneSelectors: page.excludeTags, includeSelectors: page.includeTags })
  if (extracted.escalate) return null
  const markdown = htmlToMarkdown(extracted.mainHtml, { baseUrl: finalUrl })
  if (markdown.trim().length === 0) return null
  return { markdown, links: collectLinks(body, finalUrl), document: documentOf(extracted) }
}
