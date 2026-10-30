import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runHostedCli } from './hostedCliRun.js'

// The hosted CLIs and the regular-expression checks (ADR 0006, amendment of 2026-10-29): the API takes them at
// W2L_HOSTED_REGEX_CHECKS=1 and the chrome service always, each only when its start-up self-test passed. A perf file:
// that self-test bounds how long a stopped scan overruns its limit, which a full machine can stretch.

const API = { W2L_HOSTED_STORE: 'memory', W2L_QUOTA_HASH_KEY: 'k'.repeat(40) }
let dir = ''
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'w2l-hosted-regex-cli-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

describe('the hosted CLIs and the regular-expression checks', () => {
  it('starts the API with them at 1, saying so and on which Node; at any other value, not at all', async () => {
    const on = await runHostedCli('hostedApiCli.ts', { ...API, W2L_HOSTED_REGEX_CHECKS: '1', W2L_TASK_ROOT: join(dir, 'on') })
    expect(on.code).toBeNull()
    expect(on.out).toContain(`"regexChecks":true,"node":"${process.version}"`)
    expect(on.out).not.toContain('regex_self_test_failed')
    const wrong = await runHostedCli('hostedApiCli.ts', { ...API, W2L_HOSTED_REGEX_CHECKS: 'yes', W2L_TASK_ROOT: join(dir, 'wrong') })
    expect(wrong.code).not.toBeNull()
    expect(wrong.out).toContain('W2L_HOSTED_REGEX_CHECKS must be 1 (on), or 0 or unset (off)')
  }, 60_000)

  it('starts the chrome service with them, its self-test passed', async () => {
    const { out, code } = await runHostedCli('hostedChromeCli.ts', { DISPLAY: ':99' })
    expect(code).toBeNull()
    expect(out).toMatch(/"severity":"INFO","event":"hosted_chrome_started".*"regexChecks":true,"node":"v\d+/)
  }, 60_000)
})
