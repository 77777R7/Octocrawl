#!/usr/bin/env node
/** Convert a frozen W2L MCP batch response into a small, source-backed CSV pilot. */
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [batchPath, outputPath] = process.argv.slice(2)
if (!batchPath || !outputPath) {
  console.error('Usage: node scripts/section-c/export-datacenter-partner-pilot.mjs <batch-items.json> <output-directory>')
  process.exit(2)
}
const manifestPath = resolve('research/datacenter-partner-pilot-manifest.v1.json')
const manifestBytes = await readFile(manifestPath)
const manifest = JSON.parse(manifestBytes.toString('utf8'))
const batchBytes = await readFile(resolve(batchPath))
const batch = JSON.parse(batchBytes.toString('utf8'))
const urls = manifest.sources.map(source => source.url)
if (manifest.rules.denominator !== 7 || new Set(urls).size !== 7 || !Array.isArray(batch.items) || batch.items.length !== 7) {
  throw new Error('frozen sample count or uniqueness changed')
}
const byUrl = new Map(batch.items.map(item => [item.url, item]))
if (byUrl.size !== 7 || urls.some(url => !byUrl.has(url))) throw new Error('batch URLs do not match the frozen manifest')

function csv(rows) {
  return rows.map(row => row.map(value => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }).join(',')).join('\n') + '\n'
}
function cleanInteger(value) {
  if (!/^[\d,]+$/.test(value)) throw new Error(`unexpected integer: ${value}`)
  return Number(value.replaceAll(',', ''))
}
function sourceItem(id) {
  const url = manifest.sources.find(source => source.id === id)?.url
  const item = byUrl.get(url)
  if (!item || item.status !== 'success' || !item.evidence?.rawBodySha256 || typeof item.markdown !== 'string') {
    throw new Error(`${id} did not produce a source-backed Markdown result`)
  }
  return item
}

const doe = sourceItem('doe-2024-release')
const sentence = doe.markdown.match(/total data center electricity usage climbed from (\d+) TWh in (\d{4}) to (\d+) TWh in (\d{4}) and estimates an increase between (\d+) to (\d+) TWh by (\d{4})/i)
if (!sentence) throw new Error('DOE source sentence missing; do not infer model values')
const [, oldValue, oldYear, newValue, newYear, lowValue, highValue, futureYear] = sentence
const doeRows = [
  ['year', 'twh', 'estimate_type', 'scenario', 'source_url', 'raw_body_sha256', 'retrieved_at_utc'],
  [oldYear, oldValue, 'historical_model_estimate', '', doe.url, doe.evidence.rawBodySha256, doe.createdAt],
  [newYear, newValue, 'historical_model_estimate', '', doe.url, doe.evidence.rawBodySha256, doe.createdAt],
  [futureYear, lowValue, 'projection', 'low', doe.url, doe.evidence.rawBodySha256, doe.createdAt],
  [futureYear, highValue, 'projection', 'high', doe.url, doe.evidence.rawBodySha256, doe.createdAt],
]

const eia = sourceItem('eia-state-2024')
if (!/Data for:\s*2024(?:\D|$)/.test(eia.markdown)) throw new Error('EIA source year not verified as 2024')
const lines = eia.markdown.split('\n')
const headerIndex = lines.findIndex(line => line === '| Name | Average retail price (cents/kWh) | Net summer capacity (MW) | Net generation (MWh) | Total retail sales (MWh) |')
if (headerIndex < 0 || !/^\| ---/.test(lines[headerIndex + 1] ?? '')) throw new Error('EIA table header missing')
const records = []
for (let index = headerIndex + 2; /^\|/.test(lines[index] ?? ''); index++) {
  const fields = lines[index].split('|').slice(1, -1).map(part => part.trim())
  if (fields.length !== 5 || !/^[A-Za-z .]+$/.test(fields[0]) || !/^\d+\.\d+$/.test(fields[1])) throw new Error('malformed EIA table row')
  records.push({ name: fields[0], price: fields[1], capacity: cleanInteger(fields[2]), generation: cleanInteger(fields[3]), sales: cleanInteger(fields[4]) })
}
const national = records.find(row => row.name === 'U.S. Total')
const states = records.filter(row => row.name !== 'U.S. Total')
if (!national || states.length !== 51 || new Set(states.map(row => row.name)).size !== 51 || !states.some(row => row.name === 'District of Columbia')) {
  throw new Error('EIA state/DC grain or national total is incomplete')
}
const sums = { capacity: 0, generation: 0, sales: 0 }
for (const row of states) {
  if (+row.price <= 0 || row.capacity <= 0 || row.generation <= 0 || row.sales <= 0) throw new Error('nonpositive EIA numeric field')
  sums.capacity += row.capacity; sums.generation += row.generation; sums.sales += row.sales
}
if (sums.generation !== national.generation || sums.sales !== national.sales) throw new Error('EIA state totals disagree with the displayed U.S. totals')
const eiaRows = [
  ['state', 'year', 'average_retail_price_cents_per_kwh', 'net_summer_capacity_mw', 'net_generation_mwh', 'total_retail_sales_mwh', 'source_url', 'raw_body_sha256', 'retrieved_at_utc'],
  ...states.map(row => [row.name, '2024', row.price, row.capacity, row.generation, row.sales, eia.url, eia.evidence.rawBodySha256, eia.createdAt]),
]

const results = manifest.sources.map(source => {
  const item = byUrl.get(source.url)
  return {
    id: source.id, requestedUrl: source.url, finalUrl: item.evidence?.finalUrl ?? null,
    kind: source.kind, status: item.status, failureReason: item.failureReason ?? null,
    blockReason: item.blockReason ?? null, httpStatus: item.evidence?.httpStatus ?? null,
    contentType: item.evidence?.contentType ?? null, rawBodySha256: item.evidence?.rawBodySha256 ?? null,
    markdownCharacters: item.markdown?.length ?? 0, capturedAt: item.createdAt ?? null,
  }
})
const counts = Object.fromEntries(['success', 'blocked', 'failed', 'incomplete'].map(status => [status, results.filter(row => row.status === status).length]))
const report = {
  manifestId: manifest.id,
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  batchTaskId: batch.taskId,
  privateBatchArtifactSha256: createHash('sha256').update(batchBytes).digest('hex'),
  operatorCheckoutCommit: /^[a-f0-9]{40}$/.test(batch.operatorCheckoutCommit ?? '') ? batch.operatorCheckoutCommit : null,
  denominator: 7, counts, results,
  exports: {
    doe: { rows: 4, sourceSentence: sentence[0], caveat: 'Historical modeled estimates and future projections are separate; this is not a regression time series.' },
    eia: { rows: 51, grain: 'state or District of Columbia in 2024', role: 'electricity context, not data-center use', stateMinusNational: {
      capacityMw: sums.capacity - national.capacity,
      generationMwh: sums.generation - national.generation,
      retailSalesMwh: sums.sales - national.sales,
    } },
  },
}
await mkdir(resolve(outputPath), { recursive: true })
await Promise.all([
  writeFile(resolve(outputPath, 'doe-datacenter-energy-w2l-evidence.csv'), csv(doeRows)),
  writeFile(resolve(outputPath, 'eia-state-electricity-2024-w2l.csv'), csv(eiaRows)),
  writeFile(resolve(outputPath, 'run-summary.json'), JSON.stringify(report, null, 2) + '\n'),
])
console.log(JSON.stringify({ taskId: batch.taskId, counts, eiaRows: 51, doeRows: 4, capacityDeltaMw: sums.capacity - national.capacity }))
