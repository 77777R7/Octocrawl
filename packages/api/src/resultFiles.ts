/**
 * The files a job's results are written to: `results.jsonl`, a page a line, `results.csv`, a row a page with its
 * evidence in RESULT_COLUMNS and its Markdown file, and the Markdown of each page in a file of its own. A server on the
 * person's computer writes them beside the task's checkpoint when the job ends (engine.ts finishJob), the Markdown in
 * `markdown/`, and `octocrawl crawl --out` / `octocrawl batch --out` write them where asked (packages/cli). Hosted
 * Octocrawl writes none: it keeps no files, and gives a finished job's `export` link instead.
 */
import { existsSync } from 'node:fs'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { EvidenceRecord, JobResultFiles, PageTable } from '@w2l/contracts'

export const RESULT_JSONL = 'results.jsonl'
export const RESULT_CSV = 'results.csv'
/** The directory beside them that holds each page's Markdown, a file a page. */
export const RESULT_MARKDOWN_DIR = 'markdown'

/**
 * The columns of `results.csv`, in order: those of the Python client's `to_pandas(include_markdown=False)`
 * (python/src/w2l/frame.py). A value Octocrawl did not observe is empty, never 0. The CLI adds `markdown_file`.
 */
export const RESULT_COLUMNS = [
  'url', 'status', 'reason', 'final_url', 'fetched_at', 'http_status', 'lane', 'robots_decision',
  'raw_sha256', 'markdown_sha256', 'extractor', 'source_commit', 'cache_state', 'cached_at', 'verification',
] as const

/** The columns of a `results.csv` written beside the Markdown files: RESULT_COLUMNS, then the page's Markdown file. */
export const RESULT_FILE_COLUMNS = [...RESULT_COLUMNS, 'markdown_file'] as const

/**
 * The file a page's Markdown is written to: its place among the results, from 1, and its host and path, as in
 * `0003-docs.example.com-guide-install.md`, so the files list in the results' order and a person can tell them apart.
 */
export function markdownFileName(n: number, url: string): string {
  let text = url
  try { const parsed = new URL(url); text = parsed.host + parsed.pathname } catch {}
  const slug = text.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'page'
  return `${String(n).padStart(4, '0')}-${slug}.md`
}

/** The statuses of a page that was read, whose Markdown is written to a file of its own. */
const READ_STATUSES: ReadonlySet<string> = new Set(['success', 'partial'])

/** A page as the files take it: a crawl page or batch item (`url`), or a scrape response (`requestedUrl`). */
export type ResultPage = {
  url?: string; requestedUrl?: string; markdown?: string | null; tables?: readonly PageTable[]
  status?: string; lane?: string | null; failureReason?: string | null; blockReason?: string | null; budgetExceeded?: string | null
  cacheState?: string; cachedAt?: string; evidenceRecord?: EvidenceRecord | null; verification?: { status: string }
  /** A scrape response gives the cache outcome here, not at the top level. */
  metadata?: object | null
}

/** A page's row of `results.csv`, RESULT_COLUMNS in order. */
export function evidenceRow(page: ResultPage): Array<string | number | null | undefined> {
  const record = page.evidenceRecord ?? null
  const metadata = (page.metadata ?? {}) as { cacheState?: string; cachedAt?: string }
  return [
    page.url ?? page.requestedUrl,
    page.status,
    record !== null ? record.reason : (page.failureReason || page.blockReason || page.budgetExceeded),
    record?.finalUrl,
    record?.fetchedAt,
    record?.httpStatus,
    record !== null ? record.lane : page.lane,
    record?.robotsDecision?.decision,
    record?.rawSha256,
    record?.outputSha256.markdown,
    record?.extractor.version,
    record?.extractor.commit,
    page.cacheState ?? metadata.cacheState,
    page.cachedAt ?? metadata.cachedAt,
    // passed, failed or not_requested (ADR 0006); empty from a server that does not verify.
    page.verification?.status ?? record?.verification?.status,
  ]
}

/** RFC 4180: a field with a comma, quote or line break is quoted, its quotes doubled; null is empty. */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One CSV line, CRLF-terminated as RFC 4180 has it. */
export function csvLine(fields: ReadonlyArray<string | number | null | undefined>): string {
  return `${fields.map(csvField).join(',')}\r\n`
}

/** The job's result files in `dir`, by absolute path: null until both are there; the Markdown directory once it is. */
export function resultFilesOf(dir: string): JobResultFiles | null {
  const jsonl = resolve(join(dir, RESULT_JSONL))
  const csv = resolve(join(dir, RESULT_CSV))
  const markdown = resolve(join(dir, RESULT_MARKDOWN_DIR))
  if (!existsSync(jsonl) || !existsSync(csv)) return null
  return existsSync(markdown) ? { jsonl, csv, markdown } : { jsonl, csv }
}

/**
 * Write a job's `results.jsonl`, `results.csv` and `markdown/` in `dir` from its pages, read a few at a time so a
 * thousand pages' Markdown is never held at once. A page with Markdown gets a file named by its line in the results
 * (markdownFileName), which its CSV row names. A failed or blocked page has none, though it may carry the Markdown of
 * the site's error page: the directory holds the pages that were read, ready to hand on. Everything is written under temporary names and
 * moved into place, the Markdown first, so a reader who finds the two files finds the Markdown too. Returns the paths.
 */
export async function writeResultFiles(dir: string, pages: () => AsyncIterable<readonly ResultPage[]>): Promise<Required<JobResultFiles>> {
  const jsonlPath = resolve(join(dir, RESULT_JSONL))
  const csvPath = resolve(join(dir, RESULT_CSV))
  const markdownPath = resolve(join(dir, RESULT_MARKDOWN_DIR))
  await rm(`${markdownPath}.tmp`, { recursive: true, force: true })
  await mkdir(`${markdownPath}.tmp`)
  const jsonl = await open(`${jsonlPath}.tmp`, 'w')
  const csv = await open(`${csvPath}.tmp`, 'w')
  try {
    await csv.write(csvLine(RESULT_FILE_COLUMNS))
    let n = 0
    for await (const chunk of pages()) {
      if (chunk.length === 0) continue
      await jsonl.write(chunk.map((page) => `${JSON.stringify(page)}\n`).join(''))
      const rows: string[] = []
      for (const page of chunk) {
        n++
        const file = typeof page.markdown === 'string' && READ_STATUSES.has(page.status ?? '') ? markdownFileName(n, page.url ?? page.requestedUrl ?? '') : null
        if (file !== null) await writeFile(join(`${markdownPath}.tmp`, file), page.markdown!)
        rows.push(csvLine([...evidenceRow(page), file === null ? null : `${RESULT_MARKDOWN_DIR}/${file}`]))
      }
      await csv.write(rows.join(''))
    }
  } finally {
    await Promise.all([jsonl.close(), csv.close()])
  }
  // A job written again (a handoff read more pages) keeps its old directory in place until the new one takes its name.
  await rm(`${markdownPath}.old`, { recursive: true, force: true })
  if (existsSync(markdownPath)) await rename(markdownPath, `${markdownPath}.old`)
  await rename(`${markdownPath}.tmp`, markdownPath)
  await rm(`${markdownPath}.old`, { recursive: true, force: true })
  await rename(`${jsonlPath}.tmp`, jsonlPath)
  await rename(`${csvPath}.tmp`, csvPath)
  return { jsonl: jsonlPath, csv: csvPath, markdown: markdownPath }
}
