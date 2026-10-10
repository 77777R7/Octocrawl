import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_REASON,
  BUDGET_KIND,
  EVIDENCE_ARTIFACT_KINDS,
  EVIDENCE_RECORD_ADDED_KEYS,
  EVIDENCE_RECORD_KEYS,
  EVIDENCE_SCHEMA_VERSION,
  ACCESS_COMPLETIONS, ACCESS_ROUTES,
  FAILURE_REASON,
  FIELD_EVIDENCE_SOURCES,
  LANE,
  carryPaidCalls,
  givenUpPaidCalls,
  paidCallsOfError,
  type TraceEvent,
  MODE_IDENTITIES,
  RESULT_STATUS,
  declaredContact,
  researchUserAgent,
} from '../src/index.js'

/**
 * The published JSON Schema and the TypeScript type describe one record. The
 * type's key lists fail to compile when they miss or invent a key; this test
 * holds the schema file to the same lists and enums, so neither drifts alone.
 */
const schema = JSON.parse(readFileSync(new URL('../schemas/evidence-record.v1.json', import.meta.url), 'utf8')) as {
  $schema: string
  $defs: Record<string, { properties: Record<string, SchemaNode>; required: string[] }>
  properties: Record<string, SchemaNode>
  required: string[]
  additionalProperties: boolean
}
interface SchemaNode { description?: string; enum?: unknown[]; const?: unknown; anyOf?: SchemaNode[]; items?: SchemaNode }

describe('Evidence Record v1 schema file', () => {
  it('is draft 2020-12 and closed', () => {
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(schema.additionalProperties).toBe(false)
  })

  it('has exactly the type\'s fields, every one documented and required unless added to v1 later', () => {
    expect(Object.keys(schema.properties)).toEqual([...EVIDENCE_RECORD_KEYS.record])
    expect(schema.required).toEqual(EVIDENCE_RECORD_KEYS.record.filter(key => !EVIDENCE_RECORD_ADDED_KEYS.record!.includes(key)))
    for (const [name, node] of Object.entries(schema.properties)) expect(node.description, name).toMatch(/\S/)
  })

  it('has exactly the type\'s nested objects; a key added to v1 later is optional, every other one required', () => {
    const { record: _record, ...nested } = EVIDENCE_RECORD_KEYS
    expect(Object.keys(schema.$defs).filter(name => name !== 'sha256').sort()).toEqual(Object.keys(nested).sort())
    expect(EVIDENCE_RECORD_ADDED_KEYS).toEqual({ record: ['contentEncoding', 'pageActions', 'access', 'verification'], artifact: ['bytes', 'contentType'], identity: ['device', 'requestHeaders'], robotsDecision: ['overrideBasis'], access: ['completion', 'egress', 'session', 'paidCalls', 'grant'], accessEgress: ['exit'], accessPaidCall: ['sessionMs'] })
    for (const [name, keys] of Object.entries(nested)) {
      const def = schema.$defs[name]!
      const added: readonly string[] = EVIDENCE_RECORD_ADDED_KEYS[name as keyof typeof EVIDENCE_RECORD_KEYS] ?? []
      expect(Object.keys(def.properties), name).toEqual([...keys])
      expect(def.required, name).toEqual(keys.filter(key => !added.includes(key)))
      for (const [key, node] of Object.entries(def.properties)) expect(node.description, `${name}.${key}`).toMatch(/\S/)
    }
  })

  it('uses the contract\'s enums', () => {
    const p = schema.properties
    const d = schema.$defs
    expect(p.schemaVersion!.const).toBe(EVIDENCE_SCHEMA_VERSION)
    expect(p.status!.enum).toEqual([...RESULT_STATUS])
    expect(p.reason!.enum).toEqual([...FAILURE_REASON, ...BLOCK_REASON, ...BUDGET_KIND, null])
    expect(p.lane!.enum).toEqual([...LANE])
    expect(d.identity!.properties.mode!.enum).toEqual(Object.keys(MODE_IDENTITIES))
    expect(d.fieldEvidence!.properties.source!.enum).toEqual([...FIELD_EVIDENCE_SOURCES])
    expect(d.artifact!.properties.kind!.enum).toEqual([...EVIDENCE_ARTIFACT_KINDS, null])
    expect(d.robotsDecision!.properties.decision!.enum).toEqual(['allowed', 'disallowed', 'no_robots'])
    expect(d.robotsDecision!.properties.unreachable!.enum).toEqual(['server_error', 'network_error', 'timeout', null])
    expect(d.access!.properties.route!.enum).toEqual([...ACCESS_ROUTES, null])
    expect(d.access!.properties.completion!.enum).toEqual([...ACCESS_COMPLETIONS, null])
    // A paid call's outcome and reason are the record's own verdict and reason, for the page that call returned.
    expect(d.accessPaidCall!.properties.outcome!.enum).toEqual([...RESULT_STATUS, null])
    expect(d.accessPaidCall!.properties.reason!.enum).toEqual(p.reason!.enum)
  })
})

describe('paid provider calls kept off the answer (ROADMAP PA item 4)', () => {
  const call = { provider: 'steel', rung: 'provider', chargedUsd: 0.3, outcome: null, answer: true }
  const paid: TraceEvent = { at: 1, lane: 'provider', event: 'paid_calls', detail: { grant: null, calls: [call] } }

  it('keeps a given-up result\'s calls, none of them the answer', () => {
    const failed: TraceEvent = { at: 0, lane: 'provider', event: 'provider_failed', detail: {} }
    expect(givenUpPaidCalls([failed, paid])).toEqual([{ ...paid, detail: { grant: null, calls: [{ ...call, answer: false }] } }])
    expect(givenUpPaidCalls([failed])).toEqual([])
  })

  it('carries a thrown run\'s calls on its error, unseen when the error is printed', () => {
    const error = new Error('vendor API answered 502')
    expect(carryPaidCalls(error, paid)).toBe(error)
    expect(paidCallsOfError(error)).toEqual(paid)
    expect(JSON.stringify(error)).not.toContain('paid_calls')
    expect(paidCallsOfError(new Error('no calls'))).toBeNull()
    expect(paidCallsOfError('a string thrown')).toBeNull()
    expect(paidCallsOfError(carryPaidCalls(Object.freeze(new Error('frozen')), paid))).toBeNull()
  })
})

describe('declaredContact', () => {
  it('reads the contact a research User-Agent declares, and nothing else', () => {
    expect(declaredContact(researchUserAgent('Jane Doe jane@example.org'))).toBe('Jane Doe jane@example.org')
    expect(declaredContact(researchUserAgent('Jane Doe jane@example.org', 'www.sec.gov'))).toBe('Jane Doe jane@example.org')
    expect(declaredContact('W2L Research ')).toBeNull()
    expect(declaredContact(researchUserAgent())).toBeNull()
    expect(declaredContact(MODE_IDENTITIES.standard.userAgent)).toBeNull()
    expect(declaredContact('Mozilla/5.0 (X11; contact: someone)')).toBeNull()
  })
})
