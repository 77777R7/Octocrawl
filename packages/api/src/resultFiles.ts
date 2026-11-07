/**
 * The files a job's results are written to: `results.jsonl`, a page a line, and `results.csv`, a row a page with its
 * evidence in RESULT_COLUMNS. A server on the person's computer writes them beside the task's checkpoint when the job
 * ends (engine.ts finishJob), and `octocrawl crawl --out` / `octocrawl batch --out` write them where asked, with the
 * Markdown of each page in a file beside (packages/cli). Hosted Octocrawl writes none: it keeps no files, and gives a
 * finished job's `export` link instead.
 */
import { existsSync } from 'node:fs'
import { open, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { EvidenceRecord, JobResultFiles, PageTable } from '@w2l/contracts'

export const RESULT_JSONL = 'results.jsonl'
export const RESULT_CSV = 'results.csv'

/**
 * The columns of `results.csv`, in order: those of the Python client's `to_pandas(include_markdown=False)`
 * (python/src/w2l/frame.py). A value Octocrawl did not observe is empty, never 0. The CLI adds `markdown_file`.
 */
export const RESULT_COLUMNS = [
  'url', 'status', 'reason', 'final_url', 'fetched_at', 'http_status', 'lane', 'robots_decision',
  'raw_sha256', 'markdown_sha256', 'extractor', 'source_commit', 'cache_state', 'cached_at', 'verification',
] as const

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

/** The job's result files in `dir`, by absolute path: null until both are there. */
export function resultFilesOf(dir: string): JobResultFiles | null {
  const jsonl = resolve(join(dir, RESULT_JSONL))
  const csv = resolve(join(dir, RESULT_CSV))
  return existsSync(jsonl) && existsSync(csv) ? { jsonl, csv } : null
}

/**
 * Write a job's `results.jsonl` and `results.csv` in `dir` from its pages, read a few at a time so a thousand pages'
 * Markdown is never held at once. The files are written whole under temporary names and moved into place, so a reader
 * finds both or neither. Returns their paths.
 */
export async function writeResultFiles(dir: string, pages: () => AsyncIterable<readonly ResultPage[]>): Promise<JobResultFiles> {
  const jsonlPath = resolve(join(dir, RESULT_JSONL))
  const csvPath = resolve(join(dir, RESULT_CSV))
  const jsonl = await open(`${jsonlPath}.tmp`, 'w')
  const csv = await open(`${csvPath}.tmp`, 'w')
  try {
    await csv.write(csvLine(RESULT_COLUMNS))
    for await (const chunk of pages()) {
      if (chunk.length === 0) continue
      await jsonl.write(chunk.map((page) => `${JSON.stringify(page)}\n`).join(''))
      await csv.write(chunk.map((page) => csvLine(evidenceRow(page))).join(''))
    }
  } finally {
    await Promise.all([jsonl.close(), csv.close()])
  }
  await rename(`${jsonlPath}.tmp`, jsonlPath)
  await rename(`${csvPath}.tmp`, csvPath)
  return { jsonl: jsonlPath, csv: csvPath }
}
