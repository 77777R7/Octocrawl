import type { DocumentResponseMatch, EvidenceDocument, FetchOptions, Lane, TraceEvent } from '@w2l/contracts'

/** Whether the status and headers a result reports belong to the document it read (DocumentResponseMatch, PA B2). */
export type ResponseMatch = DocumentResponseMatch

/** What a capture's source can answer for: a layout copy, shadow tables, page actions, a screenshot. */
export interface CaptureCapabilities {
  layout: boolean
  shadowTables: boolean
  actions: boolean
  screenshot: boolean
}

/** The bounds the capture was taken under; null when none was set or the lane cannot see it (a vendor transport's byte cap). */
export interface CaptureLimits {
  maxBytes: number | null
}

/**
 * One observation of one document (plan §六.2, internal for now, PA B3): which document a result's content came from,
 * so that later reads, candidates and fields can say they share it. Each HTTP read and each browser read gets its own
 * captureId. Only `captureId` and `sourceKind` are always known; the HTTP lane sets no more today.
 */
export interface CaptureRef {
  captureId: string
  sourceKind: 'http_body' | 'browser_dom'
  requestedUrl?: string
  finalUrl?: string
  capturedAt?: string
  /** SHA-256 of the source read (the response body, or the DOM as serialized). */
  sourceHash?: string | null
  /** Documents the main frame loaded up to the read, as the lane counted them; null when it could not count. */
  documentGeneration?: number | null
  responseMatch?: ResponseMatch
  capabilities?: CaptureCapabilities
  limits?: CaptureLimits
}

/** A view of a capture: the source as a transform (layout, shadow tables) or a selection (includeTags, a region) left it. */
export interface ViewRef {
  viewId: string
  captureId: string
  parentViewId?: string
  regionId?: string
  selectionVersion: string
  transformVersion: string
}

export function newCapture(fields: Omit<CaptureRef, 'captureId'>): CaptureRef {
  return { captureId: crypto.randomUUID(), ...fields }
}

export function newView(fields: Omit<ViewRef, 'viewId'>): ViewRef {
  return { viewId: crypto.randomUUID(), ...fields }
}

/**
 * The view a caller's selection makes of `parent`: the elements `includeTags` names, or the records a list format's
 * `itemSelector` picks; null when the request selected nothing.
 */
export function selectionView(options: FetchOptions, parent: ViewRef): ViewRef | null {
  const selection = options.includeTags !== undefined && options.includeTags.length > 0 ? 'includeTags'
    : options.list?.itemSelector !== undefined ? 'list_items' : null
  if (selection === null) return null
  return newView({ captureId: parent.captureId, parentViewId: parent.viewId, selectionVersion: selection, transformVersion: parent.transformVersion })
}

/**
 * The public part of a capture, as `evidence.document` states it (PA G5): its id, the document count and the match.
 * The rest (hashes, URLs, capabilities, limits) stays in the trace; a lane that stated neither leaves them null.
 */
export function documentOf(capture: CaptureRef): EvidenceDocument {
  return { captureId: capture.captureId, generation: capture.documentGeneration ?? null, responseMatch: capture.responseMatch ?? null }
}

/** The trace event that carries a capture; the Evidence Record names it by `documentOf`. */
export function captureEvent(capture: CaptureRef, at: number, lane: Lane): TraceEvent {
  return { at, lane, event: 'capture', detail: { ...capture } }
}

export function viewEvent(view: ViewRef, at: number, lane: Lane): TraceEvent {
  return { at, lane, event: 'view', detail: { ...view } }
}

/** The last capture a trace records, or null. */
export function captureOf(trace: readonly TraceEvent[]): CaptureRef | null {
  for (let i = trace.length - 1; i >= 0; i--) {
    if (trace[i]!.event === 'capture') return trace[i]!.detail as unknown as CaptureRef
  }
  return null
}
