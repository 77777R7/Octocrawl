/**
 * The self-test of the regular-expression checks (ADR 0006, amendment of 2026-10-29), run where a server is about to take
 * them from callers: hosted Octocrawl's start (hostedRegex.ts and hostedChromeCli.ts in @w2l/mcp) and its images' build
 * (regexSelfTestCli.ts). What it shows holds for the Node it ran on, which is why the hosted images pin theirs.
 */
import { VERIFY_REGEX_CHECK_TYPES, type VerifyCheck } from '@w2l/contracts'
import { REGEX_VERIFY_POOL_MS, RegexPool, scanRegex } from './regexCheck.js'
import { verify } from './verify.js'

export interface RegexSelfTest {
  ok: boolean
  /** Each property that does not hold, in words. */
  failures: string[]
}

/**
 * Whether this process's engine bounds the checks as regexCheck.ts promises: a quadratic scan stops at its limit, near
 * it; a scan past the backtrack stack is an engine error, not a crash; and counts and matches are String.prototype.match's.
 * About 0.1 s. Its stopped scan is a regular expression ended mid-match: on Node 26.8.1 that leaves every later global
 * match in the process about 3.7 times slower (2026-10-29), which is why hosted Octocrawl runs on Node 22.
 */
export function regexBoundSelfTest(): RegexSelfTest {
  const failures: string[] = []
  const started = performance.now()
  const stopped = scanRegex('test', '(?:\\s|\\S)*x', 'm', 'ab'.repeat(100_000), new RegexPool(50))
  const took = performance.now() - started
  if (stopped.done || stopped.limit !== 'time' || stopped.limitMs !== 50) failures.push(`a quadratic scan did not stop at its 50 ms limit (${JSON.stringify(stopped)})`)
  else if (took > 50 + 150) failures.push(`a quadratic scan stopped ${Math.round(took - 50)} ms after its 50 ms limit`)
  const overflow = scanRegex('test', '^(a)*$', 'm', 'a'.repeat(4_300_000), new RegexPool(REGEX_VERIFY_POOL_MS))
  if (overflow.done || overflow.limit !== 'error') failures.push(`a scan past the backtrack stack was not an engine error (${JSON.stringify(overflow)})`)
  const emoji = '\u{1F600}a\u{1F600}'
  const counts: [string, string, string][] = [['a*', 'g', 'baab'], ['', 'ug', emoji], ['', 'g', emoji], ['a', 'yg', 'aab a'], ['k', 'iug', 'k K K'], ['^x', 'mg', 'x\nx'], ['\\$\\d+', 'g', 'from $5 to $120']]
  for (const [pattern, flags, subject] of counts) {
    const want = (subject.match(new RegExp(pattern, flags)) ?? []).length
    const got = scanRegex('count', pattern, flags, subject, new RegexPool(REGEX_VERIFY_POOL_MS))
    if (!got.done || got.value !== want) failures.push(`/${pattern}/${flags} counted ${JSON.stringify(got)}, String.prototype.match ${want}`)
  }
  const tests: [string, string, string][] = [['^b', 'm', 'a\nb'], ['^b', 'i', 'a\nb'], ['b', 'y', 'ab'], ['Price', 'i', 'PRICE 12']]
  for (const [pattern, flags, subject] of tests) {
    const want = new RegExp(pattern, flags).test(subject)
    const got = scanRegex('test', pattern, flags, subject, new RegexPool(REGEX_VERIFY_POOL_MS))
    if (!got.done || got.value !== want) failures.push(`/${pattern}/${flags} tested ${JSON.stringify(got)}, RegExp.prototype.test ${want}`)
  }
  return { ok: failures.length === 0, failures }
}

/** Markdown with what the task files' patterns look for: prices in several currencies and spaces, tables, links, scripts. */
const SAMPLE = [
  '# Tide report',
  '',
  'Release date: 2026-01-02 · **Population:** 84000 · Capital: Andorra la Vella · Warning! This is a demo website',
  'Prices: $12.99, $ 120, USD 45, EUR12, 1.234,56 €, 1 234,56 zł, 99,00 zł, 3 500 €, £7 per passenger, SGD 12.50, 12€, 1,234,567.89',
  'Rating 4.5 out of 5 stars · 1,234 reviews · 12.3K followers · 52 points by ada · Oct 30 · 7.5 percent · J123 AS4567',
  '[Next](https://www.amazon.com/dp/B0?pf_rd_p=abc) [Docs](http://example.com/a) [FT](https://www.ft.com/content/0123abcd-0123-4567-89ab-0123456789ab)',
  '',
  '| Team Name | Year | Wins | Losses |',
  '| --- | --- | --- | --- |',
  '| 1. | [Boston Celtics](https://www.espn.com/nba/team/_/name/bos) | 60 | 22 |',
  '| Canada | 38,250 | 1.5 t |',
  '',
  'Ünïcödé STRASSE straße K, 日本語のテキスト、中文内容 \u{1F600} data analyst · web-scraping · coffee',
].join('\n')

/** The texts the corpus is judged on: none, the sample, and the sample fifty times (about 30 KB). */
export const REGEX_CORPUS_SUBJECTS: readonly string[] = ['', SAMPLE, Array.from({ length: 50 }, () => SAMPLE).join('\n\n')]

/** Every regular-expression check in a JSON document, such as a task file (research/access/tasks.v1.json), once each. */
export function regexChecksIn(document: unknown): VerifyCheck[] {
  const found = new Map<string, VerifyCheck>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (value === null || typeof value !== 'object') return
    const { type, pattern, flags, min } = value as Record<string, unknown>
    if ((VERIFY_REGEX_CHECK_TYPES as readonly unknown[]).includes(type) && typeof pattern === 'string' && (flags === undefined || typeof flags === 'string')) {
      const check = (type === 'markdownCountMin'
        ? { type, pattern, ...(flags === undefined ? {} : { flags }), min: typeof min === 'number' ? min : 1 }
        : { type, pattern, ...(flags === undefined ? {} : { flags }) }) as VerifyCheck
      found.set(JSON.stringify([type, pattern, flags]), check)
    }
    Object.values(value).forEach(walk)
  }
  walk(document)
  return [...found.values()]
}

/**
 * The corpus half, for the images' build: each regular-expression check of `checks` judged by verify() on each subject,
 * against what the check meant before it had a time limit (verify/9): markdownMatches is RegExp.prototype.test with its
 * flags or m, markdownCountMin the length of String.prototype.match with g. The reference runs only after the bounded
 * judgement finished, so a pattern slow on a subject fails the test rather than holding it.
 */
export function regexCorpusSelfTest(checks: readonly VerifyCheck[], subjects: readonly string[] = REGEX_CORPUS_SUBJECTS): RegexSelfTest {
  const failures: string[] = []
  for (const check of checks) {
    if (check.type !== 'markdownMatches' && check.type !== 'markdownCountMin') continue
    for (const [index, markdown] of subjects.entries()) {
      const verification = verify({ checks: [check] }, { status: 'success', markdown })
      const judged = 'checks' in verification ? verification.checks[0] : undefined
      const about = `${check.type} /${check.pattern}/${check.flags ?? ''} on subject ${index}`
      if (judged === undefined || judged.passed === null || judged.limit !== undefined) { failures.push(`${about} was not judged (${JSON.stringify(judged)})`); continue }
      if (check.type === 'markdownMatches') {
        const want = new RegExp(check.pattern, check.flags ?? 'm').test(markdown)
        if (judged.passed !== want) failures.push(`${about} passed ${judged.passed}, RegExp.prototype.test ${want}`)
      } else {
        const want = (markdown.match(new RegExp(check.pattern, (check.flags ?? '').replace('g', '') + 'g')) ?? []).length
        if (judged.observedCount !== want) failures.push(`${about} counted ${judged.observedCount}, String.prototype.match ${want}`)
      }
    }
  }
  return { ok: failures.length === 0, failures }
}
