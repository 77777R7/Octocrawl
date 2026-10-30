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
  /** Rows after headers with a letter or number in every named column of one delivered table; not field truth. */
  | { type: 'tableRowsMin'; tableIndex: number; columns: readonly number[]; min: number }
  | { type: 'listRecordsMin'; min: number; path?: string }
  | { type: 'recordFields'; fields: readonly string[]; min: number; uniqueBy?: readonly string[] }
  | { type: 'field'; path: string; equals?: string | number | boolean | null; in?: readonly (string | number | boolean | null)[]; present?: boolean; min?: number; max?: number }

export interface VerifyContract {
  checks: readonly VerifyCheck[]
  /** An empty result (`empty_verified`, a search with no hits) is the task done. Default false. */
  emptyOk?: boolean
}

export type VerifyCheckType = VerifyCheck['type']
export const VERIFY_CHECK_TYPES: readonly VerifyCheckType[] = ['markdownIncludes', 'markdownMatches', 'markdownCountMin', 'minTables', 'tableRowsMin', 'listRecordsMin', 'recordFields', 'field']
/** Checks whose patterns are JavaScript regular expressions: they run with a time limit (regexCheck.ts in @w2l/runtime), and a hosted server takes them only when its operator switches them on (hostedVerifyRefusal; ADR 0006, amendment of 2026-10-29). */
export const VERIFY_REGEX_CHECK_TYPES: readonly VerifyCheckType[] = ['markdownMatches', 'markdownCountMin']
export const MAX_VERIFY_CHECKS = 32
export const MAX_VERIFY_TEXT = 1_000
const MAX_VERIFY_COUNT = 1_000_000
const MAX_RECORD_FIELDS = 50

/**
 * Why a hosted server refuses a contract, naming its regular-expression checks, or null when it holds none or the server
 * takes them (`regexChecks`: its operator's W2L_HOSTED_REGEX_CHECKS, with the start-up self-test passed): a hosted
 * engine's scrape, crawl and batch and a hosted job's start refuse it in these words, before anything is fetched or stored.
 */
export function hostedVerifyRefusal(contract: VerifyContract | undefined, options: { regexChecks?: boolean } = {}): string | null {
  if (options.regexChecks === true) return null
  const types = [...new Set(contract?.checks.filter((check) => VERIFY_REGEX_CHECK_TYPES.includes(check.type)).map((check) => check.type) ?? [])]
  if (types.length === 0) return null
  return `verify: ${types.join(' and ')} checks are not available in hosted mode yet; use markdownIncludes, minTables, listRecordsMin, recordFields or field, or run Octocrawl locally`
}

/**
 * Whether a check is about the page's data, not its status or lane: run-set.mjs's `isData`, with `recordFields`. A
 * `field` check is data when its path is under `json`, `list` or `tables`.
 */
export function isDataCheck(check: VerifyCheck): boolean {
  return check.type === 'field' ? /^(json|list|tables)\b/.test(check.path) : true
}

export type VerificationReason = 'checks_failed' | 'page_not_read' | 'empty_not_allowed'

/**
 * Why a regular-expression check was not judged (ADR 0006, amendment of 2026-10-29): its scan ran past its time limit,
 * the verification's time for regular expressions was spent before it, or the engine could not run it on this text.
 */
export type VerificationLimit = 'time' | 'budget' | 'error'

export interface VerificationCheck {
  index: number
  type: VerifyCheckType
  data: boolean
  /**
   * null: the view judged did not have what the check reads (a DOM view has no `json`), or, with `limit`, the check
   * could not be decided; a verification with such a check is never `passed`.
   */
  passed: boolean | null
  /** What was seen, in a sentence, for a person; never the page's text. */
  observed: string
  /** For the count checks: the number seen and the number asked. Absent when the count was not finished. */
  observedCount?: number
  asked?: number
  /** A regular-expression check stopped before it finished: which limit it met. */
  limit?: VerificationLimit
  /** The time the stopped scan was allowed, in milliseconds; 0 when it had none left to start. */
  limitMs?: number
}

/** A check that could not be decided (a regular expression stopped at a limit); one that holds at any count was decided. */
export function undecidedCheck(check: Pick<VerificationCheck, 'passed' | 'limit'>): boolean {
  return check.passed === null && check.limit !== undefined
}

export type Verification =
  | { status: 'not_requested' }
  | {
    status: 'passed' | 'failed'
    /** The verifier's version: it changes when checks are added or judged differently. */
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
  tableRowsMin: ['type', 'tableIndex', 'columns', 'min'],
  listRecordsMin: ['type', 'min', 'path'],
  recordFields: ['type', 'fields', 'min', 'uniqueBy'],
  field: ['type', 'path', 'equals', 'in', 'present', 'min', 'max'],
}
