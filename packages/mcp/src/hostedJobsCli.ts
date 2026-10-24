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
 */
import { structuredModelConfigFromEnv } from '@w2l/api'
import { hostedNetworkPolicy } from '@w2l/contracts'
import { createHttpsWebhookTransport } from '@w2l/runtime'
import { FirestoreHostedLeases, serviceAccessToken } from './hostedApi.js'
import { FirestoreCreditsStore } from './hostedCredits.js'
import { FirestoreHostedJobStore } from './hostedJobs.js'
import { jobsCloudFromEnv } from './hostedJobsCloud.js'
import { googleOidcVerifier, startJobWorker } from './hostedJobWorker.js'
import { FirestoreModelSpend, firestoreModelSettings, HostedModel } from './hostedModel.js'

function positive(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`)
  return value
}

const cloud = await jobsCloudFromEnv(process.env)
if (cloud === null) throw new Error('the job worker needs W2L_FIRESTORE_PROJECT_ID, W2L_JOBS_BUCKET, W2L_JOBS_QUEUE, W2L_JOBS_WORKER_URL and W2L_JOBS_TASKS_ACCOUNT')
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
    workRoot: process.env.W2L_JOBS_WORK_ROOT ?? '/tmp/octocrawl-jobs',
    limits: { jobsDaily: positive('W2L_JOBS_DAILY', 10_000), jobsAccountDaily: positive('W2L_JOBS_ACCOUNT_DAILY', 2_000) },
  },
})
console.log(JSON.stringify({ service: 'octocrawl-jobs', port: worker.server.address(), project: cloud.project, extractModel: structuredModelConfigFromEnv()?.model ?? null, sourceCommit: process.env.W2L_SOURCE_COMMIT ?? null }))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void worker.close().then(() => process.exit(0)) })
