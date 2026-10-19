/**
 * The Google Cloud services hosted jobs use beside Firestore (ROADMAP PH stage H1; docs/launch/2026-10-19-h1-hosted-jobs-plan.md §3):
 * a GCS bucket for checkpoints, page segments and exports, and a Cloud Tasks queue that delivers each slice. Both over REST
 * with the service identity's token, as the Firestore stores are, with no client library.
 */

import { createHash } from 'node:crypto'

/** The service identity's email, from the metadata server: the account signed URLs are signed as. */
export async function metadataServiceAccountEmail(fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3_000) })
  if (!response.ok) throw new Error('Cloud Run service identity is unavailable')
  return (await response.text()).trim()
}

/** Signs bytes as a service account with IAM Credentials `signBlob`, so no private key is kept in the image. */
export function iamSignBlob(email: string, token: () => Promise<string>, fetcher: typeof fetch = fetch): (bytes: Uint8Array) => Promise<Uint8Array> {
  return async (bytes) => {
    const response = await fetcher(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(email)}:signBlob`, {
      method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ payload: Buffer.from(bytes).toString('base64') }),
    })
    if (!response.ok) throw new Error(`signBlob failed (${response.status})`)
    const signature = (await response.json() as { signedBlob?: string }).signedBlob
    if (!signature) throw new Error('signBlob returned no signature')
    return new Uint8Array(Buffer.from(signature, 'base64'))
  }
}

/** An object name made of non-empty segments, none `.` or `..`, with no control character. */
function checkedObject(name: string): string {
  if (name.length === 0 || name.length > 1024 || /[\u0000-\u001f\u007f]/.test(name) || name.split('/').some((part) => part === '' || part === '.' || part === '..')) throw new Error('object name is malformed')
  return name
}

/** RFC 3986 encoding, as V4 signing requires: encodeURIComponent leaves !'()* as they are. */
const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export type UploadResult = { ok: true; generation: number } | { ok: false; reason: 'precondition' }

export class GcsBucket {
  constructor(
    private readonly bucket: string,
    private readonly token: () => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
    /** For signed URLs: the account and how to sign as it (iamSignBlob). */
    private readonly signer?: { email: string; signBlob: (bytes: Uint8Array) => Promise<Uint8Array> },
  ) {
    if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('bucket name is malformed')
  }

  /** Writes an object; `ifGenerationMatch` 0 means only when it does not exist yet. A lost precondition is not an error. */
  async upload(name: string, body: Uint8Array, options: { contentType: string; ifGenerationMatch?: number }): Promise<UploadResult> {
    const query = new URLSearchParams({ uploadType: 'media', name: checkedObject(name), ...(options.ifGenerationMatch === undefined ? {} : { ifGenerationMatch: String(options.ifGenerationMatch) }) })
    const response = await this.fetcher(`https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o?${query}`, {
      method: 'POST', headers: { authorization: `Bearer ${await this.token()}`, 'content-type': options.contentType }, body: new Uint8Array(body), signal: AbortSignal.timeout(60_000),
    })
    if (response.status === 412) return { ok: false, reason: 'precondition' }
    if (!response.ok) throw new Error(`object upload failed (${response.status})`)
    const generation = Number((await response.json() as { generation?: string }).generation)
    if (!Number.isSafeInteger(generation)) throw new Error('object upload returned no generation')
    return { ok: true, generation }
  }

  /** An object's bytes and generation; null when it does not exist. */
  async download(name: string): Promise<{ body: Uint8Array; generation: number } | null> {
    const response = await this.fetcher(`${this.objectUrl(name)}?alt=media`, { headers: { authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(60_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`object download failed (${response.status})`)
    const generation = Number(response.headers.get('x-goog-generation'))
    if (!Number.isSafeInteger(generation)) throw new Error('object download returned no generation')
    return { body: new Uint8Array(await response.arrayBuffer()), generation }
  }

  /** Deletes every object under a prefix that ends with a slash; returns how many. */
  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith('/') || prefix.length < 2) throw new Error('prefix must name a folder, ending with /')
    checkedObject(prefix.slice(0, -1))
    let deleted = 0
    let pageToken: string | undefined
    do {
      const query = new URLSearchParams({ prefix, fields: 'items(name),nextPageToken', ...(pageToken === undefined ? {} : { pageToken }) })
      const token = await this.token()
      const response = await this.fetcher(`https://storage.googleapis.com/storage/v1/b/${this.bucket}/o?${query}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`object listing failed (${response.status})`)
      const page = await response.json() as { items?: { name: string }[]; nextPageToken?: string }
      for (const item of page.items ?? []) {
        const removed = await this.fetcher(this.objectUrl(item.name), { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
        if (!removed.ok && removed.status !== 404) throw new Error(`object delete failed (${removed.status})`)
        deleted++
      }
      pageToken = page.nextPageToken
    } while (pageToken !== undefined)
    return deleted
  }

  /** A V4 signed GET URL for an object, valid `expiresSeconds` (at most 7 days, GCS's limit). */
  async signedUrl(name: string, expiresSeconds: number, now = new Date()): Promise<string> {
    if (this.signer === undefined) throw new Error('signed URLs need a signer')
    if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 604_800) throw new Error('a signed URL expires within 1 s to 7 days')
    const datetime = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const date = datetime.slice(0, 8)
    const scope = `${date}/auto/storage/goog4_request`
    const path = `/${this.bucket}/${checkedObject(name).split('/').map(rfc3986).join('/')}`
    const params: Record<string, string> = {
      'X-Goog-Algorithm': 'GOOG4-RSA-SHA256', 'X-Goog-Credential': `${this.signer.email}/${scope}`, 'X-Goog-Date': datetime,
      'X-Goog-Expires': String(expiresSeconds), 'X-Goog-SignedHeaders': 'host',
    }
    const query = Object.entries(params).map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).sort().join('&')
    const canonical = ['GET', path, query, 'host:storage.googleapis.com', '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
    const toSign = ['GOOG4-RSA-SHA256', datetime, scope, createHash('sha256').update(canonical).digest('hex')].join('\n')
    const signature = Buffer.from(await this.signer.signBlob(new TextEncoder().encode(toSign))).toString('hex')
    return `https://storage.googleapis.com${path}?${query}&X-Goog-Signature=${signature}`
  }

  private objectUrl(name: string): string {
    return `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(checkedObject(name))}`
  }
}

export interface QueueConfig { project: string; location: string; queue: string; /** The account whose OIDC token each delivery carries. */ serviceAccount: string }

export class CloudTasksQueue {
  private readonly parent: string
  constructor(private readonly config: QueueConfig, private readonly token: () => Promise<string>, private readonly fetcher: typeof fetch = fetch) {
    this.parent = `projects/${config.project}/locations/${config.location}/queues/${config.queue}`
  }

  /**
   * Queues a POST of `body` as JSON to `url`, named by `id` so that the same id queued twice is one task ('exists').
   * `deadlineSeconds` is how long a delivery may run (Cloud Tasks takes 15 s to 30 min); `scheduleTime` delays it.
   */
  async enqueue(task: { id: string; url: string; audience: string; body: unknown; deadlineSeconds: number; scheduleTime?: Date }): Promise<'created' | 'exists'> {
    if (!/^[A-Za-z0-9_-]{1,500}$/.test(task.id)) throw new Error('task id is malformed')
    if (!Number.isInteger(task.deadlineSeconds) || task.deadlineSeconds < 15 || task.deadlineSeconds > 1800) throw new Error('the dispatch deadline must be 15 s to 30 min')
    if (!task.url.startsWith('https://') || !task.audience.startsWith('https://')) throw new Error('a task target must be https')
    const response = await this.fetcher(`https://cloudtasks.googleapis.com/v2/${this.parent}/tasks`, {
      method: 'POST', headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ task: {
        name: `${this.parent}/tasks/${task.id}`,
        ...(task.scheduleTime === undefined ? {} : { scheduleTime: task.scheduleTime.toISOString() }),
        dispatchDeadline: `${task.deadlineSeconds}s`,
        httpRequest: {
          httpMethod: 'POST', url: task.url, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(task.body)).toString('base64'),
          oidcToken: { serviceAccountEmail: this.config.serviceAccount, audience: task.audience },
        },
      } }),
    })
    if (response.status === 409) return 'exists'
    if (!response.ok) throw new Error(`task create failed (${response.status})`)
    return 'created'
  }
}
