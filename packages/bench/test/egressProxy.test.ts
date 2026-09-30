import { describe, expect, it } from 'vitest'
import { describeProxy, operatorProxyFromEnv, parseOperatorProxy, playwrightProxyFor, proxyBypasses } from '../src/egressProxy.js'

describe('operatorProxyFromEnv', () => {
  it('returns null when nothing is configured', () => {
    expect(operatorProxyFromEnv({})).toBeNull()
    expect(operatorProxyFromEnv({ HTTPS_PROXY: '   ' })).toBeNull()
  })

  it('prefers W2L_PROXY_URL over the conventional variables', () => {
    const proxy = operatorProxyFromEnv({ W2L_PROXY_URL: 'http://own:3128', HTTPS_PROXY: 'http://other:8080', HTTP_PROXY: 'http://third:8080' })
    expect(proxy).toMatchObject({ server: 'http://own:3128', source: 'W2L_PROXY_URL' })
  })

  it('falls back to HTTPS_PROXY, then HTTP_PROXY, in either case', () => {
    expect(operatorProxyFromEnv({ https_proxy: 'http://lower:1', HTTP_PROXY: 'http://http:2' })).toMatchObject({ server: 'http://lower:1', source: 'HTTPS_PROXY' })
    expect(operatorProxyFromEnv({ http_proxy: 'http://only-http:3' })).toMatchObject({ server: 'http://only-http:3', source: 'HTTP_PROXY' })
  })

  it('W2L_PROXY_URL=off goes direct even when the shell sets HTTPS_PROXY', () => {
    expect(operatorProxyFromEnv({ W2L_PROXY_URL: 'off', HTTPS_PROXY: 'http://other:8080' })).toBeNull()
  })

  it('reads NO_PROXY into the bypass list', () => {
    const proxy = operatorProxyFromEnv({ HTTPS_PROXY: 'http://p:1', NO_PROXY: 'localhost, 127.0.0.1,.internal.example, 10.0.0.0/8' })
    expect(proxy?.bypass).toEqual(['localhost', '127.0.0.1', '.internal.example', '10.0.0.0/8'])
  })
})

describe('parseOperatorProxy', () => {
  it('keeps credentials off the recorded server string', () => {
    const proxy = parseOperatorProxy('http://user%40corp:p%3Ass@proxy.example:3128', 'W2L_PROXY_URL')
    expect(proxy.server).toBe('http://proxy.example:3128')
    expect(proxy.username).toBe('user@corp')
    expect(proxy.password).toBe('p:ss')
    expect(describeProxy(proxy)).toEqual({ server: 'http://proxy.example:3128', source: 'W2L_PROXY_URL' })
    expect(JSON.stringify(describeProxy(proxy))).not.toContain('p:ss')
  })

  it('fills the default port from the scheme', () => {
    expect(parseOperatorProxy('http://proxy.example', 'HTTP_PROXY').server).toBe('http://proxy.example:80')
    expect(parseOperatorProxy('https://proxy.example', 'HTTPS_PROXY').server).toBe('https://proxy.example:443')
  })

  it('rejects non-http proxies and malformed values by name', () => {
    expect(() => parseOperatorProxy('socks5://proxy.example:1080', 'HTTPS_PROXY')).toThrow(/HTTPS_PROXY must be an http or https proxy URL; socks5/)
    expect(() => parseOperatorProxy('not a url', 'W2L_PROXY_URL')).toThrow(/W2L_PROXY_URL is not a valid URL/)
  })

  it('maps to the Playwright launch option with the bypass list intact', () => {
    const proxy = parseOperatorProxy('http://u:p@proxy.example:3128', 'W2L_PROXY_URL', 'localhost,.corp.example')
    expect(playwrightProxyFor(proxy)).toEqual({ server: 'http://proxy.example:3128', bypass: 'localhost,.corp.example', username: 'u', password: 'p' })
    expect(playwrightProxyFor(parseOperatorProxy('http://proxy.example:3128', 'W2L_PROXY_URL'))).toEqual({ server: 'http://proxy.example:3128' })
  })
})

describe('proxyBypasses', () => {
  const proxy = (noProxy: string) => parseOperatorProxy('http://proxy.example:3128', 'HTTPS_PROXY', noProxy)

  it('matches exact hosts, case-insensitively', () => {
    expect(proxyBypasses(proxy('Example.com'), 'https://example.com/a')).toBe(true)
    expect(proxyBypasses(proxy('example.com'), 'https://www.example.com/a')).toBe(false)
  })

  it('matches domain suffixes written as .suffix or *.suffix, including the bare domain', () => {
    expect(proxyBypasses(proxy('.example.com'), 'https://api.example.com/')).toBe(true)
    expect(proxyBypasses(proxy('.example.com'), 'https://example.com/')).toBe(true)
    expect(proxyBypasses(proxy('*.example.com'), 'https://deep.api.example.com/')).toBe(true)
    expect(proxyBypasses(proxy('.example.com'), 'https://notexample.com/')).toBe(false)
  })

  it('honours a port on the entry', () => {
    expect(proxyBypasses(proxy('example.com:8443'), 'https://example.com:8443/')).toBe(true)
    expect(proxyBypasses(proxy('example.com:8443'), 'https://example.com/')).toBe(false)
    expect(proxyBypasses(proxy('example.com:443'), 'https://example.com/')).toBe(true)
  })

  it('matches IPv4 CIDR ranges and bare IPv6 literals', () => {
    expect(proxyBypasses(proxy('10.0.0.0/8'), 'http://10.20.30.40/')).toBe(true)
    expect(proxyBypasses(proxy('10.0.0.0/8'), 'http://11.0.0.1/')).toBe(false)
    expect(proxyBypasses(proxy('127.0.0.0/8'), 'http://127.0.0.1:8791/')).toBe(true)
    expect(proxyBypasses(proxy('::1'), 'http://[::1]:8080/')).toBe(true)
    expect(proxyBypasses(proxy('[::1]:8080'), 'http://[::1]:8080/')).toBe(true)
    expect(proxyBypasses(proxy('[::1]:8080'), 'http://[::1]:9090/')).toBe(false)
  })

  it('treats * as bypass everything and an empty list as bypass nothing', () => {
    expect(proxyBypasses(proxy('*'), 'https://anything.example/')).toBe(true)
    expect(proxyBypasses(proxy(''), 'https://anything.example/')).toBe(false)
    expect(proxyBypasses(proxy(''), 'http://127.0.0.1/')).toBe(false)
  })
})
