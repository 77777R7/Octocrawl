import { describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { loadEngineConfig, tunedPolicy } from '../src/engineConfig.js'
import { parseListen } from '../src/listen.js'

const ATTESTATION = { principal: 'operator@example.test', at: '2026-10-20T00:00:00Z', statement: 'I accept the provider terms and cost.' }
const grant = (tier: string, capabilities: string[]) => JSON.stringify({ tier, capabilities, budget: { perRunUsd: 1 }, attestation: ATTESTATION })

describe('loadEngineConfig: the engine options every local entry point reads (docs/pa-enhancement-tasks.md A2)', () => {
  it('has no grant and the defaults without one, and prints nothing', () => {
    expect(loadEngineConfig({}, { hosted: false })).toEqual({ accessGrant: null, browserEngine: 'playwright', browserIdentity: 'declared', compatHosts: [], egressProxies: [], egressEchoUrl: null, workerCount: 4, notices: [] })
  })

  it('reads every option from the environment of a local entry point, and --access-grant only where the entry point passes its flags', () => {
    const env = {
      W2L_ACCESS_GRANT: grant('enhanced', ['vendor_remote_browser', 'enhanced_browser', 'compatible_transport', 'egress_sessions']),
      W2L_BROWSER_ENGINE: 'patchright',
      W2L_BROWSER_IDENTITY: 'actual',
      W2L_COMPAT_HOSTS: 'shop.test',
      W2L_EGRESS_PROXIES: 'http://proxy-a.test:8080',
      W2L_EGRESS_ECHO_URL: 'https://echo.test/ip',
      W2L_WORKER_COUNT: '8',
    }
    const config = loadEngineConfig(env, { hosted: false })
    expect(config).toMatchObject({ browserEngine: 'patchright', browserIdentity: 'actual', compatHosts: ['shop.test'], egressEchoUrl: 'https://echo.test/ip', workerCount: 8 })
    expect(config.accessGrant?.capabilities).toEqual(['vendor_remote_browser', 'enhanced_browser', 'compatible_transport', 'egress_sessions'])
    expect(config.egressProxies.map((proxy) => proxy.endpoint)).toEqual(['proxy-a.test:8080'])
    expect(config.notices.map((line) => line.split(/[:(]/)[0]!.trim())).toEqual(['access grant', 'browser engine', 'browser identity', 'compatible transport', 'egress proxies'])
    // The API server parses the same environment to the same options, and the same lines among its notices.
    const listen = parseListen([], env)
    const { notices, ...options } = config
    expect(Object.fromEntries(Object.keys(options).map((key) => [key, listen[key as keyof typeof options]]))).toEqual(options)
    expect(listen.notices).toEqual(expect.arrayContaining(notices))
    // A flag is read only from the argv given; the local host and a one-off command pass none.
    const flagged = loadEngineConfig({}, { hosted: false, argv: ['--access-grant', grant('standard', [])] })
    expect(flagged.accessGrant).toMatchObject({ tier: 'standard' })
    expect(loadEngineConfig({}, { hosted: false }).accessGrant).toBeNull()
  })

  it('checks the per-host pacing variables over a policy', () => {
    expect(tunedPolicy(localNetworkPolicy(), { W2L_PER_HOST_CONCURRENCY: '2', W2L_PER_HOST_MIN_DELAY_MS: '1500' })).toMatchObject({ perHostConcurrency: 2, perHostMinDelayMs: 1500 })
    expect(() => tunedPolicy(localNetworkPolicy(), { W2L_PER_HOST_CONCURRENCY: '9' })).toThrow(/W2L_PER_HOST_CONCURRENCY/)
    expect(() => loadEngineConfig({ W2L_WORKER_COUNT: '65' }, { hosted: false })).toThrow(/W2L_WORKER_COUNT/)
  })

  it('keeps every refusal of a hosted server: tier my_browser, installed_chrome, the compatible transport, egress proxies', () => {
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: JSON.stringify({ tier: 'my_browser', capabilities: [] }) }, { hosted: true })).toThrow(/tier my_browser/)
    expect(loadEngineConfig({ W2L_ACCESS_GRANT: JSON.stringify({ tier: 'my_browser', capabilities: [] }) }, { hosted: false }).accessGrant?.tier).toBe('my_browser')
    const chrome = JSON.stringify({ tier: 'enhanced', capabilities: ['installed_chrome'], attestation: ATTESTATION })
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: chrome }, { hosted: true })).toThrow(/installed_chrome launches the Google Chrome/)
    expect(loadEngineConfig({ W2L_ACCESS_GRANT: chrome }, { hosted: false }).accessGrant?.capabilities).toEqual(['installed_chrome'])
    const compat = grant('standard', ['compatible_transport'])
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: compat, W2L_COMPAT_HOSTS: 'shop.test' }, { hosted: true })).toThrow(/W2L_COMPAT_HOSTS is refused on a hosted server/)
    expect(loadEngineConfig({ W2L_ACCESS_GRANT: compat }, { hosted: true }).compatHosts).toEqual([])
    const egress = grant('enhanced', ['egress_sessions'])
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: egress, W2L_EGRESS_PROXIES: 'http://proxy-a.test:8080' }, { hosted: true })).toThrow(/W2L_EGRESS_PROXIES is refused on a hosted server/)
    // And the browser options a hosted server never runs.
    expect(() => loadEngineConfig({ W2L_BROWSER_IDENTITY: 'actual' }, { hosted: true })).toThrow(/refused on a hosted server/)
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: grant('enhanced', ['enhanced_browser']), W2L_BROWSER_ENGINE: 'patchright' }, { hosted: true })).toThrow(/refused on a hosted server/)
    // The hosted API server parses through the loader, so it refuses the same.
    expect(() => parseListen(['--hosted', '--token', 'secret'], { W2L_ACCESS_GRANT: chrome })).toThrow(/installed_chrome launches the Google Chrome/)
  })
})
