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
 *
 * Its connections leave through the address guard straight to the site, from Cloud Run's own egress: the record's exit
 * kind is `google`. An egress proxy, once one is chosen (ROADMAP stage H, D2), is the guard's dial, and the kind with it.
 */
import { createHostedChromeService, hostedChromePolicy, hostedChromeReader, serveHostedChrome } from './hostedChrome.js'

const port = Number(process.env.PORT ?? 8080)
if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT is a port number')
if ((process.env.DISPLAY ?? '') === '') throw new Error('DISPLAY is unset: hosted_chrome is headed, on the Xvfb display start.sh opens')
const reader = hostedChromeReader(hostedChromePolicy(process.env), 'google')
const { server } = await serveHostedChrome(createHostedChromeService(reader.read), port)
console.log(JSON.stringify({ severity: 'INFO', event: 'hosted_chrome_started', port, sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null }))
process.once('SIGTERM', () => {
  server.close()
  void reader.close().finally(() => process.exit(0))
})
