/**
 * The hosted job worker service (ROADMAP PH H1): `node packages/mcp/dist/hostedJobsCli.js` on the hosted API's image.
 * It takes Cloud Tasks deliveries only (OIDC for W2L_JOBS_TASKS_ACCOUNT, audience W2L_JOBS_WORKER_URL) and runs a slice each.
 * Environment: the five jobs variables (hostedJobsCloud.ts), and
 *   PORT                        default 8080
 *   W2L_MONTHLY_CREDITS         as the hosted API's (default 1000)
 *   W2L_JOBS_DAILY              job pages a UTC day for every account together (default 10000)
 *   W2L_JOBS_ACCOUNT_DAILY      job pages a UTC day for one account (default 2000)
 *   W2L_JOBS_WORK_ROOT          where slices keep task directories (default /tmp/octocrawl-jobs)
 *   W2L_EXTRACT_PROVIDER, W2L_EXTRACT_MODEL, W2L_EXTRACT_API_KEY
 *                               as the hosted API's: the json model fallback for a job's pages (hostedModel.ts)
 *   W2L_HOSTED_CHROME_URL, W2L_HOSTED_CHROME_ATTESTATION, W2L_HOSTED_CHROME_EGRESS
 *                               as the hosted API's: hosted_chrome's operator config, all three or none (hostedChromeOperator.ts)
 * A slice's pages hold the compatible transport while `hostedConfig/compatibleTransport` grants it to the job's account
 * (hostedAccess.ts), read when the slice starts; hosted_chrome likewise by `hostedConfig/hostedChrome`, for a job that
 * chose access enhanced, counted against the same D5 numbers as the hosted API's scrapes.
 */
import { loadImpit, structuredModelConfigFromEnv } from '@w2l/api'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHttpsWebhookTransport } from '@w2l/runtime'
import { FirestoreHostedLeases, FirestoreHostedQuota, serviceAccessToken } from './hostedApi.js'
import { FirestoreCreditsStore } from './hostedCredits.js'
import { FirestoreHostedJobStore } from './hostedJobs.js'
import { jobsCloudFromEnv } from './hostedJobsCloud.js'
import { googleOidcVerifier, startJobWorker } from './hostedJobWorker.js'
import { FirestoreModelSpend, firestoreModelSettings, HostedModel } from './hostedModel.js'
import { firestoreHostedAccess } from './hostedAccess.js'
import { FirestoreHostedChromeSpend } from './hostedChromeMeter.js'
import { hostedChromeConfigFromEnv, hostedChromeOperator } from './hostedChromeOperator.js'

function positive(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

const cloud = await jobsCloudFromEnv(process.env)
if (cloud === null) throw new Error('the job worker needs W2L_FIRESTORE_PROJECT_ID, W2L_JOBS_BUCKET, W2L_JOBS_QUEUE, W2L_JOBS_WORKER_URL and W2L_JOBS_TASKS_ACCOUNT')
// impit, the compatible transport's native module, loaded now: a platform without it stops the start, not a slice.
await loadImpit()
const access = firestoreHostedAccess(cloud.project, serviceAccessToken())
// hosted_chrome (ADR 0005, revision of 2026-10-27): its rung only with the operator's config, counted as the hosted API's reads are.
const chromeConfig = hostedChromeConfigFromEnv(process.env)
const hostedChrome = chromeConfig === null ? undefined : hostedChromeOperator(chromeConfig, { settings: access, spend: new FirestoreHostedChromeSpend(cloud.project, serviceAccessToken()), quota: new FirestoreHostedQuota(cloud.project) })
const worker = await startJobWorker({
  port: positive('PORT', 8080),
  verify: googleOidcVerifier({ audience: cloud.workerUrl, email: cloud.tasksAccount }),
  deps: {
    store: new FirestoreHostedJobStore(cloud.project, serviceAccessToken()),
    credits: new FirestoreCreditsStore(cloud.project, serviceAccessToken(), positive('W2L_MONTHLY_CREDITS', 1_000)),
    files: cloud.bucket,
    enqueueSlice: cloud.enqueueSlice,
    enqueueExpiry: cloud.enqueueExpiry,
    enqueueWebhook: cloud.enqueueWebhook,
    webhookTransport: createHttpsWebhookTransport(hostedNetworkPolicy()),
    hostLeases: new FirestoreHostedLeases(cloud.project),
    enabled: cloud.enabled,
    model: new HostedModel({ model: structuredModelConfigFromEnv(), settings: firestoreModelSettings(cloud.project, serviceAccessToken()), spend: new FirestoreModelSpend(cloud.project, serviceAccessToken()) }),
    access,
    ...(hostedChrome === undefined ? {} : { hostedChrome }),
    workRoot: process.env.W2L_JOBS_WORK_ROOT ?? '/tmp/octocrawl-jobs',
    limits: { jobsDaily: positive('W2L_JOBS_DAILY', 10_000), jobsAccountDaily: positive('W2L_JOBS_ACCOUNT_DAILY', 2_000) },
  },
})
console.log(JSON.stringify({ service: 'octocrawl-jobs', port: worker.server.address(), project: cloud.project, extractModel: structuredModelConfigFromEnv()?.model ?? null, hostedChrome: chromeConfig === null ? null : { egress: chromeConfig.egress?.vendor ?? 'google' }, sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null }))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void worker.close().then(() => process.exit(0)) })
