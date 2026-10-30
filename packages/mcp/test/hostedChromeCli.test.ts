import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runHostedCli as run } from './hostedCliRun.js'

// The hosted CLIs and hosted_chrome's variables: none set changes nothing, part of them stops the start, and the
// octocrawl-chrome service names its exit by kind and count alone. Every value here is made up.

const LOGIN = 'made-up-pass-4d1e'

const API = { W2L_HOSTED_STORE: 'memory', W2L_QUOTA_HASH_KEY: 'k'.repeat(40) }
const CHROME = {
  W2L_HOSTED_CHROME_URL: 'https://octocrawl-chrome-abc123-as.a.run.app',
  W2L_HOSTED_CHROME_ATTESTATION: JSON.stringify({ principal: 'operator@example.test', at: '2026-10-29T00:00:00Z', statement: 'test' }),
  W2L_HOSTED_CHROME_EGRESS: 'google',
}

let dir = ''
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'w2l-hosted-chrome-cli-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('the hosted API\'s start and hosted_chrome\'s variables', () => {
  it('starts as before with none set, and says the rung is off', async () => {
    const { out, code } = await run('hostedApiCli.ts', { ...API, W2L_TASK_ROOT: join(dir, 'none') })
    expect(code).toBeNull()
    expect(out).toContain('"hostedChrome":null')
    // Nor are the regular-expression checks taken (ADR 0006, amendment of 2026-10-29): hostedRegexCli.perf.test.ts switches them on.
    expect(out).toContain('"regexChecks":false')
  }, 40_000)

  it('does not start with part of them, naming what is missing', async () => {
    const { W2L_HOSTED_CHROME_EGRESS: _egress, ...partial } = CHROME
    const { out, code } = await run('hostedApiCli.ts', { ...API, ...partial, W2L_TASK_ROOT: join(dir, 'partial') })
    expect(code).not.toBe(0)
    expect(code).not.toBeNull()
    expect(out).toContain('W2L_HOSTED_CHROME_EGRESS is unset')
  }, 40_000)

  it('does not start with all of them on a memory store, which holds no switch or counter', async () => {
    const { out, code } = await run('hostedApiCli.ts', { ...API, ...CHROME, W2L_TASK_ROOT: join(dir, 'memory') })
    expect(code).not.toBeNull()
    expect(out).toContain('hosted_chrome needs the Firestore store')
  }, 40_000)
})

describe('the octocrawl-chrome service\'s start and its proxy list', () => {
  it('leaves from Cloud Run\'s own egress without the list, and from the datacenter list with it, naming no proxy', async () => {
    const google = await run('hostedChromeCli.ts', { DISPLAY: ':99' })
    expect(google.code).toBeNull()
    expect(google.out).toMatch(/"egressKind":"google","proxies":0/)
    const file = join(dir, 'proxies')
    await writeFile(file, `198.51.100.7:8080:made-up-user:${LOGIN}\n198.51.100.8:8080:made-up-user:${LOGIN}\n`)
    const datacenter = await run('hostedChromeCli.ts', { DISPLAY: ':99', W2L_HOSTED_CHROME_PROXIES_FILE: file })
    expect(datacenter.code).toBeNull()
    expect(datacenter.out).toMatch(/"egressKind":"datacenter","proxies":2/)
    for (const secret of [LOGIN, 'made-up-user', '198.51.100.7']) expect(datacenter.out).not.toContain(secret)
  }, 60_000)

  it('does not start with a list it cannot read or parse, and names no line\'s content', async () => {
    const missing = await run('hostedChromeCli.ts', { DISPLAY: ':99', W2L_HOSTED_CHROME_PROXIES_FILE: join(dir, 'missing') })
    expect(missing.code).not.toBeNull()
    expect(missing.out).toContain('W2L_HOSTED_CHROME_PROXIES_FILE could not be read')
    const file = join(dir, 'broken')
    await writeFile(file, `198.51.100.7:8080:${LOGIN}\n`)
    const broken = await run('hostedChromeCli.ts', { DISPLAY: ':99', W2L_HOSTED_CHROME_PROXIES_FILE: file })
    expect(broken.code).not.toBeNull()
    expect(broken.out).toContain('line 1')
    expect(broken.out).not.toContain(LOGIN)
  }, 60_000)
})
