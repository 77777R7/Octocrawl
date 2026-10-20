import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { RoutingHistoryDatabase, ROUTING_HISTORY_FILENAME, type RouteScope } from '../src/routing/sqliteRoutingHistory.js'
import type { RouteContext, RouteObservation, VendorOutcome } from '../src/routing/vendorRouter.js'

const DAY = 24 * 60 * 60 * 1000
const scope: RouteScope = { lanes: 'standard|enhanced', egressClass: 'environment', region: null }
const route: RouteContext = { family: 'path:/p', formats: 'markdown', versions: 'extract-tf/31|verify/9' }

function observation(over: Partial<RouteObservation['environment']> = {}): RouteObservation {
  return {
    accessDelivered: true, regionLoaded: true, taskVerified: true, failureStage: null, readiness: 'ready', reason: null,
    timings: { coldStartMs: null, navigationMs: null, challengeWaitMs: null, regionWaitMs: 1_200, captureMs: null, extractMs: 30, serializeMs: null, cleanupMs: null, sessionMs: 2_000, totalMs: 2_400 },
    environment: { browserMajor: 131, egressClass: 'vendor_default', egressConfigVersion: 'aaaaaaaaaaaa', ...over },
    chargedUsd: 0.002, chargeBasis: 'measured',
  }
}
const outcome = (over: Partial<RouteObservation['environment']> = {}, contentful = true): VendorOutcome => ({ contentful, verified: contentful, wallMs: 2_400, costUsd: null, failureClass: contentful ? null : 'bot_gate', observation: observation(over) })

const dirs: string[] = []
async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'w2l-routes-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

describe('SqliteRoutingHistory (PA G2b)', () => {
  it('keeps a route\'s statistics and observations at <taskRoot>/routing-history.sqlite, read back after a reopen', async () => {
    const taskRoot = await root()
    const first = RoutingHistoryDatabase.open(taskRoot)
    const history = first.scoped(scope, { minSamples: 1 })
    await history.record('example.com', 'steel', outcome(), route)
    first.close()

    const reopened = RoutingHistoryDatabase.open(taskRoot)
    const read = await reopened.scoped(scope, { minSamples: 1 }).read('example.com', route)
    expect(read.lastVendor).toBe('steel')
    expect(read.vendors.steel).toMatchObject({ attempts: 1, contentful: 1, chargedTotalUsd: 0.002, layers: { accessDelivered: { yes: 1, no: 0, unknown: 0 } } })
    expect(read.vendors.steel!.observations[0]).toMatchObject({ failureStage: null, readiness: 'ready', chargedUsd: 0.002, timings: { regionWaitMs: 1_200 }, environment: { browserMajor: 131 } })
    reopened.close()
    expect(ROUTING_HISTORY_FILENAME).toBe('routing-history.sqlite')
  })

  it('stores statistics only: no URL, query or proxy address in the file', async () => {
    const taskRoot = await root()
    const store = RoutingHistoryDatabase.open(taskRoot)
    await store.scoped(scope, { minSamples: 1 }).record('example.com', 'steel', outcome(), route)
    store.close()
    const raw = new Database(join(taskRoot, ROUTING_HISTORY_FILENAME), { readonly: true })
    const dump = JSON.stringify(raw.prepare('SELECT * FROM routes').all()) + JSON.stringify(raw.prepare('SELECT * FROM route_expiries').all())
    raw.close()
    expect(dump).not.toMatch(/https?:\/\/|\?|127\.0\.0\.1/)
    expect((await readFile(join(taskRoot, ROUTING_HISTORY_FILENAME))).length).toBeGreaterThan(0)
  })

  it('keys a route by family, formats, versions and scope: another of any reads nothing of it', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 1 })
    await history.record('example.com', 'steel', outcome(), route)
    expect(Object.keys((await history.read('example.com', route)).vendors)).toEqual(['steel'])
    // Same host and egress class: the fallback reads it; a different egress class does not.
    expect(Object.keys((await history.read('example.com', { ...route, family: 'path:/q' })).vendors)).toEqual(['steel'])
    expect(history.lastBasis).toBe('host_egress')
    expect((await store.scoped({ ...scope, egressClass: 'direct' }, { minSamples: 1 }).read('example.com', route)).vendors).toEqual({})
    expect((await history.read('other.example', route)).vendors).toEqual({})
    store.close()
  })

  it('reads a route below the minimum sample size from (host, egress class), then from nothing: the declared ladder', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 3 })
    await history.record('example.com', 'steel', outcome(), route)
    await history.record('example.com', 'steel', outcome(), { ...route, family: 'path:/q' })
    expect((await history.read('example.com', route)).vendors).toEqual({})
    expect(history.lastBasis).toBe('fixed')
    await history.record('example.com', 'steel', outcome(), { ...route, family: 'path:/r' })
    const host = await history.read('example.com', route)
    expect(history.lastBasis).toBe('host_egress')
    expect(host.vendors.steel).toMatchObject({ attempts: 3 })
    await history.record('example.com', 'steel', outcome(), route)
    await history.record('example.com', 'steel', outcome(), route)
    expect((await history.read('example.com', route)).vendors.steel).toMatchObject({ attempts: 3 })
    expect(history.lastBasis).toBe('route')
    store.close()
  })

  it('expires a route past its TTL, and says so', async () => {
    let now = Date.parse('2026-10-20T00:00:00Z')
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 1, ttlMs: DAY, now: () => now })
    await history.record('example.com', 'steel', outcome(), route)
    now += DAY + 1
    expect((await history.read('example.com', route)).vendors).toEqual({})
    expect(history.expiries('example.com')).toEqual([{ reason: 'ttl', detail: { ageMs: DAY + 1, ttlMs: DAY } }])
    store.close()
  })

  it('expires a vendor\'s rows when its browser major version or egress configuration changes, and a family\'s when the site template does', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 1 })
    await history.record('example.com', 'steel', outcome(), route)
    await history.record('example.com', 'steel', outcome({ browserMajor: 132 }), route)
    expect((await history.read('example.com', route)).vendors.steel).toMatchObject({ attempts: 1 })
    await history.record('example.com', 'steel', outcome({ browserMajor: 132, egressConfigVersion: 'bbbbbbbbbbbb' }), route)
    expect((await history.read('example.com', route)).vendors.steel).toMatchObject({ attempts: 1 })
    await history.record('example.com', 'steel', outcome({ browserMajor: 132, egressConfigVersion: 'bbbbbbbbbbbb' }), { ...route, siteTemplate: 't1' })
    await history.record('example.com', 'steel', outcome({ browserMajor: 132, egressConfigVersion: 'bbbbbbbbbbbb' }), { ...route, siteTemplate: 't2' })
    expect(history.expiries('example.com')).toEqual([
      { reason: 'browser_version', detail: { from: '131', to: '132' } },
      { reason: 'egress_config', detail: { from: 'aaaaaaaaaaaa', to: 'bbbbbbbbbbbb' } },
      { reason: 'site_template', detail: { from: 't1', to: 't2' } },
    ])
    store.close()
  })

  it('expires a route when the extractor, verifier or policy version moves on', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    await store.scoped(scope, { minSamples: 1 }).record('example.com', 'steel', outcome(), route)
    const next = store.scoped(scope, { minSamples: 1 })
    await next.record('example.com', 'steel', outcome(), { ...route, versions: 'extract-tf/32|verify/9' })
    const policy = store.scoped(scope, { minSamples: 1, policyVersion: 'route/2' })
    await policy.record('example.com', 'steel', outcome(), { ...route, versions: 'extract-tf/32|verify/9' })
    expect(next.expiries('example.com').map((e) => e.reason)).toEqual(['extractor_version', 'policy_version'])
    // The old policy's rows are not read by the new one, the fallback included.
    expect((await policy.read('example.com', { ...route, versions: 'extract-tf/32|verify/9' })).vendors.steel).toMatchObject({ attempts: 1 })
    store.close()
  })

  it('never reads the rows of an older extractor or verifier through the host\'s fallback: a read under the new versions expires them', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 3 })
    for (let i = 0; i < 3; i++) await history.record('example.com', 'steel', outcome(), route)
    expect((await history.read('example.com', { ...route, versions: 'extract-tf/32|verify/9' })).vendors).toEqual({})
    expect(history.lastBasis).toBe('fixed')
    expect(history.expiries('example.com')).toEqual([{ reason: 'extractor_version', detail: { from: route.versions, to: 'extract-tf/32|verify/9' } }])
    store.close()
  })

  it('expires the rows of another exit when the run\'s proxy changes, and keeps a pool\'s exits side by side', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const [a, b] = [store.exitId('proxy-a.test:8080'), store.exitId('proxy-b.test:8080')]
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
    await store.scoped({ ...scope, egressConfig: a }, { minSamples: 1 }).record('example.com', 'steel', outcome(), route)
    const moved = store.scoped({ ...scope, egressConfig: b }, { minSamples: 1 })
    expect((await moved.read('example.com', route)).vendors).toEqual({})
    expect(moved.expiries('example.com')).toEqual([{ reason: 'egress_config', detail: { from: a, to: b, of: 'exit' } }])

    const pool = { ...scope, egressClass: 'pool' }
    await store.scoped({ ...pool, egressConfig: a }, { minSamples: 1 }).record('pool.example', 'steel', outcome(), route)
    await store.scoped({ ...pool, egressConfig: b }, { minSamples: 1 }).record('pool.example', 'steel', outcome(), route)
    expect((await store.scoped({ ...pool, egressConfig: a }, { minSamples: 1 }).read('pool.example', route)).vendors.steel).toMatchObject({ attempts: 1 })
    expect((await store.scoped({ ...pool, egressConfig: b }, { minSamples: 1 }).read('pool.example', route)).vendors.steel).toMatchObject({ attempts: 1 })
    expect(store.scoped(pool).expiries('pool.example')).toEqual([])
    store.close()
  })

  it('names an exit by a salt of its own file: another task root gives the same proxy another id', async () => {
    const one = RoutingHistoryDatabase.open(await root())
    const two = RoutingHistoryDatabase.open(await root())
    expect(one.exitId('proxy-a.test:8080')).not.toBe(two.exitId('proxy-a.test:8080'))
    one.close()
    two.close()
  })

  it('falls back vendor by vendor: one with enough attempts on the route does not hide another\'s on the host', async () => {
    const store = RoutingHistoryDatabase.open(await root())
    const history = store.scoped(scope, { minSamples: 3 })
    for (let i = 0; i < 3; i++) await history.record('example.com', 'steel', outcome(), route)
    await history.record('example.com', 'bb', outcome(), route)
    for (let i = 0; i < 3; i++) await history.record('example.com', 'bb', outcome(), { ...route, family: 'path:/q' })
    const read = await history.read('example.com', route)
    expect(read.vendors.steel).toMatchObject({ attempts: 3 })
    expect(read.vendors.bb).toMatchObject({ attempts: 4 })
    expect(history.lastBases).toEqual({ steel: 'route', bb: 'host_egress' })
    store.close()
  })
})
