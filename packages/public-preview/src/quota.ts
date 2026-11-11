import { createHmac } from 'node:crypto'
import { throwIfExecutionStopped, type ExecutionBudget } from '@w2l/http-core'

export type QuotaDecision = 'ok' | 'visitor_limited' | 'global_limited'

/** Previews per visitor, and for the whole site, per UTC day. */
export const VISITOR_DAILY_PREVIEWS = 5
export const SITE_DAILY_PREVIEWS = 150
/**
 * Previews per client address (an IPv6 address by its /64) per UTC day, whatever visitor cookies it sends. The site hands
 * a new signed cookie to any page view, so a client that dropped its cookie was a new visitor each time and could use up
 * the site's day alone (found 2026-11-11). Three visitors' worth, so that people behind one shared address still get
 * their own five.
 */
export const ADDRESS_DAILY_PREVIEWS = 15

/** What a visitor has left today: never more than the site or its address has left, so the page cannot promise a
 * preview a wider limit would refuse. A used-up address reads as the visitor's own limit. */
export interface QuotaStatus {
  decision: QuotaDecision
  limit: number
  remaining: number
}

export function quotaStatus(siteUsed: number, visitorUsed: number, addressUsed = 0): QuotaStatus {
  const decision: QuotaDecision = siteUsed >= SITE_DAILY_PREVIEWS ? 'global_limited'
    : visitorUsed >= VISITOR_DAILY_PREVIEWS || addressUsed >= ADDRESS_DAILY_PREVIEWS ? 'visitor_limited' : 'ok'
  const remaining = decision === 'ok' ? Math.min(VISITOR_DAILY_PREVIEWS - visitorUsed, ADDRESS_DAILY_PREVIEWS - addressUsed, SITE_DAILY_PREVIEWS - siteUsed) : 0
  return { decision, limit: VISITOR_DAILY_PREVIEWS, remaining }
}

/** When a day's counters may go: one day after that UTC day ends. A Firestore TTL policy on `expireAt` in the
 * publicPreviewQuotas collection group deletes them after that (docs/public-preview.md). */
export function quotaExpiry(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2))
}

/** `visitor` is the cookie's visitor (`visitor:<id>`) or, without one, `ip:<address>`; `address` is the client's address
 * group (clientAddressGroup in server.ts), counted against ADDRESS_DAILY_PREVIEWS beside it. Without an address only
 * the visitor and the site are counted. */
export interface PreviewQuota {
  /** Advisory read-only check before acquiring a scarce origin permit. */
  check?(visitor: string, now?: Date, execution?: ExecutionBudget, address?: string): Promise<QuotaDecision>
  /** Read-only: what this visitor has left today. Never writes a counter. */
  status?(visitor: string, now?: Date, execution?: ExecutionBudget, address?: string): Promise<QuotaStatus>
  consume(visitor: string, now?: Date, execution?: ExecutionBudget, address?: string): Promise<QuotaDecision>
}

interface FirestoreDocument {
  name: string
  fields?: { count?: { integerValue?: string } }
  updateTime?: string
}

interface DocumentRead {
  name: string
  count: number
  updateTime: string | null
}

/** Atomic two-counter compare-and-swap. A failed Firestore request never grants a scrape. */
export class FirestorePreviewQuota implements PreviewQuota {
  private readonly resourceBase: string
  private readonly endpointBase: string

  constructor(
    projectId: string,
    private readonly hashKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    if (hashKey.length < 32) throw new Error('W2L_QUOTA_HASH_KEY must contain at least 32 characters')
    // Firestore Document.name is a resource name, not the REST endpoint URL.
    this.resourceBase = `projects/${projectId}/databases/(default)/documents`
    this.endpointBase = `https://firestore.googleapis.com/v1/${this.resourceBase}`
  }

  private names(visitor: string, now: Date, address: string | undefined): { global: string; individual: string; address: string | null } {
    const day = now.toISOString().slice(0, 10)
    const hash = (key: string) => createHmac('sha256', this.hashKey).update(`${day}:${key}`).digest('hex')
    return {
      global: `${this.resourceBase}/publicPreviewQuotas/${day}-global`,
      individual: `${this.resourceBase}/publicPreviewQuotas/${day}-${hash(visitor)}`,
      // `address:` never begins a visitor key (`visitor:` or `ip:`), so the two counters cannot share a document.
      address: address === undefined ? null : `${this.resourceBase}/publicPreviewQuotas/${day}-${hash(`address:${address}`)}`,
    }
  }

  private async readAll(names: { global: string; individual: string; address: string | null }, token: string, execution: ExecutionBudget): Promise<DocumentRead[]> {
    return Promise.all([names.global, names.individual, ...(names.address === null ? [] : [names.address])].map(name => this.read(name, token, execution)))
  }

  async check(visitor: string, now = new Date(), execution: ExecutionBudget = {}, address?: string): Promise<QuotaDecision> {
    return (await this.status(visitor, now, execution, address)).decision
  }

  async status(visitor: string, now = new Date(), execution: ExecutionBudget = {}, address?: string): Promise<QuotaStatus> {
    throwIfExecutionStopped(execution)
    const names = this.names(visitor, now, address)
    const token = await this.accessToken(execution)
    const [all, own, group] = await this.readAll(names, token, execution)
    throwIfExecutionStopped(execution)
    return quotaStatus(all!.count, own!.count, group?.count ?? 0)
  }

  async consume(visitor: string, now = new Date(), execution: ExecutionBudget = {}, address?: string): Promise<QuotaDecision> {
    const names = this.names(visitor, now, address)
    // Firestore commits are atomic. Under contention the preconditions force
    // a retry instead of allowing two requests to consume the same last slot.
    for (let attempt = 0; attempt < 6; attempt++) {
      throwIfExecutionStopped(execution)
      const token = await this.accessToken(execution)
      const docs = await this.readAll(names, token, execution)
      const decision = quotaStatus(docs[0]!.count, docs[1]!.count, docs[2]?.count ?? 0).decision
      if (decision !== 'ok') return decision
      // A client disconnect between the reads and commit must not consume a
      // quota slot for a scrape that will never start.
      throwIfExecutionStopped(execution)
      const response = await this.fetcher(`${this.endpointBase}:commit`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ writes: docs.map(doc => this.write(doc, now)) }),
        signal: this.requestSignal(execution, 5_000),
      })
      if (response.ok) return 'ok'
      // FAILED_PRECONDITION / ABORTED: another instance won the race.
      if (response.status === 409 || response.status === 412) continue
      if (response.status === 400) {
        const error = await response.json().catch(() => null) as { error?: { status?: string } } | null
        if (error?.error?.status === 'FAILED_PRECONDITION' || error?.error?.status === 'ABORTED') continue
      }
      throw new Error(`Firestore quota commit failed (${response.status})`)
    }
    throw new Error('Firestore quota contention exceeded retry budget')
  }

  private write(doc: DocumentRead, now: Date): Record<string, unknown> {
    return {
      update: { name: doc.name, fields: { count: { integerValue: String(doc.count + 1) }, expireAt: { timestampValue: quotaExpiry(now).toISOString() } } },
      currentDocument: doc.updateTime === null ? { exists: false } : { updateTime: doc.updateTime },
    }
  }

  private async read(name: string, token: string, execution: ExecutionBudget): Promise<DocumentRead> {
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${name}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: this.requestSignal(execution, 5_000),
    })
    if (response.status === 404) return { name, count: 0, updateTime: null }
    if (!response.ok) throw new Error(`Firestore quota read failed (${response.status})`)
    const doc = await response.json() as FirestoreDocument
    const rawCount = doc.fields?.count?.integerValue
    const count = Number(rawCount)
    if (doc.name !== name || rawCount === undefined || !Number.isSafeInteger(count) || count < 0 || !doc.updateTime) {
      throw new Error('Firestore quota document is malformed')
    }
    return { name, count, updateTime: doc.updateTime }
  }

  private async accessToken(execution: ExecutionBudget): Promise<string> {
    return metadataAccessToken(this.fetcher, this.requestSignal(execution, 3_000))
  }

  private requestSignal(execution: ExecutionBudget, capMs: number): AbortSignal {
    throwIfExecutionStopped(execution)
    const remaining = execution.deadlineAt === undefined ? capMs : Math.min(capMs, Math.max(1, execution.deadlineAt - Date.now()))
    const timeout = AbortSignal.timeout(remaining)
    return execution.signal ? AbortSignal.any([execution.signal, timeout]) : timeout
  }
}

/** An access token for the Cloud Run service identity, from the metadata server. */
export async function metadataAccessToken(fetcher: typeof fetch, signal: AbortSignal): Promise<string> {
  const response = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' }, signal,
  })
  if (!response.ok) throw new Error('Cloud Run service identity is unavailable')
  const body = await response.json() as { access_token?: string }
  if (!body.access_token) throw new Error('Cloud Run service identity returned no token')
  return body.access_token
}

export function firestoreQuotaFromEnv(env: NodeJS.ProcessEnv = process.env): PreviewQuota {
  const project = env.W2L_FIRESTORE_PROJECT_ID
  const hashKey = env.W2L_QUOTA_HASH_KEY
  if (!project || !hashKey) throw new Error('W2L_FIRESTORE_PROJECT_ID and W2L_QUOTA_HASH_KEY are required')
  return new FirestorePreviewQuota(project, hashKey)
}
