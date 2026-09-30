/**
 * What a lane says about content it extracted: the status it deserves, the
 * caveats the reader should see, and the trace events the ladder reads.
 *
 * Two caveats exist. A recovered region (no strategy found main content, so
 * the largest linked list, a table, or the cleaned body is returned) makes
 * the result `partial`: usable, not a confident main-content read. A page
 * whose data looks client-rendered keeps its status but carries a warning
 * and a `quality_client_rendered` event, which the ladder treats like a thin
 * result: worth offering to the browser lane. The browser lane never raises
 * it, because its capture is the rendered page.
 */

import type { ExtractorOutput, FetchWarning, Lane, TraceEvent } from '@w2l/contracts'

export interface ExtractionVerdict {
  status: 'success' | 'partial'
  warnings: readonly FetchWarning[]
  events: readonly TraceEvent[]
}

const REGION: Record<NonNullable<ExtractorOutput['recovery']>, string> = {
  list: 'largest linked list',
  table: 'largest data table',
  body: 'cleaned page body',
}

export function extractionVerdict(
  extracted: ExtractorOutput,
  lane: Lane,
  at: number,
  options: { rendered: boolean },
): ExtractionVerdict {
  const warnings: FetchWarning[] = []
  const events: TraceEvent[] = []
  const recovery = extracted.recovery ?? null
  if (recovery !== null) {
    warnings.push({
      code: 'low_confidence_extraction',
      message: `No main content region was identified; the ${REGION[recovery]} is returned instead.`,
    })
    events.push({ at, lane, event: 'extract_recovered', detail: { recovery, confidence: extracted.confidence } })
  }
  const render = extracted.render
  if (!options.rendered && render !== undefined && render.clientRendered) {
    warnings.push({
      code: 'client_rendered_suspected',
      message: `The page appears to fill in its data with JavaScript (${render.reason}); this HTTP capture may be a shell.`,
    })
    events.push({
      at,
      lane,
      event: 'quality_client_rendered',
      detail: {
        reason: render.reason,
        markers: render.markers,
        emptyTables: render.emptyTables,
        textChars: render.textChars,
        scriptChars: render.scriptChars,
      },
    })
  }
  return { status: recovery === null ? 'success' : 'partial', warnings, events }
}
