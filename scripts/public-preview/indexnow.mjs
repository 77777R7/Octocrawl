#!/usr/bin/env node
// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver and others share one endpoint) that the public site's
// pages exist or changed. Run it after a deploy that changes pages: `node scripts/public-preview/indexnow.mjs`.
//
// It reads the live sitemap and the live key file, so it submits only what the site really serves, and IndexNow
// checks the key against https://<host>/indexnow-key.txt (apps/public-web/public/indexnow-key.txt).

const origin = (process.env.W2L_PUBLIC_ORIGIN || 'https://octocrawl.dev').replace(/\/$/, '')

async function text(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

const key = (await text(`${origin}/indexnow-key.txt`)).trim()
if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error('The live IndexNow key file does not hold a valid key')
const urls = [...(await text(`${origin}/sitemap.xml`)).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
if (urls.length === 0) throw new Error('The live sitemap lists no URLs')
if (urls.some(url => new URL(url).origin !== origin)) throw new Error(`The sitemap lists URLs outside ${origin}`)

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}/indexnow-key.txt`, urlList: urls }),
  signal: AbortSignal.timeout(30_000),
})
// 200: accepted; 202: accepted, key validation pending. Anything else is a failure worth reading.
console.log(`IndexNow ${response.status} for ${urls.length} URLs from ${origin}`)
if (response.status !== 200 && response.status !== 202) {
  console.log(await response.text().catch(() => ''))
  process.exitCode = 1
}
