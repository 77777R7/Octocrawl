/**
 * How the hosted API and the job worker reach the job services in Google Cloud (ROADMAP PH H1), from the environment:
 *   W2L_FIRESTORE_PROJECT_ID   the project of Firestore, the bucket and the queue
 *   W2L_JOBS_BUCKET            the GCS bucket job files live in
 *   W2L_JOBS_QUEUE             the Cloud Tasks queue, as location/queue (e.g. asia-southeast1/octocrawl-jobs)
 *   W2L_JOBS_WORKER_URL        the worker service's URL: where slices are delivered, and the OIDC audience
 *   W2L_JOBS_TASKS_ACCOUNT     the service account each delivery's OIDC token is issued to
 * All five set: jobs are on. None set: off. Some set: a startup error naming the missing ones.
 */

import { serviceAccessToken } from './hostedApi.js'
import { CloudTasksQueue, GcsBucket, iamSignBlob, metadataServiceAccountEmail } from './hostedCloud.js'
import type { HostedJob } from './hostedJobs.js'

const NAMES = ['W2L_FIRESTORE_PROJECT_ID', 'W2L_JOBS_BUCKET', 'W2L_JOBS_QUEUE', 'W2L_JOBS_WORKER_URL', 'W2L_JOBS_TASKS_ACCOUNT'] as const

export interface JobsCloud {
  project: string
  bucket: GcsBucket
  workerUrl: string
  tasksAccount: string
  enqueueSlice: (job: HostedJob, delaySeconds?: number) => Promise<void>
  enqueueExpiry: (job: HostedJob) => Promise<void>
  enqueueWebhook: (job: HostedJob) => Promise<void>
  /** The global switch, `hostedConfig/jobs` field `enabled` (absent: on), read at most every 30 s. */
  enabled: () => Promise<boolean>
}

export async function jobsCloudFromEnv(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<JobsCloud | null> {
  const set = NAMES.filter((name) => (env[name] ?? '').trim() !== '')
  if (set.length === 0 || (set.length === 1 && set[0] === 'W2L_FIRESTORE_PROJECT_ID')) return null
  const missing = NAMES.filter((name) => !set.includes(name))
  if (missing.length > 0) throw new Error(`hosted jobs need ${missing.join(', ')} too`)
  const project = env.W2L_FIRESTORE_PROJECT_ID!.trim()
  const [location, queueName] = env.W2L_JOBS_QUEUE!.trim().split('/')
  if (!location || !queueName) throw new Error('W2L_JOBS_QUEUE must be location/queue')
  const workerUrl = env.W2L_JOBS_WORKER_URL!.trim().replace(/\/+$/, '')
  if (!workerUrl.startsWith('https://')) throw new Error('W2L_JOBS_WORKER_URL must be https')
  const tasksAccount = env.W2L_JOBS_TASKS_ACCOUNT!.trim()
  const token = serviceAccessToken(fetcher)
  // Signed links are signed as the service's own account, through IAM, with no key in the image.
  const email = await metadataServiceAccountEmail(fetcher)
  const signer = { email, signBlob: iamSignBlob(email, token, fetcher) }
  const bucket = new GcsBucket(env.W2L_JOBS_BUCKET!.trim(), token, fetcher, signer)
  const queue = new CloudTasksQueue({ project, location, queue: queueName, serviceAccount: tasksAccount }, token, fetcher)
  const deliver = (id: string, path: string, body: unknown, at?: Date) => queue.enqueue({ id, url: `${workerUrl}${path}`, audience: workerUrl, body, deadlineSeconds: 900, ...(at === undefined ? {} : { scheduleTime: at }) }).then(() => {})
  let switchRead: { at: number; on: boolean } | null = null
  return {
    project, bucket, workerUrl, tasksAccount,
    enqueueSlice: (job, delaySeconds = 0) => deliver(`${job.id}-${job.generation}`, `/internal/jobs/${job.id}/slice`, { generation: job.generation }, delaySeconds > 0 ? new Date(Date.now() + delaySeconds * 1000) : undefined),
    enqueueExpiry: (job) => deliver(`${job.id}-expire`, `/internal/jobs/${job.id}/expire`, {}, job.expireAt === null ? undefined : new Date(job.expireAt)),
    enqueueWebhook: (job) => deliver(`${job.id}-webhook`, `/internal/jobs/${job.id}/webhook`, {}),
    async enabled() {
      if (switchRead !== null && Date.now() - switchRead.at < 30_000) return switchRead.on
      try {
        const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/hostedConfig/jobs`, { headers: { authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(5_000) })
        const on = response.status === 404 ? true : response.ok ? (await response.json() as { fields?: { enabled?: { booleanValue?: boolean } } }).fields?.enabled?.booleanValue !== false : (switchRead?.on ?? true)
        switchRead = { at: Date.now(), on }
      } catch { switchRead = { at: Date.now(), on: switchRead?.on ?? true } }
      return switchRead.on
    },
  }
}
