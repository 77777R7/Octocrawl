#!/usr/bin/env node
// Daily check that the hosted preview's anonymous Amazon.sg state still works. The state is a set of Singapore
// delivery cookies (Secret Manager `w2l-amazon-state`); when Amazon drops them, every product comes back
// `incomplete` with `region_unverified` while ordinary pages keep working, so nothing else notices.
//
// It previews a few fixed products through the public page's own API, as an anonymous visitor (one preview each,
// at most PRODUCTS.length a day); its user agent names it a bot, so page analytics count it as automated. It passes
// when any one comes back complete with a verified Singapore region and SGD; one product being unavailable must not
// raise an alarm. When every product fails, it exits 1 and says why,
// and the scheduled workflow (.github/workflows/amazon-state-check.yml) turns that into a failed run and an email.
// The fix is a fresh state: docs/public-preview.md, "Refresh the Amazon.sg state".

import { pathToFileURL } from 'node:url'

export const PRODUCTS = ['B0CS81Q6Z7', 'B000NI69YA']
export const DEFAULT_BASE = 'https://w2l-public-preview-307354954747.asia-southeast1.run.app'

/** One preview's outcome, reduced to what the check needs. */
export function summarize(asin, response) {
  const product = response?.product ?? null
  return {
    asin,
    status: response?.status ?? 'no_response',
    product: product?.status ?? null,
    region: product?.region ?? null,
    currency: product?.currency ?? null,
    code: response?.diagnostic?.code ?? null,
    reason: response?.reason ?? null,
  }
}

export function passed(result) {
  return result.status === 'success' && result.product === 'complete' && result.region !== null && result.currency === 'SGD'
}

/** The verdict over all products: pass if any passed; otherwise say whether it looks like the state. */
export function verdict(results) {
  if (results.some(passed)) return { ok: true, message: `Amazon.sg state works: ${results.filter(passed).map(r => r.asin).join(', ')} complete.` }
  const stateCodes = new Set(['region_unverified', 'currency_unverified'])
  const looksLikeState = results.length > 0 && results.every(r => stateCodes.has(r.code))
  return {
    ok: false,
    message: looksLikeState
      ? 'Every product came back without a verified Singapore region or currency: the Amazon.sg state has most likely expired. Refresh it (docs/public-preview.md, "Refresh the Amazon.sg state").'
      : 'No product came back complete, and not all for a region or currency reason: check the results below before refreshing the state.',
  }
}

async function preview(base, asin) {
  const response = await fetch(new URL('/api/preview', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'w2l-amazon-state-check-bot' },
    body: JSON.stringify({ url: `https://www.amazon.sg/dp/${asin}` }),
    signal: AbortSignal.timeout(70_000),
  })
  return response.json().catch(() => null)
}

async function main() {
  const base = process.env.W2L_PREVIEW_BASE_URL || DEFAULT_BASE
  const results = []
  for (const asin of PRODUCTS) {
    let result
    try { result = summarize(asin, await preview(base, asin)) }
    catch (error) { result = { ...summarize(asin, null), reason: error instanceof Error ? error.message : String(error) } }
    results.push(result)
    if (passed(result)) break
  }
  const { ok, message } = verdict(results)
  const table = ['| ASIN | status | product | region | currency | code | reason |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...results.map(r => `| ${r.asin} | ${r.status} | ${r.product ?? ''} | ${r.region ?? ''} | ${r.currency ?? ''} | ${r.code ?? ''} | ${r.reason ?? ''} |`)].join('\n')
  const report = `${ok ? 'PASS' : 'FAIL'}: ${message}\n\n${base}\n\n${table}\n`
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Amazon.sg state check\n\n${report}`)
  }
  process.exitCode = ok ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
