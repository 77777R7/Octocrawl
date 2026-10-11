#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createPreviewServer } from './server.js'
import { firestoreQuotaFromEnv } from './quota.js'
import { firestoreAmazonGateFromEnv } from './amazonGate.js'
import { firestoreWaitlistFromEnv } from './waitlist.js'
import { validateAmazonPublicState } from './preview.js'
import { createAuthRoutes, FirestoreAccountStore, IdentityToolkit } from './auth.js'
import { createAccountRoutes, FirestoreAccountData } from './account.js'

if (process.env.W2L_CAPTURE_RAW_DIR) throw new Error('Anonymous preview cannot persist raw capture artifacts')
const stateFile = process.env.W2L_AMAZON_PUBLIC_STATE_FILE
const amazonState = stateFile ? readFileSync(stateFile, 'utf8') : null
if (amazonState !== null) validateAmazonPublicState(amazonState)
const port = Number(process.env.PORT ?? '8080')
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be a TCP port')
// Sign-in needs the project's Firebase web API key; without it the sign-in addresses are not served.
const firebaseApiKey = process.env.W2L_FIREBASE_API_KEY?.trim()
const staticDir = resolve(process.env.W2L_PUBLIC_WEB_DIST ?? 'apps/public-web/dist')
const auth = firebaseApiKey
  ? createAuthRoutes({
    identity: new IdentityToolkit(firebaseApiKey),
    accounts: new FirestoreAccountStore(process.env.W2L_FIRESTORE_PROJECT_ID ?? ''),
    // Trimmed as the hosted API trims it (hostedApiCli.ts), so a secret with a trailing newline gives both the same digests.
    secret: (process.env.W2L_QUOTA_HASH_KEY ?? '').trim(),
    log: line => console.log(JSON.stringify({ severity: 'INFO', ...line })),
    emailFinishPage: () => readFile(join(staticDir, 'signin', 'email', 'index.html'), 'utf8'),
  })
  : undefined
const monthlyCredits = Number(process.env.W2L_MONTHLY_CREDITS ?? 1_000)
if (!Number.isSafeInteger(monthlyCredits) || monthlyCredits < 1) throw new Error('W2L_MONTHLY_CREDITS must be a positive integer')
const account = auth === undefined ? undefined : createAccountRoutes({
  data: new FirestoreAccountData(process.env.W2L_FIRESTORE_PROJECT_ID ?? ''),
  hashKey: (process.env.W2L_QUOTA_HASH_KEY ?? '').trim(),
  current: auth.current,
  monthlyCredits,
})
const server = createPreviewServer({
  quota: firestoreQuotaFromEnv(),
  amazonGate: firestoreAmazonGateFromEnv(),
  staticDir,
  amazonState,
  enabled: process.env.W2L_PREVIEW_ENABLED !== 'false',
  visitorCookieSecret: process.env.W2L_QUOTA_HASH_KEY,
  evalToken: process.env.W2L_EVAL_TOKEN,
  sourceCommit: process.env.W2L_SOURCE_COMMIT,
  // Set only once the domain serves this service: page requests on any other host are then redirected to it.
  publicOrigin: process.env.W2L_PUBLIC_ORIGIN || undefined,
  // Shared with the Cloudflare Worker, so only it can name the domain and the visitor's address.
  proxySecret: process.env.W2L_PROXY_SECRET?.trim() || undefined,
  waitlist: firestoreWaitlistFromEnv(),
  ...(auth === undefined ? {} : { auth }),
  ...(account === undefined ? {} : { account }),
})
server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ service: 'w2l-public-preview', port, anonymousPreviewEnabled: process.env.W2L_PREVIEW_ENABLED !== 'false' }))
})
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close(() => process.exit(0)))
