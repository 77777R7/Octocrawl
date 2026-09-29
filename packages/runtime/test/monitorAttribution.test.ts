import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { EXTRACTOR_VERSION } from '@w2l/extract-tf'
import type { MonitorRevision, ScrapeOutcome } from '@w2l/contracts'
import { MonitorStore } from '../src/monitorStore.js'
import { DeliveryStore } from '../src/deliveryStore.js'
import { runConfiguredMonitor } from '../src/monitorRunner.js'
import * as configured from '../src/configuredAssessment.js'

const cleanups: (() => void)[] = []
afterEach(() => { vi.restoreAllMocks(); cleanups.splice(0).reverse().forEach(cleanup => cleanup()) })
function dbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'w2l-monitor-attribution-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'control.sqlite')
}
function open(path: string) {
  const store = MonitorStore.open(path), deliveries = DeliveryStore.open(path)
  cleanups.push(() => { try { store.close(); deliveries.close() } catch {} })
  return { store, deliveries }
}
const url = 'https://source.example/docs'
function revision(conditionalRequests = false, ruleVersion = 'docs/v1'): MonitorRevision {
  return { monitorId: 'docs', revision: ruleVersion === 'docs/v1' ? 1 : 2, url, ruleVersion, intervalMs: 60_000, staleAfterMs: 120_000, createdAt: 1_000,
    config: { adapter: 'markdown-sections/v1', workspaceId: 'workspace-a', entityKey: 'docs', viewKey: 'public', expectedTitle: 'Docs', schemaVersion: 'docs/v1', conditionalRequests, captureMode: 'http', fields: [{ name: 'summary', heading: 'Summary', type: 'text', required: true }] } }
}
// The same source text before and after a converter upgrade restored the spaces around a link.
const BEFORE = 'See theSearch feature docsfor all options.'
const AFTER = 'See the Search feature docs for all options.'
const usage = { wallMs: 1, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 1, browserMs: 0, externalCostUsd: null }
function page(raw: string, summary: string): ScrapeOutcome {
  return { result: { requestedUrl: url, status: 'success', failureReason: null, blockReason: null, budgetExceeded: null, lane: 'http', escalations: [], markdown: `# Docs\n\n## Summary\n${summary}`, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 200, redirectChain: [], contentType: 'text/html', rawBodySha256: raw, artifacts: [], etag: `"${raw}"`, cacheControl: 'public,max-age=0', vary: null, setsCookie: false }, usage, trace: [] }, links: [] }
}
function notModified(raw: string): ScrapeOutcome {
  return { result: { requestedUrl: url, status: 'failed', failureReason: 'http_error', blockReason: null, budgetExceeded: null, lane: 'http', escalations: [], markdown: null, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: 304, redirectChain: [], contentType: null, rawBodySha256: 'empty-304-body', artifacts: [], etag: `"${raw}"`, cacheControl: 'public,max-age=0', vary: null, setsCookie: false }, usage, trace: [] }, links: [] }
}
function observe(store: MonitorStore, key: string, now: number, raw: string, summary: string, extractorVersion: string, current = revision()) {
  const run = store.startRun('docs', key, now), outcome = page(raw, summary)
  const assessment = configured.assessConfiguredDocument(outcome.result, current)
  store.recordObservation({ id: `observation-${key}`, runId: run.id, attemptId: run.attemptId!, observedAt: now, clientWallMs: 1, markdownSha256: null, rawBodySha256: raw, extractorVersion, outcome, error: null }, `assessment-${key}`, assessment, undefined, now)
  return store.commit(run.id, `observation-${key}`, `assessment-${key}`, assessment, now)
}

describe('Monitor change attribution across extractor versions', () => {
  it('records a field change over the same raw body as extraction_reprocessed on the run, without an event or delivery', () => {
    const { store, deliveries } = open(dbPath())
    store.createOrGetRevision(revision())
    deliveries.createDestination({ id: 'sink', monitorId: 'docs', url: 'https://receiver.example/webhook' }, 1_000)
    expect(observe(store, 'before', 1_000, 'raw-a', BEFORE, 'extract-tf/0')?.reason).toBe('initialized')
    expect(observe(store, 'after', 2_000, 'raw-a', AFTER, 'extract-tf/1')).toBeNull()
    const view = store.view('docs', 2_000)
    expect(view.runs[0]).toMatchObject({ triggerKey: 'after', change: 'changed', changeReason: 'extraction_reprocessed' })
    expect(view.baseline).toMatchObject({ version: 2, extractorVersion: 'extract-tf/1', fields: { summary: { state: 'present', value: AFTER } } })
    expect(view.events.map(event => event.reason)).toEqual(['initialized'])
    expect(view.outbox).toHaveLength(1)
    expect(deliveries.listDeliveries().map(delivery => delivery.eventVersion)).toEqual([1])
  })

  it('keeps source_changed when the raw body changed too, and notes an extractor change', () => {
    const { store, deliveries } = open(dbPath())
    store.createOrGetRevision(revision())
    deliveries.createDestination({ id: 'sink', monitorId: 'docs', url: 'https://receiver.example/webhook' }, 1_000)
    observe(store, 'before', 1_000, 'raw-a', BEFORE, 'extract-tf/0')
    const mixed = observe(store, 'after', 2_000, 'raw-b', 'The source rewrote this summary.', 'extract-tf/1')
    expect(mixed).toMatchObject({ kind: 'changed', reason: 'source_changed', extractorChange: { from: 'extract-tf/0', to: 'extract-tf/1' } })
    const plain = observe(store, 'later', 3_000, 'raw-c', 'The source rewrote it again.', 'extract-tf/1')
    expect(plain?.reason).toBe('source_changed')
    expect(plain).not.toHaveProperty('extractorChange')
    expect(store.view('docs', 3_000).runs[0]).toMatchObject({ change: 'changed', changeReason: 'source_changed' })
    expect(deliveries.listDeliveries().map(delivery => delivery.eventVersion).sort()).toEqual([1, 2, 3])
  })

  it('still delivers the event of a rule revision that re-extracts the same raw body', () => {
    const { store, deliveries } = open(dbPath())
    store.createOrGetRevision(revision())
    deliveries.createDestination({ id: 'sink', monitorId: 'docs', url: 'https://receiver.example/webhook' }, 1_000)
    observe(store, 'v1', 1_000, 'raw-a', AFTER, EXTRACTOR_VERSION)
    store.createOrGetRevision({ ...revision(false, 'docs/v2'), createdAt: 1_500 })
    expect(observe(store, 'v2', 2_000, 'raw-a', AFTER, EXTRACTOR_VERSION, revision(false, 'docs/v2'))?.reason).toBe('extraction_reprocessed')
    expect(deliveries.listDeliveries()).toHaveLength(2)
  })

  it('does not report source_changed on the first run after an upgrade over a baseline recorded without versions', async () => {
    const path = dbPath()
    let { store, deliveries } = open(path)
    store.createOrGetRevision(revision())
    deliveries.createDestination({ id: 'sink', monitorId: 'docs', url: 'https://receiver.example/webhook' }, 1_000)
    await runConfiguredMonitor(store, revision(), async () => page('raw-a', BEFORE), 'before-upgrade')
    store.close(); deliveries.close()
    // The database as the code before this change left it: no raw-body, version or reason columns.
    const db = new Database(path)
    for (const [table, column] of [['monitor_observations', 'raw_body_sha256'], ['monitor_observations', 'extractor_version'], ['monitor_snapshots', 'extractor_version'], ['monitor_runs', 'change_reason'], ['monitor_events', 'extractor_change_json']]) db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`)
    db.close()
    ;({ store, deliveries } = open(path))
    const upgraded = await runConfiguredMonitor(store, revision(), async () => page('raw-a', AFTER), 'after-upgrade')
    expect(upgraded.runs.find(run => run.triggerKey === 'after-upgrade')).toMatchObject({ change: 'changed', changeReason: 'extraction_reprocessed' })
    expect(upgraded.baseline).toMatchObject({ version: 2, extractorVersion: EXTRACTOR_VERSION })
    expect(upgraded.events.map(event => event.reason)).toEqual(['initialized'])
    expect(deliveries.listDeliveries()).toHaveLength(1)
    const next = await runConfiguredMonitor(store, revision(), async () => page('raw-a', AFTER), 'next')
    expect(next.runs.find(run => run.triggerKey === 'next')).toMatchObject({ change: 'unchanged', changeReason: null })
  })

  it('reads a 304 as its reused raw body and extractor, so reassessing that body is not a source change', async () => {
    const path = dbPath()
    const { store } = open(path)
    await runConfiguredMonitor(store, revision(true), async () => page('raw-a', AFTER), 'fresh')
    const db = new Database(path); cleanups.push(() => db.close())
    const cached = db.prepare('SELECT key, body FROM monitor_transport').get() as { key: string; body: string }
    expect(JSON.parse(cached.body).extractorVersion).toBe(EXTRACTOR_VERSION)
    // A representation cached before versions were recorded, then a W2L assessment change without a rule bump.
    const { extractorVersion: _dropped, ...legacy } = JSON.parse(cached.body)
    db.prepare('UPDATE monitor_transport SET body=? WHERE key=?').run(JSON.stringify(legacy), cached.key)
    const assess = configured.assessConfiguredDocument
    vi.spyOn(configured, 'assessConfiguredDocument').mockImplementation((result, current) => ({ ...assess(result, current), fields: { summary: { state: 'present', value: 'Reworded by W2L.', evidenceRefs: [] } } }))
    const view = await runConfiguredMonitor(store, revision(true), async () => notModified('raw-a'), 'revalidated')
    const run = view.runs.find(candidate => candidate.triggerKey === 'revalidated')!
    expect(run).toMatchObject({ change: 'changed', changeReason: 'extraction_reprocessed' })
    expect(view.events).toHaveLength(1)
    expect(store.runDetail('docs', run.id)?.observation).toMatchObject({ rawBodySha256: 'raw-a', extractorVersion: null, transport: { responseStatus: 304 } })
  })
})
