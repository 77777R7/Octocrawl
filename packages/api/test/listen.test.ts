import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCAL_PRIVATE_ALLOWLIST } from '@w2l/contracts'
import { JOB_STREAMS_OFF_NOTICE, parseListen } from '../src/listen.js'

const ATTESTATION = { principal: 'operator@example.test', at: '2026-10-05T00:00:00Z', statement: 'I accept the provider terms and cost.' }

describe('parseListen: access grant (ADR 0005)', () => {
  it('has none by default, and then prints nothing about it', () => {
    const listen = parseListen([], {})
    expect(listen.accessGrant).toBeNull()
    expect(listen.notices.join('\n')).not.toContain('access grant')
  })

  it('reads a grant from --access-grant <file> or W2L_ACCESS_GRANT (a path or the JSON), and says what it allows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'w2l-grant-'))
    try {
      const grant = { tier: 'enhanced', capabilities: ['vendor_remote_browser', 'vendor_captcha_solving'], budget: { perRunUsd: 5 }, attestation: ATTESTATION }
      const file = join(dir, 'grant.json')
      writeFileSync(file, JSON.stringify(grant))
      for (const listen of [parseListen(['--access-grant', file], {}), parseListen([`--access-grant=${file}`], {}), parseListen([], { W2L_ACCESS_GRANT: file }), parseListen([], { W2L_ACCESS_GRANT: JSON.stringify(grant) })]) {
        expect(listen.accessGrant).toMatchObject({ tier: 'enhanced', capabilities: ['vendor_remote_browser', 'vendor_captcha_solving'], budget: { perRunUsd: 5, perRequestUsd: null } })
        expect(listen.notices).toContain('access grant (ADR 0005): tier enhanced; vendor_remote_browser, vendor_captcha_solving; run budget 5 USD; per-request budget none (not enforced yet); accepted by operator@example.test')
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('stops startup on a grant with any problem, listing every one', () => {
    const bad = JSON.stringify({ tier: 'enhanced', capabilities: ['camoufox', 'identity_rotation', 'vendor_stealth'], attestation: ATTESTATION })
    expect(() => parseListen([], { W2L_ACCESS_GRANT: bad })).toThrow(/capabilities\.camoufox: camoufox is deferred[\s\S]*capabilities\.identity_rotation: identity_rotation is never enabled[\s\S]*budget\.perRunUsd/)
    expect(() => parseListen([], { W2L_ACCESS_GRANT: '{not json' })).toThrow('access grant: not valid JSON')
    expect(() => parseListen(['--access-grant', '/no/such/grant.json'], {})).toThrow(/access grant: cannot read \/no\/such\/grant\.json/)
  })

  it('refuses a grant that names scope.hosts, which nothing enforces yet', () => {
    const grant = JSON.stringify({ tier: 'standard', capabilities: ['compatible_transport'], scope: { hosts: ['a.example'] } })
    expect(() => parseListen([], { W2L_ACCESS_GRANT: grant })).toThrow(/scope\.hosts is not enforced yet/)
  })

  it('runs the public browser on Patchright only when W2L_BROWSER_ENGINE asks and the grant names enhanced_browser, never hosted', () => {
    expect(parseListen([], {}).browserEngine).toBe('playwright')
    const grant = JSON.stringify({ tier: 'enhanced', capabilities: ['enhanced_browser'], attestation: ATTESTATION })
    const local = parseListen([], { W2L_ACCESS_GRANT: grant, W2L_BROWSER_ENGINE: 'patchright' })
    expect(local.browserEngine).toBe('patchright')
    expect(local.notices).toContain('browser engine: patchright on the public browser rung (ADR 0005 enhanced_browser); saved logins and managed sessions keep stock Playwright')
    expect(() => parseListen([], { W2L_BROWSER_ENGINE: 'patchright' })).toThrow(/needs an access grant that names enhanced_browser/)
    expect(() => parseListen(['--hosted', '--token', 'secret'], { W2L_ACCESS_GRANT: grant, W2L_BROWSER_ENGINE: 'patchright' })).toThrow(/refused on a hosted server/)
  })

  it("refuses tier my_browser on a hosted server, which has no person's browser", () => {
    const grant = JSON.stringify({ tier: 'my_browser' })
    expect(parseListen([], { W2L_ACCESS_GRANT: grant }).accessGrant).toMatchObject({ tier: 'my_browser' })
    expect(() => parseListen(['--hosted', '--token', 'secret'], { W2L_ACCESS_GRANT: grant })).toThrow(/tier my_browser/)
  })
})

describe('parseListen', () => {
  it('defaults to loopback local mode without a token', () => {
    const listen = parseListen([], {})
    expect(listen).toMatchObject({
      mode: 'local',
      host: '127.0.0.1',
      port: 8787,
      tokens: [],
      defaultMaxPages: null,
      allowRobotsOverride: true,
    })
    expect(listen.networkPolicy.privateAllowlist.length).toBeGreaterThan(0)
  })

  it('takes the engine\'s worker count from W2L_WORKER_COUNT, 1 to 64, default 4, local and hosted', () => {
    expect(parseListen([], {}).workerCount).toBe(4)
    expect(parseListen([], { W2L_WORKER_COUNT: '32' }).workerCount).toBe(32)
    expect(parseListen(['--hosted', '--token', 't'], { W2L_WORKER_COUNT: '8' }).workerCount).toBe(8)
    for (const value of ['0', '65', '3.5', 'many']) expect(() => parseListen([], { W2L_WORKER_COUNT: value })).toThrow('W2L_WORKER_COUNT must be an integer from 1 to 64')
  })

  it('serves the job stream routes unless W2L_JOB_STREAMS=off, which it says at startup', () => {
    expect(parseListen([], {}).jobStreams).toBe(true)
    expect(parseListen([], { W2L_JOB_STREAMS: 'on' }).jobStreams).toBe(true)
    for (const env of [{ W2L_JOB_STREAMS: 'off' }, { W2L_JOB_STREAMS: ' OFF ' }]) {
      const local = parseListen([], env)
      expect(local.jobStreams).toBe(false)
      expect(local.notices).toContain(JOB_STREAMS_OFF_NOTICE)
      expect(parseListen(['--hosted', '--token', 'secret'], env)).toMatchObject({ jobStreams: false, notices: expect.arrayContaining([JOB_STREAMS_OFF_NOTICE]) })
    }
    expect(parseListen([], {}).notices).not.toContain(JOB_STREAMS_OFF_NOTICE)
  })

  it('refuses hosted mode without a token', () => {
    expect(() => parseListen(['--hosted'], {})).toThrow(/W2L_API_TOKEN/)
  })

  it('refuses a local server reachable from other machines without a token', () => {
    // Open to other machines and to web pages that rebind a name to it, it would fetch the person's own localhost and network for them.
    for (const host of ['0.0.0.0', '::', '192.168.1.20', '127.0.0.2', 'localhost.']) {
      expect(() => parseListen(['--host', host], {}), host).toThrow(/needs a token.*--token.*127\.0\.0\.1/)
      expect(() => parseListen([], { W2L_API_HOST: host }), host).toThrow(/needs a token/)
      expect(parseListen(['--host', host, '--token', 'secret'], {})).toMatchObject({ mode: 'local', host, tokens: ['secret'] })
    }
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) expect(parseListen(['--host', host], {})).toMatchObject({ mode: 'local', host, tokens: [] })
    expect(parseListen([], {})).toMatchObject({ host: '127.0.0.1', tokens: [] })
  })

  it('hosted mode binds 0.0.0.0, requires a token, and denies private ranges', () => {
    const listen = parseListen(['--hosted', '--token', 'secret'], {})
    expect(listen.mode).toBe('hosted')
    expect(listen.host).toBe('0.0.0.0')
    expect(listen.tokens).toEqual(['secret'])
    expect(listen.defaultMaxPages).toBe(100)
    // A recorded robots override is a local user's decision; a hosted server takes none.
    expect(listen.allowRobotsOverride).toBe(false)
    expect(listen.networkPolicy.privateAllowlist).toEqual([])
  })

  it('accepts several tokens: repeated --token, or W2L_API_TOKEN with comma-separated W2L_API_TOKENS', () => {
    expect(parseListen(['--hosted', '--token', 'alpha', '--token=beta'], {}).tokens).toEqual(['alpha', 'beta'])
    expect(parseListen(['--hosted'], { W2L_API_TOKEN: 'alpha', W2L_API_TOKENS: ' beta, gamma ,,alpha' }).tokens).toEqual(['alpha', 'beta', 'gamma'])
    // Tokens on the command line replace the environment's, as --token replaced W2L_API_TOKEN before.
    expect(parseListen(['--token', 'cli'], { W2L_API_TOKEN: 'env', W2L_API_TOKENS: 'more' }).tokens).toEqual(['cli'])
    expect(() => parseListen(['--hosted'], { W2L_API_TOKENS: ' , ' })).toThrow(/W2L_API_TOKENS/)
  })

  it('refuses a --token without a value, followed by another flag or last, and never repeats a token', () => {
    const cases = [['--token', '--hosted'], ['--hosted', '--token', 'secret-alpha', '--token'], ['--token', '--port', '9000'], ['--token='], ['--token', ' ']]
    for (const argv of cases) {
      let message = ''
      try { parseListen(argv, { W2L_API_TOKEN: 'secret-env' }) } catch (error) { message = (error as Error).message }
      expect(message, argv.join(' ')).toBe('--token needs a value: use --token <token> or --token=<token>, or set W2L_API_TOKEN')
      expect(message).not.toMatch(/secret|--hosted|--port/)
    }
    expect(parseListen(['--token', '-starts-with-dash'], {}).tokens).toEqual(['-starts-with-dash'])
  })

  it('local mode routes through the environment proxy unless W2L_PROXY=off', () => {
    const env = { HTTPS_PROXY: 'http://127.0.0.1:7890', HTTP_PROXY: 'http://127.0.0.1:7890', NO_PROXY: 'localhost,127.0.0.1,::1,.local' }
    const local = parseListen([], env)
    expect(local.networkPolicy.egressProxy?.https?.endpoint).toBe('127.0.0.1:7890')
    expect(local.networkPolicy.egressProxy?.noProxy).toEqual(['localhost', '127.0.0.1', '::1', '.local'])
    expect(local.notices).toEqual([expect.stringContaining('environment proxy 127.0.0.1:7890')])
    expect(parseListen([], { ...env, W2L_PROXY: 'off' }).networkPolicy.egressProxy).toBeUndefined()
    expect(() => parseListen([], { HTTPS_PROXY: 'socks5://127.0.0.1:1080' })).toThrow(/W2L_PROXY=off/)
  })

  it('declares the operator contact from W2L_CONTACT in both modes, and refuses one it cannot declare', () => {
    expect(parseListen([], { W2L_CONTACT: 'Jane Doe jane@example.org' }).networkPolicy.contact).toBe('Jane Doe jane@example.org')
    expect(parseListen(['--hosted', '--token', 'secret'], { W2L_CONTACT: 'https://example.org/contact' }).networkPolicy.contact).toBe('https://example.org/contact')
    expect(parseListen([], {}).networkPolicy.contact).toBeUndefined()
    expect(() => parseListen([], { W2L_CONTACT: 'Jürgen' })).toThrow(/W2L_CONTACT/)
  })

  it('takes a per-caller rate limit from W2L_RATE_LIMIT_PER_MINUTE or --rate-limit-per-minute, and refuses a value outside 1 to 100000', () => {
    expect(parseListen([], {})).not.toHaveProperty('rateLimit')
    expect(parseListen([], { W2L_RATE_LIMIT_PER_MINUTE: '' })).not.toHaveProperty('rateLimit')
    expect(parseListen([], { W2L_RATE_LIMIT_PER_MINUTE: ' 60 ' }).rateLimit).toEqual({ perMinute: 60 })
    expect(parseListen(['--rate-limit-per-minute', '2'], { W2L_RATE_LIMIT_PER_MINUTE: '60' }).rateLimit).toEqual({ perMinute: 2 })
    expect(parseListen(['--hosted', '--token', 'secret', '--rate-limit-per-minute=100000'], {}).rateLimit).toEqual({ perMinute: 100000 })
    for (const value of ['0', '100001', '1.5', '-1', 'ten', '1e3']) {
      expect(() => parseListen([], { W2L_RATE_LIMIT_PER_MINUTE: value }), value).toThrow('W2L_RATE_LIMIT_PER_MINUTE must be an integer between 1 and 100000')
    }
    expect(() => parseListen(['--rate-limit-per-minute', '0'], {})).toThrow('--rate-limit-per-minute must be an integer between 1 and 100000')
  })

  it('hosted mode never uses the proxy variables and says once that it ignored them', () => {
    const hosted = parseListen(['--hosted', '--token', 'secret'], { HTTPS_PROXY: 'socks5://127.0.0.1:1080', NO_PROXY: 'localhost' })
    expect(hosted.networkPolicy.egressProxy).toBeUndefined()
    expect(hosted.notices).toEqual(['hosted mode ignores HTTPS_PROXY, NO_PROXY: outbound connections stay direct to validated addresses.'])
    expect(parseListen(['--hosted', '--token', 'secret'], {}).notices).toEqual([])
  })

  it('delivers job webhooks under its own policy: local mode reaches local-network https and loopback http, hosted mode public https only', () => {
    const local = parseListen([], { HTTPS_PROXY: 'http://127.0.0.1:7890' }).delivery
    expect(local).toMatchObject({ allowHttpLoopback: true })
    expect(local.networkPolicy.privateAllowlist).toEqual([...LOCAL_PRIVATE_ALLOWLIST])
    // The shell's proxy carries the crawler's requests, never a delivery; W2L_DELIVERY_PROXY_URL does.
    expect(local.networkPolicy.egressProxy).toBeUndefined()
    expect(local).not.toHaveProperty('proxyUrl')
    expect(local).not.toHaveProperty('caFile')
    expect(local.notice).toBe('webhook deliveries: https receivers on public and local-network addresses, plain http on loopback; TLS verified; direct, the environment proxy not used')
    const hosted = parseListen(['--hosted', '--token', 'secret'], { W2L_DELIVERY_PRIVATE_ALLOWLIST: '10.1.0.0/16, 10.2.0.0/16', W2L_DELIVERY_PROXY_URL: 'http://egress.internal:3128', W2L_DELIVERY_CA_FILE: '/etc/w2l/ca.pem' }).delivery
    expect(hosted).toMatchObject({ allowHttpLoopback: false, proxyUrl: 'http://egress.internal:3128', caFile: '/etc/w2l/ca.pem' })
    expect(hosted.networkPolicy.privateAllowlist).toEqual(['10.1.0.0/16', '10.2.0.0/16'])
    expect(hosted.notice).toBe('webhook deliveries: https receivers on public addresses and 10.1.0.0/16, 10.2.0.0/16; TLS verified; through http://egress.internal:3128')
    expect(parseListen(['--hosted', '--token', 'secret'], {}).delivery.networkPolicy.privateAllowlist).toEqual([])
  })
})
