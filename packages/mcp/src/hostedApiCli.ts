#!/usr/bin/env node
/**
 * Hosted Octocrawl on Cloud Run (ROADMAP PH phase 1): the hosted API and the
 * remote MCP endpoint, from the environment. docs/hosted-api.md has the deploy.
 *
 *   PORT                        the port to listen on (Cloud Run sets it; default 8080)
 *   W2L_TASK_ROOT               the engine's task root (default /tmp/octocrawl-hosted)
 *   W2L_QUOTA_HASH_KEY          at least 32 characters: HMAC key for key and address digests
 *   W2L_FIRESTORE_PROJECT_ID    the project whose Firestore holds hostedApiKeys, hostedQuotas, hostedLeases and oauthTokens
 *   W2L_HOSTED_STORE            `firestore` (default) or `memory` (a local run; nothing persists, no keys)
 *   W2L_PROXY_SECRET            shared with the Cloudflare Worker; proves CF-Connecting-IP
 *   W2L_KEYLESS_DAILY           keyless pages per address per UTC day (default 20)
 *   W2L_CLAUDE_DAILY            keyless pages per UTC day shared by every call from Claude's egress range (default 200)
 *   W2L_SITE_DAILY              pages for the whole service per UTC day (default 1500)
 *   W2L_MONTHLY_CREDITS         credits every account gets a month, spent by its keys (default 1000)
 *   W2L_PUBLIC_API_ORIGIN       the public address, for hints (e.g. https://api.octocrawl.dev)
 *   W2L_SOURCE_COMMIT           recorded in the startup line
 */
import { hostedProxyNotice } from '@w2l/contracts'
import { createHostedApi, FirestoreHostedKeys, FirestoreHostedLeases, FirestoreHostedOAuthTokens, FirestoreHostedQuota, MemoryHostedKeys, MemoryHostedLeases, MemoryHostedOAuthTokens, MemoryHostedQuota, serviceAccessToken, type HostedKeys, type HostedLeases, type HostedOAuthTokens, type HostedQuota } from './hostedApi.js'
import { FirestoreCreditsStore, MemoryCreditsStore, type CreditsStore } from './hostedCredits.js'

function positive(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

const port = positive('PORT', 8080)
// Trimmed as scripts/hosted/issue-key.mjs trims it, so a secret file with a trailing newline gives both sides the same digests.
const hashKey = (process.env.W2L_QUOTA_HASH_KEY ?? '').trim()
if (hashKey.length < 32) throw new Error('W2L_QUOTA_HASH_KEY must contain at least 32 characters')
const store = process.env.W2L_HOSTED_STORE ?? 'firestore'
const monthlyCredits = positive('W2L_MONTHLY_CREDITS', 1_000)
let keys: HostedKeys
let oauthTokens: HostedOAuthTokens
let quota: HostedQuota
let leases: HostedLeases
let credits: CreditsStore
if (store === 'memory') {
  keys = new MemoryHostedKeys(new Map())
  oauthTokens = new MemoryHostedOAuthTokens()
  quota = new MemoryHostedQuota()
  leases = new MemoryHostedLeases()
  credits = new MemoryCreditsStore(monthlyCredits)
} else if (store === 'firestore') {
  const project = process.env.W2L_FIRESTORE_PROJECT_ID
  if (!project) throw new Error('W2L_FIRESTORE_PROJECT_ID is required (or W2L_HOSTED_STORE=memory for a local run)')
  keys = new FirestoreHostedKeys(project)
  oauthTokens = new FirestoreHostedOAuthTokens(project)
  quota = new FirestoreHostedQuota(project)
  leases = new FirestoreHostedLeases(project)
  credits = new FirestoreCreditsStore(project, serviceAccessToken(), monthlyCredits)
} else throw new Error('W2L_HOSTED_STORE must be firestore or memory')

const notice = hostedProxyNotice(process.env)
if (notice) console.log(`octocrawl-hosted-api: ${notice}`)
const service = createHostedApi({
  port, host: '0.0.0.0',
  taskRoot: process.env.W2L_TASK_ROOT ?? '/tmp/octocrawl-hosted',
  hashKey, keys, oauthTokens, quota, leases, credits,
  proxySecret: process.env.W2L_PROXY_SECRET?.trim() || undefined,
  keylessDaily: positive('W2L_KEYLESS_DAILY', 20),
  claudeDaily: positive('W2L_CLAUDE_DAILY', 200),
  siteDaily: positive('W2L_SITE_DAILY', 1_500),
  publicOrigin: process.env.W2L_PUBLIC_API_ORIGIN || undefined,
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void service.close().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) }) })
console.log(JSON.stringify({ service: 'octocrawl-hosted-api', port, store, keylessDaily: positive('W2L_KEYLESS_DAILY', 20), claudeDaily: positive('W2L_CLAUDE_DAILY', 200), siteDaily: positive('W2L_SITE_DAILY', 1_500), monthlyCredits, sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null }))
