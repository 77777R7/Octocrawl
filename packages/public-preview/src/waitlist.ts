import { createHmac } from 'node:crypto'
import { metadataAccessToken } from './quota.js'

/** The hosted early-access list. A visitor leaves an email and, if they like, who they are and what they need;
 * nothing else about them is stored with it (docs/privacy: Waitlist). */
export const WAITLIST_ROLES = ['academic', 'student', 'journalist', 'analyst', 'ai_developer', 'commerce', 'other'] as const
export const WAITLIST_NEEDS = ['hosted', 'more_previews', 'api_key', 'team', 'monitoring'] as const
/** Where the form was opened: after the daily previews ran out, in the home page footer, or from the Limits page. */
export const WAITLIST_TRIGGERS = ['quota', 'footer', 'limits'] as const
export const WAITLIST_BODY_BYTES = 2_048
export const WAITLIST_USE_CASE_CHARS = 200
/** Sign-ups one visitor may send per UTC day, per service instance. */
export const WAITLIST_DAILY_SUBMISSIONS = 5

export type WaitlistRole = typeof WAITLIST_ROLES[number]
export type WaitlistNeed = typeof WAITLIST_NEEDS[number]
export type WaitlistTrigger = typeof WAITLIST_TRIGGERS[number]

export interface WaitlistEntry {
  email: string
  role: WaitlistRole | null
  needs: WaitlistNeed[]
  useCase: string | null
  trigger: WaitlistTrigger
  /** The site that sent the visitor to this page: a host, never a path. */
  ref: string | null
}

export interface WaitlistStore {
  /** Saves the entry under its email: a second sign-up with the same address replaces the first, keeping its date. */
  save(entry: WaitlistEntry, now?: Date): Promise<void>
}

const EMAIL = /^[^\s@<>"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*$/
const KEYS = new Set(['email', 'role', 'needs', 'useCase', 'trigger', 'ref', 'website'])

/** The checked entry; 'spam' when the hidden field was filled; null for anything malformed. Unknown keys, roles or
 * needs are refused rather than dropped, so the page and the service cannot drift apart unnoticed. */
export function parseWaitlistEntry(body: unknown): WaitlistEntry | 'spam' | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  if (Object.keys(value).some(key => !KEYS.has(key))) return null
  if (value.website !== undefined && value.website !== '') return 'spam'
  if (typeof value.email !== 'string') return null
  const email = value.email.trim().toLowerCase()
  if (email.length > 254 || !EMAIL.test(email)) return null
  const role = value.role === undefined || value.role === '' ? null : value.role
  if (role !== null && !WAITLIST_ROLES.includes(role as WaitlistRole)) return null
  const needs = value.needs ?? []
  if (!Array.isArray(needs) || needs.some(need => !WAITLIST_NEEDS.includes(need as WaitlistNeed))) return null
  const rawUseCase = value.useCase ?? ''
  if (typeof rawUseCase !== 'string' || [...rawUseCase.trim()].length > WAITLIST_USE_CASE_CHARS) return null
  if (!WAITLIST_TRIGGERS.includes(value.trigger as WaitlistTrigger)) return null
  const ref = value.ref === undefined || value.ref === '' ? null : value.ref
  if (ref !== null && (typeof ref !== 'string' || ref.length > 253 || !HOST.test(ref))) return null
  return {
    email, role: role as WaitlistRole | null, needs: [...new Set(needs as WaitlistNeed[])],
    useCase: rawUseCase.trim() || null, trigger: value.trigger as WaitlistTrigger, ref: ref as string | null,
  }
}

/** Firestore `waitlist` collection, one document per address. The document id is a keyed hash of the address, so the
 * id alone does not reveal it and a repeat sign-up lands on the same document. */
export class FirestoreWaitlist implements WaitlistStore {
  private readonly resourceBase: string

  constructor(projectId: string, private readonly hashKey: string, private readonly fetcher: typeof fetch = fetch) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error('W2L_FIRESTORE_PROJECT_ID is invalid')
    if (hashKey.length < 32) throw new Error('W2L_QUOTA_HASH_KEY must contain at least 32 characters')
    this.resourceBase = `projects/${projectId}/databases/(default)/documents`
  }

  documentName(email: string): string {
    return `${this.resourceBase}/waitlist/${createHmac('sha256', this.hashKey).update(`waitlist:${email}`).digest('hex')}`
  }

  async save(entry: WaitlistEntry, now = new Date()): Promise<void> {
    const signal = AbortSignal.timeout(8_000)
    const token = await metadataAccessToken(this.fetcher, signal)
    const text = (value: string | null) => value === null ? { nullValue: null } : { stringValue: value }
    const fields = {
      email: { stringValue: entry.email }, role: text(entry.role), useCase: text(entry.useCase),
      needs: { arrayValue: { values: entry.needs.map(need => ({ stringValue: need })) } },
      trigger: { stringValue: entry.trigger }, ref: text(entry.ref), updatedAt: { timestampValue: now.toISOString() },
    }
    // One atomic write: replace the answers, and keep the first sign-up date (`minimum` sets it only when absent or
    // later).
    const response = await this.fetcher(`https://firestore.googleapis.com/v1/${this.resourceBase}:commit`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ writes: [{
        update: { name: this.documentName(entry.email), fields },
        updateMask: { fieldPaths: Object.keys(fields) },
        updateTransforms: [{ fieldPath: 'createdAt', minimum: { timestampValue: now.toISOString() } }],
      }] }),
      signal,
    })
    if (!response.ok) throw new Error(`Firestore waitlist commit failed (${response.status})`)
  }
}

export function firestoreWaitlistFromEnv(env: NodeJS.ProcessEnv = process.env): WaitlistStore {
  const project = env.W2L_FIRESTORE_PROJECT_ID
  const hashKey = env.W2L_QUOTA_HASH_KEY
  if (!project || !hashKey) throw new Error('W2L_FIRESTORE_PROJECT_ID and W2L_QUOTA_HASH_KEY are required')
  return new FirestoreWaitlist(project, hashKey)
}
