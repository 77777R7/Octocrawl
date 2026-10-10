/**
 * A task contract (`verify`) and the verification a result carries against it (ADR 0006, ROADMAP PA item 10).
 *
 * The check types are research/access/run-set.mjs's, judged the same way, so a task of the access set can be sent as a
 * contract unchanged; `recordFields` and `emptyOk` are added. The verdict lives beside the result's status, which stays
 * the fetch's: a task is done when `verification.status` is `passed`.
 */
export type VerifyCheck =
  | { type: 'markdownIncludes'; text: string }
  | { type: 'markdownMatches'; pattern: string; flags?: string }
  | { type: 'markdownCountMin'; pattern: string; flags?: string; min: number }
  | { type: 'minTables'; min: number }
  | { type: 'listRecordsMin'; min: number; path?: string }
  | { type: 'recordFields'; fields: readonly string[]; min: number }
  | { type: 'field'; path: string; equals?: string | number | boolean | null; in?: readonly (string | number | boolean | null)[]; present?: boolean; min?: number; max?: number }

export interface VerifyContract {
  checks: readonly VerifyCheck[]
  /** An empty result (`empty_verified`, a search with no hits) is the task done. Default false. */
  emptyOk?: boolean
}

export type VerifyCheckType = VerifyCheck['type']
export const VERIFY_CHECK_TYPES: readonly VerifyCheckType[] = ['markdownIncludes', 'markdownMatches', 'markdownCountMin', 'minTables', 'listRecordsMin', 'recordFields', 'field']
/** Checks whose patterns are JavaScript regular expressions, which cannot be bounded in time: a hosted server refuses them. */
export const VERIFY_REGEX_CHECK_TYPES: readonly VerifyCheckType[] = ['markdownMatches', 'markdownCountMin']
export const MAX_VERIFY_CHECKS = 32
export const MAX_VERIFY_TEXT = 1_000
const MAX_VERIFY_COUNT = 1_000_000
const MAX_RECORD_FIELDS = 50

/**
 * Whether a check is about the page's data, not its status or lane: run-set.mjs's `isData`, with `recordFields`. A
 * `field` check is data when its path is under `json`, `list` or `tables`.
 */
export function isDataCheck(check: VerifyCheck): boolean {
  return check.type === 'field' ? /^(json|list|tables)\b/.test(check.path) : true
}

export type VerificationReason = 'checks_failed' | 'page_not_read' | 'empty_not_allowed'

export interface VerificationCheck {
  index: number
  type: VerifyCheckType
  data: boolean
  /** null: the view judged did not have what the check reads (a DOM view has no `json`). */
  passed: boolean | null
  /** What was seen, in a sentence, for a person; never the page's text. */
  observed: string
  /** For the count checks (`markdownCountMin`, `minTables`, `listRecordsMin`, `recordFields`): the number seen and the number asked. */
  observedCount?: number
  asked?: number
}

export type Verification =
  | { status: 'not_requested' }
  | {
    status: 'passed' | 'failed'
    /** The verifier's version (`verify/1`): it changes when a check is judged differently. */
    verifier: string
    contractSha256: string
    reason: VerificationReason | null
    checks: readonly VerificationCheck[]
  }

/** The keys each check type takes; a check is refused with any other. */
export const VERIFY_CHECK_KEYS: Readonly<Record<VerifyCheckType, readonly string[]>> = {
  markdownIncludes: ['type', 'text'],
  markdownMatches: ['type', 'pattern', 'flags'],
  markdownCountMin: ['type', 'pattern', 'flags', 'min'],
  minTables: ['type', 'min'],
  listRecordsMin: ['type', 'min', 'path'],
  recordFields: ['type', 'fields', 'min'],
  field: ['type', 'path', 'equals', 'in', 'present', 'min', 'max'],
}
