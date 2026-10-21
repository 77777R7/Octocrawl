import { describe, expect, it } from 'vitest'
import { jobsCloudFromEnv } from '../src/hostedJobsCloud.js'
import { newHostedJob } from '../src/hostedJobs.js'

const ENV = {
  W2L_FIRESTORE_PROJECT_ID: 'octocrawl-test', W2L_JOBS_BUCKET: 'octocrawl-jobs-test', W2L_JOBS_QUEUE: 'asia-southeast1/octocrawl-jobs',
  W2L_JOBS_WORKER_URL: 'https://octocrawl-jobs-abc.a.run.app/', W2L_JOBS_TASKS_ACCOUNT: 'tasks@octocrawl-test.iam.gserviceaccount.com',
}

/** The metadata server, Cloud Tasks and Firestore's hostedConfig/jobs, recording what was sent. */
function cloud(switchDoc: unknown | null) {
  const tasks: Array<{ url: string; task: Record<string, any> }> = []
  let switchReads = 0
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/service-accounts/default/token')) return Response.json({ access_token: 'token', expires_in: 3600 })
    if (url.endsWith('/service-accounts/default/email')) return new Response('jobs@octocrawl-test.iam.gserviceaccount.com')
    if (url.startsWith('https://cloudtasks.googleapis.com/')) { tasks.push({ url, task: (JSON.parse(String(init!.body)) as { task: Record<string, any> }).task }); return Response.json({}) }
    if (url.endsWith('/documents/hostedConfig/jobs')) { switchReads++; return switchDoc === null ? new Response('{}', { status: 404 }) : Response.json(switchDoc) }
    throw new Error(`unexpected ${url}`)
  }) as typeof fetch
  return { fetcher, tasks, reads: () => switchReads }
}

describe('jobs in the cloud, from the environment', () => {
  it('is off with none of the jobs variables, and refuses to start with only some', async () => {
    expect(await jobsCloudFromEnv({ W2L_FIRESTORE_PROJECT_ID: 'octocrawl-test' }, cloud(null).fetcher)).toBeNull()
    await expect(jobsCloudFromEnv({ ...ENV, W2L_JOBS_QUEUE: '' }, cloud(null).fetcher)).rejects.toThrow('hosted jobs need W2L_JOBS_QUEUE too')
    await expect(jobsCloudFromEnv({ ...ENV, W2L_JOBS_WORKER_URL: 'http://x' }, cloud(null).fetcher)).rejects.toThrow(/https/)
  })

  it('queues a slice by job and generation to the worker with an OIDC token for the queue\'s account, and an expiry at its time', async () => {
    const { fetcher, tasks } = cloud(null)
    const jobs = (await jobsCloudFromEnv(ENV, fetcher))!
    const job = { ...newHostedJob({ id: '6f1c2a4e-1b2c-4d3e-8f90-000000000001', workspaceId: 'ws_account-1', uid: 'account-1', keyId: 'k', kind: 'batch', request: {}, maxCredits: null }), generation: 3, expireAt: '2026-10-26T08:00:00.000Z' }
    await jobs.enqueueSlice(job)
    await jobs.enqueueExpiry(job)
    expect(tasks.map(({ url }) => url)).toEqual(Array(2).fill('https://cloudtasks.googleapis.com/v2/projects/octocrawl-test/locations/asia-southeast1/queues/octocrawl-jobs/tasks'))
    expect(tasks[0]!.task).toMatchObject({ name: expect.stringMatching(/\/tasks\/6f1c2a4e-1b2c-4d3e-8f90-000000000001-3$/), httpRequest: { url: 'https://octocrawl-jobs-abc.a.run.app/internal/jobs/6f1c2a4e-1b2c-4d3e-8f90-000000000001/slice', oidcToken: { serviceAccountEmail: ENV.W2L_JOBS_TASKS_ACCOUNT, audience: 'https://octocrawl-jobs-abc.a.run.app' } } })
    expect(Buffer.from(tasks[0]!.task.httpRequest.body, 'base64').toString()).toBe('{"generation":3}')
    expect(tasks[1]!.task).toMatchObject({ name: expect.stringMatching(/-expire$/), scheduleTime: '2026-10-26T08:00:00.000Z' })
    // A finished job's last delivery goes at once, by a name of its own, to the slice route (H2 webhook gaps).
    await jobs.enqueueFinish(job)
    expect(tasks[2]!.task).toMatchObject({ name: expect.stringMatching(/\/tasks\/6f1c2a4e-1b2c-4d3e-8f90-000000000001-finish$/), httpRequest: { url: 'https://octocrawl-jobs-abc.a.run.app/internal/jobs/6f1c2a4e-1b2c-4d3e-8f90-000000000001/slice' } })
    expect(tasks[2]!.task.scheduleTime).toBeUndefined()
  })

  it('reads the switch, on when its document is absent, and at most every 30 s', async () => {
    expect(await (await jobsCloudFromEnv(ENV, cloud(null).fetcher))!.enabled()).toBe(true)
    const off = cloud({ fields: { enabled: { booleanValue: false } } })
    const jobs = (await jobsCloudFromEnv(ENV, off.fetcher))!
    expect(await jobs.enabled()).toBe(false)
    expect(await jobs.enabled()).toBe(false)
    expect(off.reads()).toBe(1)
  })

  it('lets every account start jobs without allowedUids, only the listed ones with it, and no one when the first read fails (H2 R2)', async () => {
    const open = (await jobsCloudFromEnv(ENV, cloud({ fields: { enabled: { booleanValue: true } } }).fetcher))!
    expect(await open.allows('anyone')).toBe(true)
    const listed = cloud({ fields: { enabled: { booleanValue: true }, allowedUids: { arrayValue: { values: [{ stringValue: 'account-1' }, { stringValue: 'account-2' }] } } } })
    const invite = (await jobsCloudFromEnv(ENV, listed.fetcher))!
    expect([await invite.allows('account-1'), await invite.allows('account-2'), await invite.allows('account-3'), await invite.enabled()]).toEqual([true, true, false, true])
    // The list and the switch come from one read, kept 30 s.
    expect(listed.reads()).toBe(1)
    const empty = (await jobsCloudFromEnv(ENV, cloud({ fields: { allowedUids: { arrayValue: {} } } }).fetcher))!
    expect(await empty.allows('account-1')).toBe(false)
    const failing = cloud(null)
    const broken = (async (input: string | URL | Request, init?: RequestInit) => String(input).endsWith('/documents/hostedConfig/jobs') ? new Response('{}', { status: 500 }) : failing.fetcher(input, init)) as typeof fetch
    expect(await (await jobsCloudFromEnv(ENV, broken))!.allows('account-1')).toBe(false)
  })
})
