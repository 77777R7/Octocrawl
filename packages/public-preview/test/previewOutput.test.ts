import { describe, expect, it } from 'vitest'
import type { FetchResult } from '@w2l/contracts'
import { MARKDOWN_CHARS, PREVIEW_FILE_BYTES, PREVIEW_LINKS, mapPreviewResult, normalizePreviewUrl, previewLinks, previewNetworkPolicy, type CaptureOutcome } from '../src/preview.js'

const metadata = {
  title: 'Example <title>',
  description: 'd'.repeat(3000),
  language: 'en',
  keywords: 'one, two',
  robots: 'index, follow',
  favicon: 'https://docs.example/favicon.ico',
  canonicalUrl: 'https://docs.example/a',
}

function page(url: string, extra: Partial<FetchResult> = {}, adapter = 'generic'): CaptureOutcome {
  const result = {
    requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null,
    markdown: '# Example page\n\nContent',
    evidence: { finalUrl: url, httpStatus: 200, rawBodySha256: 'fixture-sha' },
    usage: { attemptCount: 1, browserMs: 0, externalCostUsd: null },
    document: { title: 'Example page', adapter: { id: adapter }, adapterValidation: { valid: true, issues: [] } },
    links: ['https://docs.example/b', 'https://docs.example/b', 'mailto:a@docs.example', 'https://user:secret@docs.example/c', `https://docs.example/${'x'.repeat(2100)}`, 'https://other.example/d'],
    metadata,
    ...extra,
  } as unknown as FetchResult
  return { result }
}

const map = (url: string, outcome: CaptureOutcome) => mapPreviewResult(url, normalizePreviewUrl(url), outcome, 10)

describe('preview output views', () => {
  it('returns a readable page\'s links, deduplicated and without credentials, and its metadata cut to size', () => {
    const url = 'https://docs.example/a'
    const response = map(url, page(url))
    expect(response.links).toEqual(['https://docs.example/b', 'https://other.example/d'])
    expect(response.linksTotal).toBe(2)
    expect(response.metadata).toMatchObject({ title: 'Example <title>', language: 'en', canonicalUrl: 'https://docs.example/a' })
    expect(response.metadata?.description).toHaveLength(2048)
    expect(response).not.toHaveProperty('markdownTruncated')
    expect(response).not.toHaveProperty('file')
  })

  it('caps the links it returns and still counts them all', () => {
    const links = Array.from({ length: PREVIEW_LINKS + 40 }, (_, i) => `https://docs.example/page-${i}`)
    const { links: kept, total } = previewLinks(links)
    expect(kept).toHaveLength(PREVIEW_LINKS)
    expect(total).toBe(PREVIEW_LINKS + 40)
    // The combined length is capped too, so a page of long links cannot make the response large.
    const long = Array.from({ length: 400 }, (_, i) => `https://docs.example/${i}-${'y'.repeat(1900)}`)
    const capped = previewLinks(long)
    expect(capped.links.join('').length).toBeLessThanOrEqual(256 * 1024)
    expect(capped.total).toBe(400)
  })

  it('marks Markdown cut to the preview\'s limit', () => {
    const url = 'https://docs.example/long'
    const response = map(url, page(url, { markdown: 'a'.repeat(MARKDOWN_CHARS + 10) }))
    expect(response.markdown).toHaveLength(MARKDOWN_CHARS)
    expect(response.markdownTruncated).toBe(true)
  })

  it('keeps links and metadata out of Amazon, X and Reddit results and of pages that were not read', () => {
    const post = 'https://x.com/alice/status/222'
    expect(map(post, page(post, {}, 'x-public'))).not.toHaveProperty('links')
    const thread = 'https://www.reddit.com/r/test/comments/abc123/title'
    expect(map(thread, page(thread, {}, 'reddit-public'))).not.toHaveProperty('metadata')
    const product = 'https://www.amazon.sg/dp/B000000001'
    const amazon = map(product, { ...page(product, {}, 'amazon-product'), selectedAsin: 'B000000001' })
    expect(amazon).not.toHaveProperty('links')
    expect(amazon).not.toHaveProperty('metadata')
    const url = 'https://docs.example/a'
    // A failed page kept only as evidence is not content.
    const failed = map(url, page(url, { status: 'failed', failureReason: 'empty_unverified' } as Partial<FetchResult>))
    expect(failed).not.toHaveProperty('links')
    expect(failed).not.toHaveProperty('metadata')
    const blocked = map(url, page(url, { status: 'blocked', blockReason: 'login_wall' } as Partial<FetchResult>))
    expect(blocked).not.toHaveProperty('links')
  })

  it('describes a file without saying where it was saved', () => {
    const url = 'https://docs.example/report.pdf'
    const file = {
      kind: 'pdf', detectedBy: 'content_type', contentType: 'application/pdf', declaredBytes: 1234, maxBytes: PREVIEW_FILE_BYTES,
      bytes: 1234, sha256: 'f'.repeat(64), path: '/tmp/task/files/secret.pdf', markdownFrom: 'pdf_text', encoding: null, warnings: [],
      pdf: { pageCount: 3, pagesRead: 3, pages: [] },
    }
    const response = map(url, page(url, { document: null, metadata: undefined, links: undefined, file, markdown: '<!-- page 1 -->\nText' } as unknown as Partial<FetchResult>))
    expect(response.file).toEqual({ kind: 'pdf', contentType: 'application/pdf', bytes: 1234, declaredBytes: 1234, maxBytes: PREVIEW_FILE_BYTES, sha256: 'f'.repeat(64), markdownFrom: 'pdf_text', pdf: { pageCount: 3, pagesRead: 3 }, warnings: [] })
    expect(JSON.stringify(response)).not.toContain('secret.pdf')
    expect(response.markdown).toBe('<!-- page 1 -->\nText')
  })

  it('reads files of at most 5 MiB and pages of at most 2 MiB', () => {
    const policy = previewNetworkPolicy()
    expect(policy.maxFileBytes).toBe(5 * 1024 * 1024)
    expect(policy.maxBodyBytes).toBe(2 * 1024 * 1024)
    expect(policy.maxRedirects).toBe(3)
    // Hosted rules: no private address is ever allowed.
    expect(policy.privateAllowlist).toEqual([])
  })
})
