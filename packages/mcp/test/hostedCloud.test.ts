import { createHash, createVerify, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { CloudTasksQueue, GcsBucket } from '../src/hostedCloud.js'

const NOW = new Date('2026-10-19T08:00:00Z')

/** A GCS JSON API stand-in: objects with generations, ifGenerationMatch checked, listing by prefix in pages of two. */
function fakeGcs() {
  const objects = new Map<string, { body: Uint8Array; generation: number; contentType: string }>()
  const calls: string[] = []
  let generation = 100
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}${url.search}`)
    if (url.pathname === '/upload/storage/v1/b/jobs-bucket/o' && method === 'POST') {
      const name = url.searchParams.get('name')!
      const match = url.searchParams.get('ifGenerationMatch')
      const existing = objects.get(name)
      if (match !== null && Number(match) !== (existing?.generation ?? 0)) return new Response('{}', { status: 412 })
      const body = new Uint8Array(await new Response(init!.body as BodyInit).arrayBuffer())
      objects.set(name, { body, generation: ++generation, contentType: (init!.headers as Record<string, string>)['content-type']! })
      return new Response(JSON.stringify({ name, generation: String(generation) }), { status: 200 })
    }
    const prefix = '/storage/v1/b/jobs-bucket/o'
    if (url.pathname === prefix && method === 'GET') {
      const names = [...objects.keys()].filter((name) => name.startsWith(url.searchParams.get('prefix') ?? '')).sort()
      // A cursor, as GCS's is: the page after the last name returned, so deleting while listing skips nothing.
      const after = url.searchParams.get('pageToken')
      const rest = after === null ? names : names.filter((name) => name > after)
      const page = rest.slice(0, 2)
      return new Response(JSON.stringify({ items: page.map((name) => ({ name })), ...(rest.length > 2 ? { nextPageToken: page.at(-1) } : {}) }), { status: 200 })
    }
    if (url.pathname.startsWith(`${prefix}/`)) {
      const name = decodeURIComponent(url.pathname.slice(prefix.length + 1))
      const object = objects.get(name)
      if (!object) return new Response('{}', { status: 404 })
      if (method === 'DELETE') { objects.delete(name); return new Response(null, { status: 204 }) }
      return new Response(new Uint8Array(object.body), { status: 200, headers: { 'x-goog-generation': String(object.generation) } })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
  return { objects, calls, fetcher }
}

describe('GCS bucket', () => {
  it('uploads with a generation precondition, downloads with the generation, and refuses a stale write', async () => {
    const gcs = fakeGcs()
    const bucket = new GcsBucket('jobs-bucket', async () => 'token', gcs.fetcher)
    const first = await bucket.upload('w/ws_account-1/jobs/job-1/checkpoint.sqlite', new TextEncoder().encode('one'), { contentType: 'application/octet-stream', ifGenerationMatch: 0 })
    expect(first).toEqual({ ok: true, generation: 101 })
    // A second "first" upload loses: the object exists.
    expect(await bucket.upload('w/ws_account-1/jobs/job-1/checkpoint.sqlite', new TextEncoder().encode('two'), { contentType: 'application/octet-stream', ifGenerationMatch: 0 })).toEqual({ ok: false, reason: 'precondition' })
    expect(await bucket.upload('w/ws_account-1/jobs/job-1/checkpoint.sqlite', new TextEncoder().encode('two'), { contentType: 'application/octet-stream', ifGenerationMatch: 101 })).toEqual({ ok: true, generation: 102 })
    const read = await bucket.download('w/ws_account-1/jobs/job-1/checkpoint.sqlite')
    expect(read && new TextDecoder().decode(read.body)).toBe('two')
    expect(read?.generation).toBe(102)
    expect(await bucket.download('w/ws_account-1/jobs/job-1/missing')).toBeNull()
    // The object name is one encoded path segment.
    expect(gcs.calls.at(-1)).toBe('GET /storage/v1/b/jobs-bucket/o/w%2Fws_account-1%2Fjobs%2Fjob-1%2Fmissing?alt=media')
  })

  it('deletes everything under a prefix across listing pages, and nothing outside it', async () => {
    const gcs = fakeGcs()
    const bucket = new GcsBucket('jobs-bucket', async () => 'token', gcs.fetcher)
    for (const name of ['a/1', 'a/2', 'a/3', 'ab/1', 'b/1']) await bucket.upload(name, new Uint8Array([1]), { contentType: 'application/octet-stream' })
    expect(await bucket.deletePrefix('a/')).toBe(3)
    expect([...gcs.objects.keys()].sort()).toEqual(['ab/1', 'b/1'])
    await expect(bucket.deletePrefix('')).rejects.toThrow(/prefix/)
  })

  it('refuses an object name with an empty, dot or control segment', async () => {
    const bucket = new GcsBucket('jobs-bucket', async () => 'token', fakeGcs().fetcher)
    for (const name of ['', 'a//b', '../a', 'a/./b', 'a/\nb']) await expect(bucket.download(name), JSON.stringify(name)).rejects.toThrow(/object name/)
  })

  it('signs a V4 download URL through signBlob, that the service account\'s key verifies and that expires', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const signed: Uint8Array[] = []
    const signBlob = async (bytes: Uint8Array) => { signed.push(bytes); return new Uint8Array(sign('RSA-SHA256', bytes, privateKey)) }
    const bucket = new GcsBucket('jobs-bucket', async () => 'token', fakeGcs().fetcher, { email: 'jobs@octocrawl-test.iam.gserviceaccount.com', signBlob })
    const url = new URL(await bucket.signedUrl('w/ws_account-1/jobs/job-1/export.jsonl.gz', 900, NOW))
    expect(url.origin + url.pathname).toBe('https://storage.googleapis.com/jobs-bucket/w/ws_account-1/jobs/job-1/export.jsonl.gz')
    expect(Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'X-Goog-Signature'))).toEqual({
      'X-Goog-Algorithm': 'GOOG4-RSA-SHA256', 'X-Goog-Credential': 'jobs@octocrawl-test.iam.gserviceaccount.com/20261019/auto/storage/goog4_request',
      'X-Goog-Date': '20261019T080000Z', 'X-Goog-Expires': '900', 'X-Goog-SignedHeaders': 'host',
    })
    // What was signed is the V4 string to sign of this request, and the signature in the URL is that signature in hex.
    const query = [...url.searchParams].filter(([k]) => k !== 'X-Goog-Signature').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join('&')
    const canonical = ['GET', url.pathname, query, 'host:storage.googleapis.com', '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
    const toSign = ['GOOG4-RSA-SHA256', '20261019T080000Z', '20261019/auto/storage/goog4_request', createHash('sha256').update(canonical).digest('hex')].join('\n')
    expect(new TextDecoder().decode(signed[0])).toBe(toSign)
    const verifier = createVerify('RSA-SHA256'); verifier.update(toSign)
    expect(verifier.verify(publicKey, Buffer.from(url.searchParams.get('X-Goog-Signature')!, 'hex'))).toBe(true)
    await expect(bucket.signedUrl('a', 604_801, NOW)).rejects.toThrow(/expires/)
  })
})

describe('Cloud Tasks queue', () => {
  function fakeTasks() {
    const created: Array<{ url: string; body: { task: Record<string, any> } }> = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { task: Record<string, any> }
      if (created.some((c) => c.body.task.name === body.task.name)) return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 })
      created.push({ url: String(input), body })
      return new Response(JSON.stringify(body.task), { status: 200 })
    }) as typeof fetch
    return { created, fetcher }
  }

  it('creates a named HTTP task with an OIDC token, a deadline and a schedule, and treats the same name again as already queued', async () => {
    const tasks = fakeTasks()
    const queue = new CloudTasksQueue({ project: 'octocrawl-test', location: 'asia-southeast1', queue: 'octocrawl-jobs', serviceAccount: 'tasks@octocrawl-test.iam.gserviceaccount.com' }, async () => 'token', tasks.fetcher)
    const target = { url: 'https://octocrawl-jobs-abc.a.run.app/internal/jobs/job-1/slice', audience: 'https://octocrawl-jobs-abc.a.run.app' }
    expect(await queue.enqueue({ id: 'job-1-0', ...target, body: { generation: 0 }, deadlineSeconds: 900, scheduleTime: new Date('2026-10-19T08:00:30Z') })).toBe('created')
    expect(await queue.enqueue({ id: 'job-1-0', ...target, body: { generation: 0 }, deadlineSeconds: 900 })).toBe('exists')
    expect(tasks.created).toHaveLength(1)
    const { url, body } = tasks.created[0]!
    expect(url).toBe('https://cloudtasks.googleapis.com/v2/projects/octocrawl-test/locations/asia-southeast1/queues/octocrawl-jobs/tasks')
    expect(body.task).toEqual({
      name: 'projects/octocrawl-test/locations/asia-southeast1/queues/octocrawl-jobs/tasks/job-1-0',
      scheduleTime: '2026-10-19T08:00:30.000Z', dispatchDeadline: '900s',
      httpRequest: { httpMethod: 'POST', url: target.url, headers: { 'content-type': 'application/json' }, body: Buffer.from('{"generation":0}').toString('base64'),
        oidcToken: { serviceAccountEmail: 'tasks@octocrawl-test.iam.gserviceaccount.com', audience: target.audience } },
    })
  })

  it('refuses a malformed task id, a deadline outside Cloud Tasks\' 15 s to 30 min, and a non-https target', async () => {
    const queue = new CloudTasksQueue({ project: 'octocrawl-test', location: 'asia-southeast1', queue: 'octocrawl-jobs', serviceAccount: 'tasks@x.iam.gserviceaccount.com' }, async () => 'token', fakeTasks().fetcher)
    const ok = { id: 'job-1-0', url: 'https://jobs.example/run', audience: 'https://jobs.example', body: {}, deadlineSeconds: 900 }
    await expect(queue.enqueue({ ...ok, id: 'job/1' })).rejects.toThrow(/task id/)
    await expect(queue.enqueue({ ...ok, deadlineSeconds: 14 })).rejects.toThrow(/deadline/)
    await expect(queue.enqueue({ ...ok, deadlineSeconds: 1801 })).rejects.toThrow(/deadline/)
    await expect(queue.enqueue({ ...ok, url: 'http://jobs.example/run' })).rejects.toThrow(/https/)
  })
})
