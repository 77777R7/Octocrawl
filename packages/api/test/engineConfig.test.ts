import { describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { loadEngineConfig, tunedPolicy } from '../src/engineConfig.js'
import { parseListen } from '../src/listen.js'

const ATTESTATION = { principal: 'operator@example.test', at: '2026-10-20T00:00:00Z', statement: 'I accept the provider terms and cost.' }
const grant = (tier: string, capabilities: string[]) => JSON.stringify({ tier, capabilities, budget: { perRunUsd: 1 }, attestation: ATTESTATION })

describe('loadEngineConfig: the engine options every local entry point reads (docs/pa-enhancement-tasks.md A2)', () => {
  it('has no grant and the defaults without one, and prints nothing', () => {
    expect(loadEngineConfig({}, { hosted: false })).toEqual({ accessGrant: null, browserEngine: 'playwright', browserIdentity: 'declared', compatHosts: [], egressProxies: [], egressEchoUrl: null, workerCount: 4, captchaSolver: null, notices: [] })
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

  it('reads the CAPTCHA solver of a grant that names it: its key and its exit, local only (ADR 0005, 2026-10-25)', () => {
    const solverGrant = (egress: 'proxy' | 'none') => JSON.stringify({ tier: 'enhanced', capabilities: ['installed_chrome', 'third_party_captcha_solver'], budget: { perRunUsd: 20 }, attestation: ATTESTATION, solver: { vendor: 'capsolver', egress }, tariffs: { capsolver: { perSolveUsd: 0.003, maxSolvesPerCall: 2 } } })
    const KEY = 'CAP-test-key-0000'
    const EXIT = 'http://user-1:exit-secret@203.0.113.9:80'
    const config = loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: EXIT }, { hosted: false })
    expect(config.captchaSolver).toMatchObject({ vendor: 'capsolver', apiKey: KEY, perSolveUsd: 0.003, maxSolvesPerCall: 2, upstream: { endpoint: '203.0.113.9:80', username: 'user-1', password: 'exit-secret' } })
    // The startup line names the exit by host:port, never its login or the key.
    const line = config.notices.find((notice) => notice.startsWith('captcha solver'))!
    expect(line).toContain('203.0.113.9:80')
    expect(config.notices.join('\n')).not.toMatch(/exit-secret|CAP-test-key|user-1/)
    // The address the forwarder dials, for a hostname this machine cannot resolve (2026-10-26: CapSolver refused the
    // gateway's IP and took p.webshare.io): the vendor still gets the hostname, the startup line says both.
    const HOSTNAME_EXIT = 'http://user-1:exit-secret@p.proxy.test:80'
    const pinned = loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: HOSTNAME_EXIT, W2L_SOLVER_PROXY_ADDRESS: ' 203.0.113.9 ' }, { hosted: false })
    expect(pinned.captchaSolver).toMatchObject({ upstream: { endpoint: 'p.proxy.test:80', url: 'http://p.proxy.test:80' }, upstreamAddress: '203.0.113.9' })
    expect(pinned.notices.find((notice) => notice.startsWith('captcha solver'))).toContain('p.proxy.test:80, dialled at 203.0.113.9')
    expect(config.captchaSolver).toMatchObject({ upstreamAddress: null })
    // Only an IP address, and only with the exit it dials.
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: HOSTNAME_EXIT, W2L_SOLVER_PROXY_ADDRESS: 'gw.proxy.test' }, { hosted: false })).toThrow(/W2L_SOLVER_PROXY_ADDRESS must be an IP address/)
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY_ADDRESS: '203.0.113.9' }, { hosted: false })).toThrow(/W2L_SOLVER_PROXY/)
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('none'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY_ADDRESS: '203.0.113.9' }, { hosted: false })).toThrow(/W2L_SOLVER_PROXY_ADDRESS/)
    // Exit "none": no exit is read, and one given anyway is a mistake.
    expect(loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('none'), CAPSOLVER_API_KEY: KEY }, { hosted: false }).captchaSolver).toMatchObject({ upstream: null })
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('none'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: EXIT }, { hosted: false })).toThrow(/solver exit is "none"/)
    // A key, and for "proxy" an exit, are needed; the errors never repeat a value.
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), W2L_SOLVER_PROXY: EXIT }, { hosted: false })).toThrow(/CAPSOLVER_API_KEY/)
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY }, { hosted: false })).toThrow(/W2L_SOLVER_PROXY/)
    try { loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: 'socks5://user-1:exit-secret@203.0.113.9:1080' }, { hosted: false }); expect.unreachable() } catch (error) { expect(String(error)).not.toMatch(/exit-secret|CAP-test-key/) }
    // Two ways to choose the run's exit are one too many; an exit without the capability is refused.
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('proxy'), CAPSOLVER_API_KEY: KEY, W2L_SOLVER_PROXY: EXIT, W2L_EGRESS_PROXIES: 'http://proxy-a.test:8080' }, { hosted: false })).toThrow()
    expect(() => loadEngineConfig({ W2L_SOLVER_PROXY: EXIT }, { hosted: false })).toThrow(/third_party_captcha_solver/)
    // A hosted server refuses the capability (hosted comes later, behind its own switch).
    expect(() => loadEngineConfig({ W2L_ACCESS_GRANT: solverGrant('none'), CAPSOLVER_API_KEY: KEY }, { hosted: true })).toThrow(/local only/)
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
