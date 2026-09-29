import { describe, expect, it } from 'vitest'
import { parseListen } from '../src/listen.js'

describe('parseListen', () => {
  it('defaults to loopback local mode without a token', () => {
    const listen = parseListen([], {})
    expect(listen).toMatchObject({
      mode: 'local',
      host: '127.0.0.1',
      port: 8787,
      tokens: [],
      defaultMaxPages: null,
    })
    expect(listen.networkPolicy.privateAllowlist.length).toBeGreaterThan(0)
  })

  it('refuses hosted mode without a token', () => {
    expect(() => parseListen(['--hosted'], {})).toThrow(/W2L_API_TOKEN/)
  })

  it('hosted mode binds 0.0.0.0, requires a token, and denies private ranges', () => {
    const listen = parseListen(['--hosted', '--token', 'secret'], {})
    expect(listen.mode).toBe('hosted')
    expect(listen.host).toBe('0.0.0.0')
    expect(listen.tokens).toEqual(['secret'])
    expect(listen.defaultMaxPages).toBe(100)
    expect(listen.networkPolicy.privateAllowlist).toEqual([])
  })

  it('accepts several tokens: repeated --token, or W2L_API_TOKEN with comma-separated W2L_API_TOKENS', () => {
    expect(parseListen(['--hosted', '--token', 'alpha', '--token=beta'], {}).tokens).toEqual(['alpha', 'beta'])
    expect(parseListen(['--hosted'], { W2L_API_TOKEN: 'alpha', W2L_API_TOKENS: ' beta, gamma ,,alpha' }).tokens).toEqual(['alpha', 'beta', 'gamma'])
    // Tokens on the command line replace the environment's, as --token replaced W2L_API_TOKEN before.
    expect(parseListen(['--token', 'cli'], { W2L_API_TOKEN: 'env', W2L_API_TOKENS: 'more' }).tokens).toEqual(['cli'])
    expect(() => parseListen(['--hosted'], { W2L_API_TOKENS: ' , ' })).toThrow(/W2L_API_TOKENS/)
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

  it('hosted mode never uses the proxy variables and says once that it ignored them', () => {
    const hosted = parseListen(['--hosted', '--token', 'secret'], { HTTPS_PROXY: 'socks5://127.0.0.1:1080', NO_PROXY: 'localhost' })
    expect(hosted.networkPolicy.egressProxy).toBeUndefined()
    expect(hosted.notices).toEqual(['hosted mode ignores HTTPS_PROXY, NO_PROXY: outbound connections stay direct to validated addresses.'])
    expect(parseListen(['--hosted', '--token', 'secret'], {}).notices).toEqual([])
  })
})
