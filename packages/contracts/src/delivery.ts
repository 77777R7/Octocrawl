import type { BatchStatusResponse, WebhookEvent } from './api.js'
import type { CrawlPage, CrawlReport } from './crawl.js'
import type { FirecrawlWebhookPayload } from './firecrawl.js'
import type { MonitorEvent, MonitorSnapshot } from './monitor.js'

/** Whose events a destination receives: a Monitor's, or a job's (a crawl or batch, destination `job:<taskId>`). */
export type DeliveryDestinationKind = 'monitor' | 'job'
/** The shape of a job destination's payloads: W2L's JobWebhookEnvelope, or Firecrawl's for a job started through the `/fc` shim. */
export type WebhookPayloadFormat = 'w2l' | 'firecrawl'

export interface DeliveryDestinationInput {
  id: string
  /** The Monitor the destination belongs to; for a job destination, `job:<taskId>`. */
  monitorId: string
  url: string
  maxAttempts?: number
  /** Operator environment reference; literal secrets are never stored or returned. */
  secretEnv?: string
  enabled?: boolean
  /** Default `monitor`. A `job` destination takes the four options below; a Monitor destination takes none of them yet. */
  kind?: DeliveryDestinationKind
  /** The job events to deliver; default all. */
  events?: readonly WebhookEvent[]
  /** Headers sent with every delivery (lower-cased names); stored in the control database alone and never returned. */
  headers?: Readonly<Record<string, string>>
  /** Strings copied into every payload's `metadata`. */
  metadata?: Readonly<Record<string, string>>
  payloadFormat?: WebhookPayloadFormat
}
export interface DeliveryDestination {
  id: string
  monitorId: string
  url: string
  maxAttempts: number
  secretEnv?: string
  enabled: boolean
  createdAt: number
  kind: DeliveryDestinationKind
  /** The job the destination belongs to (`kind: 'job'`). */
  jobId?: string
  events?: readonly WebhookEvent[]
  /** The names of the custom headers sent with each delivery; their values are never returned. */
  headerNames: string[]
  metadata?: Readonly<Record<string, string>>
  payloadFormat?: WebhookPayloadFormat
}
/** eventVersion is the committed snapshot version, scoped to this monitor/entity/view. */
export interface WebhookEventEnvelope {
  schemaVersion: 'w2l.monitor-event/v1'
  eventId: string
  eventVersion: number
  monitorId: string
  workspaceId: string
  entityKey: string
  viewKey: string
  event: MonitorEvent
  snapshot: MonitorSnapshot
}
/**
 * One event of a crawl or batch, as its webhook receiver gets it. `eventId`
 * is `<taskId>:started`, `<taskId>:page:<stepId>` or `<taskId>:<status>`
 * (a job run again, a batch appended after completion, suffixes its later
 * terminal ids with the attempt id); `sequence` is 0 for `started`, then
 * one more for every page and terminal event in the order they were
 * enqueued, so a job of n pages ends at n+1. Also the `x-w2l-event-id` and
 * `x-w2l-event-version` headers of the delivery.
 */
export interface JobWebhookEnvelope {
  schemaVersion: 'w2l.job-event/v1'
  eventId: string
  sequence: number
  jobId: string
  jobKind: 'crawl' | 'batch'
  event: WebhookEvent
  /** When the event was recorded, ISO 8601. */
  at: string
  /** The request's `webhook.metadata`, `{}` when none. */
  metadata: Readonly<Record<string, string>>
  /** On a `page` event: the page as `GET /v1/crawl/:id/pages` or `/v1/batches/:id/items` lists it (no audit, empty trace). */
  page?: CrawlPage
  /** On a terminal event: the job's status as `GET /v1/crawl/:id` or `GET /v1/batches/:id` reports it then. */
  report?: CrawlReport | BatchStatusResponse
  /** On `failed`: why. */
  error?: string
}
/** What a delivery carries: a Monitor event, a job event, or a job event in Firecrawl's shape. */
export type WebhookPayload = WebhookEventEnvelope | JobWebhookEnvelope | FirecrawlWebhookPayload
export type DeliveryState = 'pending' | 'delivering' | 'delivered' | 'dead_letter'
export interface WebhookDelivery {
  id: string
  destinationId: string
  monitorId: string
  eventId: string
  eventVersion: number
  state: DeliveryState
  attemptCount: number
  maxAttempts: number
  nextAttemptAt: number
  leaseUntil: number | null
  fencingToken: number
  createdAt: number
  deliveredAt: number | null
  lastStatus: number | null
  lastError: string | null
  payload: WebhookPayload
}
export interface DeliveryAttempt {
  id: string
  deliveryId: string
  fencingToken: number
  startedAt: number
  endedAt: number | null
  outcome: 'sending' | 'delivered' | 'retry' | 'dead_letter' | 'lease_expired'
  status: number | null
  error: string | null
  retryAfterAt: number | null
}
export interface DeliveryQuery {
  monitorId?: string
  /** The crawl or batch whose deliveries to list: `monitorId` `job:<taskId>` under its own name; not beside `monitorId`. */
  jobId?: string
  destinationId?: string
  state?: DeliveryState
}
export interface DeliveryPageQuery extends DeliveryQuery {
  cursor?: string
  limit?: number
}
export interface DeliveryPage {
  items: WebhookDelivery[]
  nextCursor: string | null
  hasMore: boolean
}
export interface DeliveryDetail {
  delivery: WebhookDelivery
  attempts: DeliveryAttempt[]
}
