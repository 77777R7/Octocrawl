/** The recorded Octocrawl runs that How it works replays, and the static frame it shows otherwise.
 * Each run shows one recorded capture, and nothing from any other:
 * - Run 1: apps/public-web/content/introduction.md, a capture on the hosted preview at octocrawl.dev on 2026-10-08
 *   (revision copy-7b9ef7f, source commit 7b9ef7f): success, title "Overview of HTTP", final URL = requested URL,
 *   server totalMs 873, and the recorded Markdown starting "# Overview of HTTP" then "**HTTP** is a [protocol](…) for
 *   fetching resources such as HTML documents." The second line is shown without its link target and cut short.
 *   Its length (19,214 characters) is not replayed, so the replay does not count characters.
 * - Run 2: docs/evidence/amazon-holdout-100-2026-09-23.json record 42, a local capture on 2026-09-23 at source
 *   commit 991097f (stdio MCP → local API → browser): ASIN B000NI69YA selected as requested, title, SGD 290.67,
 *   seller Amazon US, each matched against the captured page; Singapore 238823 seen on it; clientMs 3998.5.
 * - Neither record states the robots.txt decision, so the replay says the file was checked, not what it said.
 *   (Every capture reads robots.txt before the page: packages/bench/src/robotsLookup.ts.)
 * The two times are different measurements and say so: run 1 recorded the server's totalMs, run 2 the client's. */
export type Step = { doing: string; done: string; detail: string; ms: number; count?: number }
export type Out = { text: string; key?: string; check?: boolean }
export type Run = { typed: string; steps: Step[]; out: Out[]; result: string; time: string; hold: number }

export const RUNS: readonly Run[] = [
  {
    typed: 'developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview',
    steps: [
      { doing: 'Checking URL', done: 'Checked URL', detail: 'public · https', ms: 320 },
      { doing: 'Reading robots.txt', done: 'Read robots.txt', detail: 'checked', ms: 420 },
      { doing: 'Fetching page', done: 'Fetched page', detail: 'no redirect', ms: 640 },
      { doing: 'Extracting', done: 'Extracted', detail: 'Markdown', ms: 720 },
    ],
    out: [{ text: '# Overview of HTTP' }, { text: '**HTTP** is a protocol for fetching resources…' }],
    result: 'success',
    time: 'server 0.87 s',
    hold: 4200,
  },
  {
    typed: 'www.amazon.sg/dp/B000NI69YA',
    steps: [
      { doing: 'Checking URL', done: 'Checked URL', detail: 'product page', ms: 320 },
      { doing: 'Reading robots.txt', done: 'Read robots.txt', detail: 'checked', ms: 420 },
      { doing: 'Rendering page', done: 'Rendered page', detail: 'Singapore', ms: 980 },
      { doing: 'Matching product', done: 'Matched product', detail: 'ASIN matches', ms: 460 },
    ],
    out: [
      { key: 'asin', text: 'B000NI69YA', check: true },
      { key: 'region', text: 'Singapore 238823', check: true },
      { key: 'price', text: 'SGD 290.67', check: true },
      { key: 'seller', text: 'Amazon US', check: true },
      { key: 'title', text: 'Fluke 116 HVAC Multimeter, Standard', check: true },
    ],
    result: 'complete',
    time: 'client 4.00 s',
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
  return `<div class="session"><div class="session-veil"></div><div class="session-window"><p class="session-head"><span class="kicker-square"></span><span>Octocrawl session</span><span class="session-tag">recorded</span></p><div class="session-body">${finalFrame(0).map(row).join('')}</div>${corners}</div></div>`
}
