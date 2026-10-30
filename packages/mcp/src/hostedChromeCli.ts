#!/usr/bin/env node
/**
 * The `octocrawl-chrome` service on Cloud Run (ADR 0005, revision of 2026-10-27: `hosted_chrome`), from the environment.
 * Dockerfile.hosted-chrome starts it under tini, after Xvfb (deploy/hosted-chrome/start.sh). hostedChrome.ts has the
 * HTTP surface.
 *
 *   PORT                the port to listen on (Cloud Run sets it; default 8080)
 *   DISPLAY             the Xvfb display Chrome opens its window on (start.sh sets :99)
 *   W2L_CHROME_PATH     the pinned Google Chrome (the image's /usr/bin/google-chrome-stable is found without it)
 *   W2L_OPERATOR_CONTACT, W2L_OPERATOR_URL
 *                       the operator's contact, as on the hosted API (hostedChromePolicy)
 *   W2L_HOSTED_CHROME_PROXIES_FILE
 *                       the datacenter proxy list (D2, 2026-10-29), a Secret Manager secret mounted as a file of
 *                       `host:port:user:pass` lines; unset, the service leaves from Cloud Run's own egress
 *
 * It takes a task contract's regular-expression checks when its start-up self-test passes (regexBoundSelfTest in
 * @w2l/runtime; ADR 0006, amendment of 2026-10-29): its callers admitted them first. The startup line says which.
 *
 * Its connections leave through the address guard: straight to the site from Cloud Run's own egress (the record's exit
 * kind `google`), or through one of the operator's datacenter proxies, chosen for each read (`datacenter`;
 * hostedChromeEgress.ts). The startup line names the kind and how many proxies, never one of them.
 */
import { regexBoundSelfTest } from '@w2l/runtime'
import { createHostedChromeService, hostedChromePolicy, hostedChromeReader, serveHostedChrome } from './hostedChrome.js'
import { hostedChromeExitFromEnv } from './hostedChromeEgress.js'

const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT is a port number')
if ((process.env.DISPLAY ?? '') === '') throw new Error('DISPLAY is unset: hosted_chrome is headed, on the Xvfb display start.sh opens')
const exit = await hostedChromeExitFromEnv(process.env)
const regex = regexBoundSelfTest()
// One line a read that ran a regular-expression check: what its checks cost, never the page's text.
const regexLine = (stats: { scans: number; memoHits: number; totalMs: number; maxMs: number; maxCallMs: number; limited: number }) => console.log(JSON.stringify({ severity: 'INFO', event: 'regex_checks', kind: 'chrome_read', scans: stats.scans, memoHits: stats.memoHits, totalMs: Math.round(stats.totalMs * 10) / 10, maxMs: Math.round(stats.maxMs * 10) / 10, maxCallMs: Math.round(stats.maxCallMs * 10) / 10, limited: stats.limited }))
const reader = hostedChromeReader(hostedChromePolicy(process.env), exit, {}, undefined, regexLine)
const { server } = await serveHostedChrome(createHostedChromeService(reader.read, Date.now, { regexChecks: regex.ok }), port)
console.log(JSON.stringify({ severity: regex.ok ? 'INFO' : 'ERROR', event: 'hosted_chrome_started', port, egressKind: exit.kind, proxies: exit.count, regexChecks: regex.ok, ...(regex.ok ? {} : { regexFailures: regex.failures }), node: process.version, sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null }))
process.once('SIGTERM', () => {
  server.close()
  void reader.close().finally(() => process.exit(0))
})
