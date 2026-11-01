// The pure parts of scripts/seo/geo-run.mjs: reading the GEO prompt library (docs/seo/library/geo-prompts.md), reading
// an assistant's answer, and counting a run as docs/seo/library/geo-protocol.md §2 defines its measures. Whether an
// answer recommends Octocrawl and whether what it says is right are judged by a person against the check points; the
// numbers here are only the ones a program can read.

export const OUTCOMES = { 应提及: 'should', 视条件: 'conditional', 不应提及: 'shouldNot' }

// Octocrawl's own places. A citation of octocrawl.dev is the protocol's citation measure; the repository and the
// packages are counted apart.
export const SITE_HOST = 'octocrawl.dev'
const OFFICIAL_ELSEWHERE = [/^https?:\/\/(www\.)?github\.com\/77777r7\/octocrawl(\/|$|[?#])/i, /^https?:\/\/(www\.)?npmjs\.com\/package\/(octocrawl|@octocrawl\/)/i, /^https?:\/\/pypi\.org\/project\/octocrawl-client(\/|$)/i]

// The products an answer may name, matched as words, case-insensitive; the first pattern is the name we record. Built
// from the library's competitor column; names that are also ordinary words (Ref, Spider, Distill, Exa, Unstructured,
// Parallel) are matched only in a form that cannot be a word, or not at all, so a count is a floor and the review sheet
// decides.
export const PRODUCTS = [
  ['Firecrawl'], ['Jina Reader', 'Jina AI', 'r\\.jina\\.ai', 'Jina'], ['Crawl4AI'], ['Apify'], ['Bright Data', 'BrightData'],
  ['ScrapingBee'], ['ZenRows'], ['Context7'], ['Playwright'], ['Puppeteer'], ['Selenium'], ['Tavily'], ['Octoparse'],
  ['Trafilatura'], ['Scrapfly'], ['Mozilla Readability', 'Readability\\.js', '@mozilla/readability'], ['Screaming Frog'],
  ['changedetection\\.io'], ['Visualping'], ['Distill\\.io', 'Distill Web Monitor'], ['Scrapling'], ['Olostep'],
  ['Exa\\.ai', 'Exa (?:API|AI|MCP|search)'], ['Docfork'], ['Ref\\.tools'],
  ['Bardeen'], ['Browserless'], ['Browserbase'], ['Steel\\.dev', 'Steel browser'], ['Hyperbrowser'], ['Stagehand'],
  ['Scrapy'], ['Beautiful ?Soup'], ['Diffbot'], ['Oxylabs'], ['ScraperAPI'], ['Scrape\\.do'], ['SerpApi'], ['spider\\.cloud'],
  ['mcp-server-fetch', 'Fetch MCP', 'fetch MCP server'], ['Kagi'], ['markdownify'], ['Turndown'], ['Mintlify'],
].map(([name, ...rest]) => ({ name: name.replace(/\\/g, ''), pattern: new RegExp(`(?<![\\w.-])(?:${[name, ...rest].join('|')})(?![\\w-])`, 'i') }))
export const OCTOCRAWL = /octocrawl/i

const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim())

/** The prompts of the library, in its order: { id, core, topic, prompt, type, outcome, mode, competitors, source, page },
 * with the check points of each ID as `checks` (null when the library has none). Throws when a row does not have the
 * library's ten columns, an outcome is unknown, or an ID repeats, so a changed table is not read wrong. */
export function parsePrompts(markdown) {
  const prompts = []
  const checks = new Map()
  let inChecks = false
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) inChecks = line.startsWith('## 核对要点')
    if (!/^\| P\d\d-\d\d /.test(line)) continue
    const row = cells(line)
    if (inChecks) {
      if (row.length !== 3) throw new Error(`check point row ${row[0]} has ${row.length} columns, not 3`)
      checks.set(row[0], row[1].split('；').map(text => text.trim()).filter(Boolean))
      continue
    }
    if (row.length !== 10) throw new Error(`prompt row ${row[0]} has ${row.length} columns, not 10`)
    const [id, core, topic, prompt, type, outcomeText, mode, competitors, source, page] = row
    const outcome = OUTCOMES[outcomeText]
    if (!outcome) throw new Error(`prompt ${id} has an unknown outcome ${JSON.stringify(outcomeText)}`)
    if (prompts.some(entry => entry.id === id)) throw new Error(`prompt ${id} appears twice`)
    prompts.push({ id, core: core === '●', topic, prompt, type, outcome, mode, competitors: competitors.split(',').map(name => name.trim()).filter(Boolean), source, page })
  }
  return prompts.map(entry => ({ ...entry, checks: checks.get(entry.id) ?? null }))
}

/** What a Claude Messages answer says and cites. `responses` are the API's messages for one question in order (more
 * than one when the server paused the turn and the request was sent again): the answer is the text of all of them,
 * `cited` the URLs its text cites, `searched` the URLs its web searches returned, each once in first-seen order. */
export function readClaudeAnswer(responses) {
  const text = []
  const cited = []
  const searched = []
  const add = (list, url) => { if (typeof url === 'string' && !list.includes(url)) list.push(url) }
  for (const response of responses) {
    for (const block of response.content ?? []) {
      if (block.type === 'text') {
        text.push(block.text)
        for (const citation of block.citations ?? []) add(cited, citation.url)
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const result of block.content) add(searched, result.url)
      }
    }
  }
  const last = responses.at(-1)
  return { text: text.join(''), cited, searched, model: last?.model ?? null, stopReason: last?.stop_reason ?? null }
}

const hostOf = url => { try { return new URL(url).hostname.toLowerCase() } catch { return null } }
const onSite = url => { const host = hostOf(url); return host === SITE_HOST || (host?.endsWith(`.${SITE_HOST}`) ?? false) }

/** The measures one answer gives: whether it names Octocrawl, the products it names in the order it first names them,
 * the octocrawl.dev pages it cites, and Octocrawl's other places (repository, packages) it cites. */
export function analyzeAnswer(answer) {
  const named = PRODUCTS
    .map(product => ({ name: product.name, at: answer.text.search(product.pattern) }))
    .filter(entry => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map(entry => entry.name)
  return {
    mentioned: OCTOCRAWL.test(answer.text),
    named,
    citedSite: answer.cited.filter(onSite),
    citedOfficialElsewhere: answer.cited.filter(url => OFFICIAL_ELSEWHERE.some(pattern => pattern.test(url))),
    searchedSite: answer.searched.filter(onSite),
  }
}

/** The 95% Wilson interval of `hits` out of `n`, or null when n is 0. */
export function wilson(hits, n, z = 1.96) {
  if (n === 0) return null
  const p = hits / n
  const denominator = 1 + z * z / n
  const centre = (p + z * z / (2 * n)) / denominator
  const half = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / denominator
  return [Math.max(0, centre - half), Math.min(1, centre + half)]
}

const rate = (hits, n) => ({ hits, n, share: n === 0 ? null : hits / n, interval: wilson(hits, n) })

// An answer that stopped for one of these did not finish, so it is a failed run, not an answer that left Octocrawl out.
export const UNFINISHED_STOPS = ['max_tokens', 'model_context_window_exceeded']

/** A round's counts from its answer records ({ id, run, outcome, error?, analysis?, refused? }) and the runs it planned
 * ({ id, run }): failed runs and planned runs with no answer on file are listed and left out of every denominator
 * (protocol §3); mention rate per outcome group, citation rate over all valid answers, and Octocrawl's share of all
 * product names (each product counted once per answer). Recommendation and correctness are a person's judgement and are
 * not here. */
export function summarizeRound(records, planned) {
  const onFile = new Set(records.map(record => `${record.id}#${record.run}`))
  const valid = records.filter(record => !record.error)
  const groups = {}
  for (const outcome of Object.values(OUTCOMES)) {
    const answers = valid.filter(record => record.outcome === outcome)
    groups[outcome] = rate(answers.filter(record => record.analysis.mentioned).length, answers.length)
  }
  const productCounts = new Map()
  for (const record of valid) for (const name of record.analysis.named) productCounts.set(name, (productCounts.get(name) ?? 0) + 1)
  const octocrawlNames = valid.filter(record => record.analysis.mentioned).length
  const allNames = [...productCounts.values()].reduce((sum, count) => sum + count, 0) + octocrawlNames
  return {
    planned: planned.length,
    answers: records.length,
    notAsked: planned.filter(entry => !onFile.has(`${entry.id}#${entry.run}`)).map(entry => ({ id: entry.id, run: entry.run })),
    valid: valid.length,
    failed: records.filter(record => record.error).map(record => ({ id: record.id, run: record.run, error: record.error })),
    refused: valid.filter(record => record.refused).map(record => ({ id: record.id, run: record.run })),
    mention: groups,
    citation: rate(valid.filter(record => record.analysis.citedSite.length > 0).length, valid.length),
    citedOfficialElsewhere: valid.filter(record => record.analysis.citedOfficialElsewhere.length > 0).length,
    namedNotCited: valid.filter(record => record.analysis.mentioned && record.analysis.citedSite.length === 0).length,
    citedNotNamed: valid.filter(record => !record.analysis.mentioned && record.analysis.citedSite.length > 0).length,
    shareOfNames: rate(octocrawlNames, allNames),
    products: [...productCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, answers]) => ({ name, answers })),
    citedPages: countUrls(valid.flatMap(record => record.analysis.citedSite)),
  }
}

function countUrls(urls) {
  const counts = new Map()
  for (const url of urls) counts.set(url, (counts.get(url) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([url, answers]) => ({ url, answers }))
}

const percent = value => (value === null ? 'unknown' : `${(value * 100).toFixed(1)}%`)
const interval = range => (range === null ? '' : ` (95% ${percent(range[0])} to ${percent(range[1])})`)
const tally = counts => (Object.keys(counts).length ? Object.entries(counts).map(([key, n]) => `${key} (${n})`).join(', ') : 'unknown')
const rateCell = r => `${r.hits}/${r.n} ${percent(r.share)}${interval(r.interval)}`

/** The round's numbers as Markdown, for the dated record (protocol §3) to quote. */
export function renderRound(meta, summary) {
  const lines = [
    `# GEO round ${meta.round}`,
    '',
    `Platform: ${meta.platform} through its API (protocol rule 5: API answers are not what the app shows). Model: ${meta.models.join(', ') || 'unknown'}. Web search on, location ${meta.location}. Prompts: ${meta.prompts} × ${meta.runs} runs.`,
    '',
    `Asked ${meta.askedFrom ?? 'unknown'} to ${meta.askedTo ?? 'unknown'}. Route, as each answer recorded it: ${tally(meta.routes)}. Source commit when asked: ${tally(meta.commits)}.`,
    '',
    `Planned runs: ${summary.planned}; not asked yet: ${summary.notAsked.length}; answers on file: ${summary.answers}; valid ${summary.valid}; failed or unfinished ${summary.failed.length}. Runs not asked and failed runs are left out of every denominator${summary.refused.length ? `; refused ${summary.refused.length} (valid, counted as not mentioning)` : ''}.`,
    '',
    '| Measure | Value |',
    '|---|---|',
    `| Mention rate, should-mention prompts | ${rateCell(summary.mention.should)} |`,
    `| Mention rate, conditional prompts | ${rateCell(summary.mention.conditional)} |`,
    `| False mention, should-not-mention prompts (named; whether recommended is judged by hand) | ${rateCell(summary.mention.shouldNot)} |`,
    `| Citation rate (an octocrawl.dev page cited), all valid answers | ${rateCell(summary.citation)} |`,
    `| Named but no octocrawl.dev citation / cited but not named | ${summary.namedNotCited} / ${summary.citedNotNamed} |`,
    `| Repository or package cited | ${summary.citedOfficialElsewhere} |`,
    `| Octocrawl's share of product names | ${rateCell(summary.shareOfNames)} |`,
    '',
    'Runs of one prompt are not independent, so the intervals are narrower than the truth (protocol §3).',
    '',
    '## Products named (answers naming each, at least)',
    '',
    ...summary.products.map(product => `- ${product.name}: ${product.answers}`),
    '',
    '## octocrawl.dev pages cited',
    '',
    ...(summary.citedPages.length ? summary.citedPages.map(page => `- ${page.url}: ${page.answers}`) : ['- none']),
  ]
  if (summary.notAsked.length) lines.push('', '## Runs not asked yet', '', ...summary.notAsked.map(entry => `- ${entry.id} run ${entry.run}`))
  if (summary.failed.length) lines.push('', '## Failed or unfinished runs', '', ...summary.failed.map(entry => `- ${entry.id} run ${entry.run}: ${entry.error}`))
  return `${lines.join('\n')}\n`
}

/** The review sheet: every answer that names Octocrawl, with its prompt's check points, for the correctness and
 * recommendation judgement (protocol §2), and every should-mention answer that does not, for the gap step (§4). */
export function renderReview(records, prompts) {
  const byId = new Map(prompts.map(prompt => [prompt.id, prompt]))
  const valid = records.filter(record => !record.error)
  const named = valid.filter(record => record.analysis.mentioned)
  const missed = valid.filter(record => !record.analysis.mentioned && record.outcome === 'should')
  const lines = ['# Review sheet', '', `Answers naming Octocrawl: ${named.length}. Should-mention answers that do not: ${missed.length}.`, '']
  for (const record of named) {
    const prompt = byId.get(record.id)
    lines.push(`## ${record.id} run ${record.run} (${record.outcome})`, '', `Prompt: ${prompt.prompt}`, '', 'Check points:', ...(prompt.checks ?? ['(none in the library)']).map(check => `- [ ] ${check}`), '', `Cited octocrawl.dev: ${record.analysis.citedSite.join(', ') || 'none'}`, '', 'Answer:', '', ...record.text.split('\n').map(line => `> ${line}`), '', 'Recommended: ☐ yes ☐ named only. All check points right: ☐ yes ☐ no (error type: ).', '')
  }
  if (missed.length) lines.push('## Should-mention answers without Octocrawl', '', ...missed.map(record => `- ${record.id} run ${record.run}: ${record.analysis.named.join(', ') || 'no product named'}`), '')
  return `${lines.join('\n')}\n`
}
