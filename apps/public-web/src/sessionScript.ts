/** The recorded W2L runs that How it works replays, and the static frame it shows otherwise.
 * Every value comes from a recorded result:
 * - Run 1: apps/public-web/content/introduction.md (capture 2026-09-24: success, title "Introduction",
 *   totalMs 2509, excerpt "Get Started\n# Introduction", final URL = requested URL);
 *   docs/evidence/r1-amazon-deployment-2026-09-25.md (11,761 characters of Markdown);
 *   research/section-b-firecrawl-monitor-evidence.generated.json (the first sentence after the heading).
 * - Run 2: docs/evidence/amazon-public-fixed-100-audit-2026-09-24.json record 42 (success, JSON complete,
 *   region and currency verified, clientMs 12539) and docs/evidence/dual-flow-mvp-local-100-2026-09-23.json
 *   page 42 (ASIN, Singapore 238823, SGD 290.67, seller Amazon US).
 * - Every preview reads robots.txt before fetching (packages/public-preview/src/preview.ts, robotsFailClosed).
 * The two times are different measurements and say so: run 1 recorded only the server's totalMs, run 2 only
 * the time the browser saw (the page's own "Total time"). */
export type Step = { doing: string; done: string; detail: string; ms: number; count?: number }
export type Out = { text: string; key?: string; check?: boolean }
export type Run = { typed: string; steps: Step[]; out: Out[]; result: string; time: string; hold: number }

export const RUNS: readonly Run[] = [
  {
    typed: 'docs.firecrawl.dev/introduction',
    steps: [
      { doing: 'Checking URL', done: 'Checked URL', detail: 'public · https', ms: 320 },
      { doing: 'Reading robots.txt', done: 'Read robots.txt', detail: 'allowed', ms: 420 },
      { doing: 'Fetching page', done: 'Fetched page', detail: 'no redirect', ms: 640 },
      { doing: 'Extracting', done: 'Extracted', detail: '11,761 chars', ms: 720, count: 11761 },
    ],
    out: [{ text: 'Get Started' }, { text: '# Introduction' }, { text: 'The web data API for AI agents.' }],
    result: 'success',
    time: 'server 2.51 s',
    hold: 4200,
  },
  {
    typed: 'www.amazon.sg/dp/B000NI69YA',
    steps: [
      { doing: 'Checking URL', done: 'Checked URL', detail: 'product page', ms: 320 },
      { doing: 'Reading robots.txt', done: 'Read robots.txt', detail: 'allowed', ms: 420 },
      { doing: 'Rendering page', done: 'Rendered page', detail: 'Singapore', ms: 980 },
      { doing: 'Matching product', done: 'Matched product', detail: 'ASIN matches', ms: 460 },
    ],
    out: [
      { key: 'asin', text: 'B000NI69YA', check: true },
      { key: 'region', text: 'Singapore 238823', check: true },
      { key: 'currency', text: 'SGD', check: true },
      { key: 'price', text: 'SGD 290.67', check: true },
      { key: 'seller', text: 'Amazon US' },
    ],
    result: 'verified',
    time: 'browser 12.54 s',
    hold: 4600,
  },
]

/** Fixed rows: 0 prompt, 2–5 steps, 7–11 output, 12 result; the others stay empty. */
export const SESSION_ROWS = 13

/** One row of a finished run: its state classes, mark, label and detail. */
export type FrameRow = readonly [state: string, mark: string, label: string, detail: string]

/** A run's final frame, row by row: the static frame (run 1) and the finished transcript the replay shows
 * while it yields to the form. */
export function finalFrame(index: number): FrameRow[] {
  const run = RUNS[index]
  const rows: FrameRow[] = Array.from({ length: SESSION_ROWS }, () => ['', '', '', ''] as const)
  rows[0] = ['is-prompt is-sent', '›', run.typed, '']
  run.steps.forEach((step, i) => { rows[2 + i] = ['is-step is-ok', '✓', step.done, step.detail] })
  run.out.forEach((line, i) => {
    rows[7 + i] = line.key ? [line.check ? 'is-field is-ok' : 'is-field', line.check ? '✓' : '', line.key, line.text] : ['is-out', '', line.text, '']
  })
  rows[SESSION_ROWS - 1] = ['is-result is-ok', '●', run.result, run.time]
  return rows
}

const escapeHtml = (text: string): string => text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`)
const row = ([state, mark, label, detail]: FrameRow): string =>
  `<p class="s-row${state ? ` ${state}` : ''}"><span class="s-mark">${escapeHtml(mark)}</span><span class="s-label">${escapeHtml(label)}</span><span class="s-detail">${escapeHtml(detail)}</span></p>`

/** The static window: the first run's final frame, shown before the replay starts and whenever it cannot run. */
export function sessionMarkup(): string {
  const corners = ['tl', 'tr', 'bl', 'br'].map((corner) => `<span class="s-corner is-${corner}"></span>`).join('')
  return `<div class="session"><div class="session-veil"></div><div class="session-window"><p class="session-head"><span class="kicker-square"></span><span>W2L session</span><span class="session-tag">recorded</span></p><div class="session-body">${finalFrame(0).map(row).join('')}</div>${corners}</div></div>`
}
