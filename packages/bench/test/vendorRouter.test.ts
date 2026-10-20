import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  FileRoutingHistory,
  MemoryRoutingHistory,
  rankVendors,
  shadowRankVendors,
  startingVendor,
  unitDeliveryCost,
  type DomainHistory,
  type RouteObservation,
  type RoutingHistory,
} from '../src/routing/vendorRouter.js'

function entry(partial: Partial<{ attempts: number; contentful: number; latency: number; cost: number; unknown: number; last: string | null; samples: number[] }>) {
  const samples = partial.samples ?? [partial.latency ?? 0]
  return {
    attempts: partial.attempts ?? 1,
    contentful: partial.contentful ?? 0,
    latencyTotalMs: partial.latency ?? 0,
    latencySamplesMs: samples,
    costTotalUsd: partial.cost ?? 0,
    costUnknownAttempts: partial.unknown ?? 0,
    lastFailureClass: (partial.last ?? null) as DomainHistory['vendors'][string]['lastFailureClass'],
    layers: { accessDelivered: { yes: 0, no: 0, unknown: 0 }, regionLoaded: { yes: 0, no: 0, unknown: 0 }, taskVerified: { yes: 0, no: 0, unknown: 0 } },
    chargedTotalUsd: 0,
    chargedUnknownAttempts: 0,
    observations: [],
  }
}

describe('rankVendors', () => {
  it('gives untried vendors a small exploration bonus, lower than any proven winner', () => {
    const history: DomainHistory = {
      vendors: {
        proven: entry({ attempts: 10, contentful: 9, latency: 5_000, cost: 0.05 }),
      },
      lastVendor: 'proven',
    }
    const ranked = rankVendors(history, ['proven', 'newcomer'])
    expect(ranked[0]!.vendorId).toBe('proven')
    // The newcomer still gets a score — one chance to prove itself.
    expect(ranked[1]!.vendorId).toBe('newcomer')
    expect(ranked[1]!.score).toBeGreaterThan(0)
  })

  it('prefers the vendor with the better success rate', () => {
    const history: DomainHistory = {
      vendors: {
        good: entry({ attempts: 10, contentful: 8, latency: 5_000, cost: 0.05 }),
        bad: entry({ attempts: 10, contentful: 2, latency: 1_000, cost: 0.01 }),
      },
      lastVendor: null,
    }
    const ranked = rankVendors(history, ['good', 'bad'])
    // Success dominates latency and cost — a fast cheap failure is still a
    // failure, and the ladder should not learn to love it.
    expect(ranked[0]!.vendorId).toBe('good')
  })

  it('breaks equal success rates on latency, then cost', () => {
    const history: DomainHistory = {
      vendors: {
        fast: entry({ attempts: 5, contentful: 5, latency: 2_500, cost: 0.1 }),
        slow: entry({ attempts: 5, contentful: 5, latency: 10_000, cost: 0.1 }),
      },
      lastVendor: null,
    }
    const ranked = rankVendors(history, ['slow', 'fast'])
    expect(ranked[0]!.vendorId).toBe('fast')
  })

  it('ranks on the TRUE MEDIAN, so one outlier attempt cannot buy or break a vendor', () => {
    // steady has median 100 (one 5s outlier); spiky has median 800 (one 100ms
    // outlier). An average would rank spiky's cheap outlier over steady's
    // consistent performance — the median must not.
    const history: DomainHistory = {
      vendors: {
        steady: entry({ attempts: 5, contentful: 5, samples: [100, 100, 100, 100, 5_000], cost: 0.1 }),
        spiky: entry({ attempts: 5, contentful: 5, samples: [100, 800, 800, 800, 800], cost: 0.1 }),
      },
      lastVendor: null,
    }
    const ranked = rankVendors(history, ['spiky', 'steady'])
    expect(ranked[0]!.vendorId).toBe('steady')
    expect(ranked[0]!.medianLatencyMs).toBe(100)
    expect(ranked[1]!.medianLatencyMs).toBe(800)
  })
})

describe('startingVendor', () => {
  it('starts from the ranked winner when no vendor-level failure just happened', () => {
    const history: DomainHistory = {
      vendors: {
        a: entry({ attempts: 5, contentful: 5, last: null }),
        b: entry({ attempts: 1, contentful: 0 }),
      },
      lastVendor: 'a',
    }
    const ranked = rankVendors(history, ['a', 'b'])
    expect(startingVendor(ranked, history)).toBe('a')
  })

  it('rotates to the next vendor after a provider_error', () => {
    const history: DomainHistory = {
      vendors: {
        a: entry({ attempts: 5, contentful: 5, last: 'provider_error' }),
        b: entry({ attempts: 5, contentful: 4, last: null }),
      },
      lastVendor: 'a',
    }
    const ranked = rankVendors(history, ['a', 'b'])
    expect(startingVendor(ranked, history)).toBe('b')
  })

  it('rotates after an identity_mismatch too', () => {
    const history: DomainHistory = {
      vendors: {
        a: entry({ attempts: 3, contentful: 3, last: 'identity_mismatch' }),
        b: entry({ attempts: 0 }),
      },
      lastVendor: 'a',
    }
    const ranked = rankVendors(history, ['a', 'b'])
    expect(startingVendor(ranked, history)).toBe('b')
  })

  it('does NOT rotate after a site-level bot_gate — the vendor did not break', () => {
    const history: DomainHistory = {
      vendors: {
        a: entry({ attempts: 5, contentful: 3, last: 'bot_gate' }),
        b: entry({ attempts: 1, contentful: 0 }),
      },
      lastVendor: 'a',
    }
    const ranked = rankVendors(history, ['a', 'b'])
    expect(startingVendor(ranked, history)).toBe('a')
  })
})

describe('MemoryRoutingHistory', () => {
  it('accumulates outcomes per domain per vendor', async () => {
    const h = new MemoryRoutingHistory()
    await h.record('example.com', 'steel', { contentful: true, wallMs: 100, costUsd: 0.01, failureClass: null })
    await h.record('example.com', 'steel', { contentful: false, wallMs: 200, costUsd: 0.01, failureClass: 'bot_gate' })
    await h.record('other.example', 'steel', { contentful: true, wallMs: 300, costUsd: 0.02, failureClass: null })

    const example = await h.read('example.com')
    expect(example.vendors.steel).toMatchObject({ attempts: 2, contentful: 1, latencyTotalMs: 300 })
    const other = await h.read('other.example')
    expect(other.vendors.steel).toMatchObject({ attempts: 1, contentful: 1 })
  })

  it('counts an attempt whose cost the vendor did not state as unknown, never as free', async () => {
    const h = new MemoryRoutingHistory()
    await h.record('example.com', 'steel', { contentful: true, wallMs: 100, costUsd: null, failureClass: null })
    await h.record('example.com', 'steel', { contentful: true, wallMs: 100, costUsd: 0.02, failureClass: null })
    expect((await h.read('example.com')).vendors.steel).toMatchObject({ costTotalUsd: 0.02, costUnknownAttempts: 1 })
    // Same success and latency: the vendor whose cost is known ranks first, and the unknown one gets no cost bonus.
    const ranked = rankVendors({ vendors: { known: entry({ contentful: 1, latency: 100, cost: 0.02 }), hidden: entry({ contentful: 1, latency: 100, unknown: 1 }) }, lastVendor: null }, ['hidden', 'known'])
    expect(ranked.map((score) => [score.vendorId, score.costUnknown])).toEqual([['known', false], ['hidden', true]])
  })
})

describe('FileRoutingHistory — legacy and caps', () => {
  it('reads legacy JSON without latencySamplesMs and synthesizes samples instead of crashing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    const file = join(dir, 'history.json')
    await writeFile(
      file,
      JSON.stringify({
        'example.com': {
          vendors: {
            steel: { attempts: 2, contentful: 1, latencyTotalMs: 300, costTotalUsd: 0.02, lastFailureClass: null },
          },
          lastVendor: 'steel',
        },
      }),
    )
    const history = new FileRoutingHistory(file)
    const read = await history.read('example.com')
    expect(read.vendors.steel).toBeDefined()
    // Legacy mean = 300/2 = 150 per attempt.
    expect(read.vendors.steel!.latencySamplesMs).toEqual([150, 150])
    // And recording a new outcome still works on the normalized entry.
    await history.record('example.com', 'steel', { contentful: true, wallMs: 90, costUsd: 0.01, failureClass: null })
    const after = await history.read('example.com')
    expect(after.vendors.steel!.attempts).toBe(3)
    expect(after.vendors.steel!.latencySamplesMs).toHaveLength(3)
    await rm(dir, { recursive: true, force: true })
  })

  it('legacy reconstruction is capped at MAX_LATENCY_SAMPLES (200) like live recording', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    const file = join(dir, 'history.json')
    await writeFile(
      file,
      JSON.stringify({
        'example.com': {
          vendors: {
            steel: { attempts: 5000, contentful: 4000, latencyTotalMs: 500_000, costTotalUsd: 1, lastFailureClass: null },
          },
          lastVendor: 'steel',
        },
      }),
    )
    const history = new FileRoutingHistory(file)
    const read = await history.read('example.com')
    // Mean = 100 per attempt, but the array must not outgrow the live cap.
    expect(read.vendors.steel!.latencySamplesMs).toHaveLength(200)
    expect(read.vendors.steel!.latencySamplesMs[0]).toBe(100)
    await rm(dir, { recursive: true, force: true })
  })

  it('legacy attempts is validated as a finite non-negative integer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    const file = join(dir, 'history.json')
    await writeFile(
      file,
      JSON.stringify({
        'example.com': {
          vendors: {
            bad: { attempts: -3, contentful: 2, latencyTotalMs: 100, costTotalUsd: 0, lastFailureClass: null },
            nan: { attempts: 'twelve', contentful: 2, latencyTotalMs: 100, costTotalUsd: 0, lastFailureClass: null },
          },
          lastVendor: 'bad',
        },
      }),
    )
    const history = new FileRoutingHistory(file)
    const read = await history.read('example.com')
    // Invalid attempts normalize to 0: no negative-size arrays, no NaN math.
    expect(read.vendors.bad!.attempts).toBe(0)
    expect(read.vendors.bad!.latencySamplesMs).toEqual([])
    expect(read.vendors.nan!.attempts).toBe(0)
    await rm(dir, { recursive: true, force: true })
  })

  it('an even number of samples takes the mean of the two middle values', () => {
    const history: DomainHistory = {
      vendors: {
        even: entry({ attempts: 4, contentful: 4, samples: [100, 200, 300, 400], cost: 0.1 }),
      },
      lastVendor: null,
    }
    const ranked = rankVendors(history, ['even'])
    // True median of [100,200,300,400] is (200+300)/2.
    expect(ranked[0]!.medianLatencyMs).toBe(250)
  })

  it('caps retained latency samples at MAX_LATENCY_SAMPLES (200)', async () => {
    const history = new MemoryRoutingHistory()
    for (let i = 0; i < 205; i++) {
      await history.record('example.com', 'steel', { contentful: true, wallMs: i, costUsd: 0, failureClass: null })
    }
    const read = await history.read('example.com')
    const samples = read.vendors.steel!.latencySamplesMs
    expect(samples).toHaveLength(200)
    expect(samples[samples.length - 1]).toBe(204)
    expect(samples[0]).toBe(5) // the oldest retained
  })
})

describe('route observations (PA G2a)', () => {
  const observation = (over: Partial<RouteObservation> = {}): RouteObservation => ({
    accessDelivered: true,
    regionLoaded: true,
    taskVerified: false,
    failureStage: 'extraction',
    readiness: 'not_extracted',
    reason: 'checks_failed',
    timings: { coldStartMs: null, navigationMs: null, challengeWaitMs: null, regionWaitMs: 2_000, captureMs: null, extractMs: 40, serializeMs: null, cleanupMs: null, sessionMs: 3_100, totalMs: 3_500 },
    environment: { browserMajor: 131, egressClass: 'vendor_default', egressConfigVersion: 'abc123def456' },
    chargedUsd: 0.004,
    chargeBasis: 'measured',
    ...over,
  })

  async function both(run: (history: RoutingHistory) => Promise<void>): Promise<[DomainHistory, DomainHistory]> {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    try {
      const memory = new MemoryRoutingHistory()
      const file = new FileRoutingHistory(join(dir, 'history.json'))
      await run(memory)
      await run(file)
      return [await memory.read('example.com'), await new FileRoutingHistory(join(dir, 'history.json')).read('example.com')]
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  it('keeps each attempt\'s observation and counts its layers, the same in memory and on file', async () => {
    const [memory, file] = await both(async (h) => {
      await h.record('example.com', 'steel', { contentful: true, verified: null, wallMs: 3_500, costUsd: null, failureClass: null, observation: observation() })
      await h.record('example.com', 'steel', { contentful: false, wallMs: 900, costUsd: null, failureClass: 'bot_gate', observation: observation({ accessDelivered: false, regionLoaded: null, taskVerified: null, failureStage: 'access', readiness: null, reason: 'cloudflare_challenge', chargedUsd: null, chargeBasis: null }) })
    })
    const steel = memory.vendors.steel!
    // not_extracted is not the vendor failing access: the success rate still counts it (verified null, contentful).
    expect(steel).toMatchObject({ attempts: 2, contentful: 1, chargedTotalUsd: 0.004, chargedUnknownAttempts: 1 })
    expect(steel.layers).toEqual({
      accessDelivered: { yes: 1, no: 1, unknown: 0 },
      regionLoaded: { yes: 1, no: 0, unknown: 1 },
      taskVerified: { yes: 0, no: 1, unknown: 1 },
    })
    expect(steel.observations.map((o) => o.failureStage)).toEqual(['extraction', 'access'])
    expect(steel.observations[0]).toMatchObject({ ...observation(), wallMs: 3_500, costUsd: null, failureClass: null })
    expect(typeof steel.observations[0]!.observedAt).toBe('string')
    const { observations: memoryObs, ...memoryRest } = steel
    const { observations: fileObs, ...fileRest } = file.vendors.steel!
    expect(fileRest).toEqual(memoryRest)
    expect(fileObs.map(({ observedAt: _at, ...o }) => o)).toEqual(memoryObs.map(({ observedAt: _at, ...o }) => o))
  })

  it('an outcome with no observation leaves every layer and the charge unknown, never zero', async () => {
    const [memory] = await both(async (h) => {
      await h.record('example.com', 'steel', { contentful: true, wallMs: 100, costUsd: 0.01, failureClass: null })
    })
    expect(memory.vendors.steel).toMatchObject({
      layers: { accessDelivered: { yes: 0, no: 0, unknown: 1 }, regionLoaded: { yes: 0, no: 0, unknown: 1 }, taskVerified: { yes: 0, no: 0, unknown: 1 } },
      chargedTotalUsd: 0,
      chargedUnknownAttempts: 1,
      observations: [],
    })
  })

  it('reads JSON written before G2a: its attempts are unknown on every layer and charge', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    const file = join(dir, 'history.json')
    await writeFile(file, JSON.stringify({ 'example.com': { vendors: { steel: { attempts: 3, contentful: 2, latencyTotalMs: 300, latencySamplesMs: [100, 100, 100], costTotalUsd: 0, costUnknownAttempts: 3, lastFailureClass: null } }, lastVendor: 'steel' } }))
    const read = await new FileRoutingHistory(file).read('example.com')
    expect(read.vendors.steel).toMatchObject({
      attempts: 3,
      layers: { accessDelivered: { yes: 0, no: 0, unknown: 3 }, regionLoaded: { yes: 0, no: 0, unknown: 3 }, taskVerified: { yes: 0, no: 0, unknown: 3 } },
      chargedTotalUsd: 0,
      chargedUnknownAttempts: 3,
      observations: [],
    })
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps only the known fields of an observation on file, and reads counts that do not add up as unknown', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hist-'))
    const file = join(dir, 'history.json')
    const stored = { ...observation(), observedAt: '2026-10-20T00:00:00.000Z', wallMs: 3_500, costUsd: null, failureClass: null }
    await writeFile(file, JSON.stringify({ 'example.com': { vendors: { steel: {
      attempts: 4, contentful: 2, latencyTotalMs: 400, latencySamplesMs: [100, 100, 100, 100], costTotalUsd: 0, costUnknownAttempts: 4, lastFailureClass: null,
      layers: {}, chargedTotalUsd: 0,
      observations: [{ ...stored, url: 'https://example.com/secret?token=x', reason: 'https://example.com/x' }, { timings: {}, environment: {} }],
    } }, lastVendor: 'steel' } }))
    const history = new FileRoutingHistory(file)
    await history.record('example.com', 'steel', { contentful: true, wallMs: 100, costUsd: null, failureClass: null })
    const raw = await readFile(file, 'utf8')
    expect(raw).not.toContain('token=x')
    expect(raw).not.toContain('https://')
    const steel = (await history.read('example.com')).vendors.steel!
    expect(steel.observations).toEqual([{ ...stored, reason: null }])
    expect(steel.layers.accessDelivered).toEqual({ yes: 0, no: 0, unknown: 5 })
    expect(steel.chargedUnknownAttempts).toBe(5)
    await rm(dir, { recursive: true, force: true })
  })

  it('caps the kept observations at the most recent 50', async () => {
    const history = new MemoryRoutingHistory()
    for (let i = 0; i < 55; i++) {
      await history.record('example.com', 'steel', { contentful: true, wallMs: i, costUsd: null, failureClass: null, observation: observation({ timings: { ...observation().timings, totalMs: i } }) })
    }
    const kept = (await history.read('example.com')).vendors.steel!.observations
    expect(kept).toHaveLength(50)
    expect(kept[0]!.timings.totalMs).toBe(5)
  })
})

describe('shadowRankVendors (PA G3)', () => {
  const env = { browserMajor: 131, egressClass: 'vendor_default', egressConfigVersion: 'abc123def456' }
  const seen = (verified: boolean | null, chargedUsd: number | null, environment = env): RouteObservation => ({
    accessDelivered: true,
    regionLoaded: verified === null ? null : true,
    taskVerified: verified,
    failureStage: verified === false ? 'task' : null,
    readiness: verified === null ? null : verified ? 'ready' : 'not_served',
    reason: null,
    timings: { coldStartMs: null, navigationMs: null, challengeWaitMs: null, regionWaitMs: null, captureMs: null, extractMs: null, serializeMs: null, cleanupMs: null, sessionMs: null, totalMs: 1_000 },
    environment,
    chargedUsd,
    chargeBasis: chargedUsd === null ? null : 'measured',
  })
  /** Records `passed` verified and `failed` failed attempts at `each` dollars a call (null: no settled charge). */
  async function route(history: RoutingHistory, vendor: string, passed: number, failed: number, each: number | null, environment = env): Promise<void> {
    for (const verified of [...Array<boolean>(passed).fill(true), ...Array<boolean>(failed).fill(false)]) {
      await history.record('example.com', vendor, { contentful: true, verified, wallMs: 1_000, costUsd: each, failureClass: null, observation: seen(verified, each, environment) })
    }
  }

  it('is what every attempt was charged over the verified deliveries, unknown with none, and an unknown charge is exposure, not free', async () => {
    const history = new MemoryRoutingHistory()
    await route(history, 'paid', 2, 2, 0.01)
    await route(history, 'never', 0, 3, 0.01)
    await route(history, 'hidden', 2, 0, 0.01)
    await route(history, 'hidden', 1, 0, null)
    const { vendors } = await history.read('example.com')
    // $0.04 over 2 passed: the failed attempts' charge is part of what a delivery costs.
    expect(unitDeliveryCost(vendors.paid!)).toEqual({ unitCostUsd: 0.02, knownChargedUsd: 0.04, unknownExposureAttempts: 0, verified: 2, judged: 4 })
    // Nothing passed: unknown, neither zero nor infinite.
    expect(unitDeliveryCost(vendors.never!).unitCostUsd).toBeNull()
    // One attempt with no settled charge: the unit cost is not known, and the attempt is counted as exposure.
    expect(unitDeliveryCost(vendors.hidden!)).toEqual({ unitCostUsd: null, knownChargedUsd: 0.02, unknownExposureAttempts: 1, verified: 3, judged: 3 })
  })

  it('ranks two vendors with the same unit cost alike, however often each was called (the cumulative cost does not)', async () => {
    const history = new MemoryRoutingHistory()
    await route(history, 'few', 3, 3, 0.01)
    await route(history, 'many', 30, 30, 0.01)
    const domain = await history.read('example.com')
    for (const declared of [['few', 'many'], ['many', 'few']]) {
      const shadow = shadowRankVendors(domain, declared)
      expect(shadow.fallbackReasons).toEqual([])
      expect(shadow.candidates.map((c) => c.unitCostUsd)).toEqual([0.02, 0.02])
      // A tie keeps the declared order: neither the call count nor the total moves it.
      expect(shadow.order).toEqual(declared)
    }
    // Today's formula scores the cumulative cost, so the vendor called more ranks lower on the same unit cost.
    expect(rankVendors(domain, ['many', 'few']).map((r) => r.vendorId)).toEqual(['few', 'many'])
  })

  it('puts the lower unit cost first, and a vendor whose unit cost is unknown after the known ones', async () => {
    const history = new MemoryRoutingHistory()
    await route(history, 'dear', 3, 0, 0.05)
    await route(history, 'cheap', 2, 2, 0.01)
    await route(history, 'never', 0, 4, 0.001)
    const shadow = shadowRankVendors(await history.read('example.com'), ['never', 'dear', 'cheap'])
    expect(shadow.order).toEqual(['cheap', 'dear', 'never'])
    expect(shadow.candidates.find((c) => c.vendorId === 'cheap')).toMatchObject({ unitCostUsd: 0.02, passRate: 0.5, samples: 4, fallbackReason: null })
  })

  it('falls back to the declared order, saying why, on a new host, a vendor with no or too few samples, or a new version', async () => {
    expect(shadowRankVendors({ vendors: {}, lastVendor: null }, ['a', 'b'])).toMatchObject({ order: ['a', 'b'], fallbackReasons: ['new_host'] })

    const history = new MemoryRoutingHistory()
    await route(history, 'b', 3, 0, 0.01)
    await route(history, 'c', 1, 0, 0.001)
    const domain = await history.read('example.com')
    const shadow = shadowRankVendors(domain, ['a', 'b', 'c'])
    expect(shadow.order).toEqual(['a', 'b', 'c'])
    expect(shadow.fallbackReasons).toEqual(['no_history', 'insufficient_samples'])
    expect(shadow.candidates.map((c) => [c.vendorId, c.fallbackReason, c.samples])).toEqual([['a', 'no_history', 0], ['b', null, 3], ['c', 'insufficient_samples', 1]])

    const moved = new MemoryRoutingHistory()
    await route(moved, 'b', 3, 0, 0.05)
    await route(moved, 'c', 3, 0, 0.01)
    const upgraded = shadowRankVendors(await moved.read('example.com'), ['b', 'c'], { environments: { c: { ...env, browserMajor: 132 } } })
    expect(upgraded.order).toEqual(['b', 'c'])
    expect(upgraded.fallbackReasons).toEqual(['version_changed'])
    // A store that leaves out what it holds too little of, or what a version change just expired, says so.
    expect(shadowRankVendors({ vendors: {}, lastVendor: null }, ['a', 'b'], { thin: { a: 2 } })).toMatchObject({ fallbackReasons: ['insufficient_samples', 'no_history'] })
    expect(shadowRankVendors({ vendors: {}, lastVendor: null }, ['a', 'b'], { thin: { a: 2 } }).candidates[0]).toMatchObject({ vendorId: 'a', samples: 2 })
    expect(shadowRankVendors(await moved.read('example.com'), ['b', 'c', 'd'], { expired: { d: 'browser_version' } }).fallbackReasons).toEqual(['version_changed'])
    // Rows past their TTL leave a host as good as new.
    expect(shadowRankVendors({ vendors: {}, lastVendor: null }, ['d'], { expired: { d: 'ttl' } }).fallbackReasons).toEqual(['new_host'])
    // The same environment, or one not known, is no change.
    expect(shadowRankVendors(await moved.read('example.com'), ['b', 'c'], { environments: { b: { ...env, browserMajor: null }, c: env } }).order).toEqual(['c', 'b'])
  })
})
