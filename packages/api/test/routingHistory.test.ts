import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { identityBundleFrom, localNetworkPolicy, modeIdentity, type FetchResult } from '@w2l/contracts'
import { accessGrantFromText } from '@w2l/http-core'
import { RoutingHistoryDatabase, ROUTING_HISTORY_FILENAME, type Channel } from '@w2l/bench'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/** The engine's routing history on disk (PA G2b): a vendor's attempt is written to the task root and read back after a restart. */

const GRANT = accessGrantFromText(JSON.stringify({ tier: 'enhanced', capabilities: ['vendor_remote_browser'], budget: { perRunUsd: 5 }, attestation: { principal: 'operator@example.test', at: '2026-10-06T00:00:00Z', statement: 'I accept the terms.' } }))
const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(4)

function result(url: string, lane: FetchResult['lane'], blocked: boolean): FetchResult {
  return {
    requestedUrl: url, status: blocked ? 'blocked' : 'success', failureReason: null, blockReason: blocked ? 'bot_detected_generic' : null, budgetExceeded: null, lane,
    escalations: [], handoff: null, markdown: blocked ? null : `# Tides\n\n${PROSE}`, truncated: false, truncatedAt: null, compliance: null,
    evidence: { finalUrl: url, httpStatus: blocked ? 403 : 200, redirectChain: [], contentType: 'text/html', rawBodySha256: null, artifacts: [] },
    usage: { wallMs: 5, bytesWire: 1, bytesDecompressed: 1, requestCount: 1, attemptCount: 1, contentTokens: 400, browserMs: 0, externalCostUsd: blocked ? 0 : null },
    trace: [],
  }
}

describe('the engine\'s routing history (PA G2b)', () => {
  let root: string
  let engine: ApiEngine | null = null

  afterEach(async () => {
    await engine?.close()
    engine = null
    await rm(root, { recursive: true, force: true })
  })

  it('writes a vendor attempt to <taskRoot>/routing-history.sqlite under the rungs\' own scope, and reads it after a restart', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-routes-'))
    const taskRoot = join(root, 'tasks')
    const channelsFor = (mode: 'standard' | 'research' | 'authed', _egress?: unknown, enhanced?: boolean): Channel[] => [
      { id: 'http', identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url) => result(url, 'http', true) },
      ...(enhanced === true ? [{ id: 'provider', vendorId: 'steel', priceCeilingUsd: 0.01, grantCapabilities: ['vendor_remote_browser'], identity: identityBundleFrom(modeIdentity(mode)), fetch: async (url: string) => ({ ...result(url, 'provider', false), usage: { ...result(url, 'provider', false).usage, measuredCostUsd: 0.003 } }) }] : []),
    ]
    const start = () => createApiEngine({ taskRoot, channelsFor, accessGrant: GRANT, networkPolicy: { ...localNetworkPolicy(), perHostMinDelayMs: 0 } })
    engine = start()
    await engine.scrape({ url: 'https://shop.test/products/12345?ref=a', access: 'enhanced' })
    await engine.close()
    engine = null
    expect(existsSync(join(taskRoot, ROUTING_HISTORY_FILENAME))).toBe(true)

    // A new engine on the same task root: the attempt is there, under the scope of access enhanced's rungs.
    engine = start()
    const db = RoutingHistoryDatabase.open(taskRoot)
    try {
      const route = { family: 'path:/products/*', formats: 'markdown', versions: (db.db.prepare('SELECT versions FROM routes').get() as { versions: string }).versions }
      const enhanced = await db.scoped({ lanes: 'standard|enhanced', egressClass: 'direct', region: null }, { minSamples: 1 }).read('shop.test', route)
      expect(enhanced.vendors.steel).toMatchObject({ attempts: 1, contentful: 1, chargedTotalUsd: 0.003 })
      expect(enhanced.vendors.steel!.observations[0]).toMatchObject({ accessDelivered: true, failureStage: null, chargedUsd: 0.003, chargeBasis: 'measured' })
      const scoped = db.scoped({ lanes: 'standard|enhanced', egressClass: 'direct', region: null }, { minSamples: 1 })
      await scoped.read('shop.test', route)
      expect(scoped.lastBasis).toBe('route')
      // Plain standard's rungs are a scope of their own, as their channels are, its fallback included.
      const standard = db.scoped({ lanes: 'standard', egressClass: 'direct', region: null }, { minSamples: 1 })
      expect((await standard.read('shop.test', route)).vendors).toEqual({})
      expect(standard.lastBasis).toBe('fixed')
    } finally {
      db.close()
    }
  })
})
