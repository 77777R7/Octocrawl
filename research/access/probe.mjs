// Library-level differential probe for the PA access task set (label: library_probe).
//
// Not the product path: three single requests per URL through the same egress (the environment
// proxy), to form a hypothesis for `suspected`, never a verdict. Arms:
//   undici       Octocrawl's standard-mode User-Agent (Chrome/128) and plain browser-like headers
//   impit chrome impit's own Chrome profile and its own headers
//   impit w2l    impit's chrome125 profile with Octocrawl's User-Agent
// A pass is HTTP 200, more than 2,000 bytes and no challenge wording; the wording check is crude
// (a page that mentions reCAPTCHA in a footer counts as a challenge).
//
// impit is not a dependency of the repository. Run it from a scratch folder:
//   npm install impit@0.14.5 undici@7 && HTTPS_PROXY=... node probe.mjs <input.json> <out.json>
// where input.json is {"results":[{"url":..., "status":..., "failureReason":..., "httpStatus":..., "lane":...}]}.
import { readFile, writeFile } from 'node:fs/promises'
import { request, ProxyAgent, interceptors } from 'undici'
import { Impit } from 'impit'
const [harvestFile, outFile] = process.argv.slice(2)
const proxy = process.env.HTTPS_PROXY
const W2L_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const { results } = JSON.parse(await readFile(harvestFile, 'utf8'))
const targets = results
const agent = (proxy ? new ProxyAgent(proxy) : new (await import('undici')).Agent()).compose(interceptors.redirect({ maxRedirections: 5 }))
const impitDefault = new Impit({ browser: 'chrome', proxyUrl: proxy, timeout: 30000 })
const impitW2l = new Impit({ browser: 'chrome125', proxyUrl: proxy, timeout: 30000, headers: { 'user-agent': W2L_UA } })
const look = (status, headers, text) => ({
  status, bytes: text.length,
  cfMitigated: headers.get?.('cf-mitigated') ?? headers['cf-mitigated'] ?? null,
  server: headers.get?.('server') ?? headers.server ?? null,
  title: (text.match(/<title[^>]*>([^<]{0,80})/i)?.[1] ?? '').trim(),
  challengeText: /just a moment|checking your browser|verify you are human|access denied|captcha|attention required/i.test(text),
})
async function arm(fn) { try { return await fn() } catch (e) { return { error: String(e).slice(0, 160) } } }
const rows = []
for (const t of targets) {
  const undici = await arm(async () => {
    const r = await request(t.url, { dispatcher: agent, headersTimeout: 30000, bodyTimeout: 30000,
      headers: { 'user-agent': W2L_UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US' } })
    return look(r.statusCode, r.headers, await r.body.text())
  })
  const impitChrome = await arm(async () => { const r = await impitDefault.fetch(t.url); return look(r.status, r.headers, await r.text()) })
  const impitW2lUa = await arm(async () => { const r = await impitW2l.fetch(t.url); return look(r.status, r.headers, await r.text()) })
  rows.push({ url: t.url, harvest: { status: t.status, reason: t.failureReason ?? t.blockReason, http: t.httpStatus, lane: t.lane }, undici, impitChrome, impitW2lUa, label: 'library_probe' })
  console.log(t.url, '|', undici.status ?? undici.error?.slice(0, 30), '|', impitChrome.status ?? impitChrome.error?.slice(0, 30), '|', impitW2lUa.status ?? impitW2lUa.error?.slice(0, 30))
}
await writeFile(outFile, JSON.stringify({ meta: { at: new Date().toISOString(), proxy, label: 'library_probe', arms: ['undici + Octocrawl standard UA (Chrome/128)', "impit browser 'chrome' with its own headers", "impit browser 'chrome125' with the Octocrawl UA"] }, rows }, null, 2))
