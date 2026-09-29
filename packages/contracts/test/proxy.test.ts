import { describe, expect, it } from 'vitest'
import {
  describeEgressProxy,
  environmentProxy,
  hostedNetworkPolicy,
  hostedProxyNotice,
  localNetworkPolicy,
  parseNoProxyEntry,
  ProxyConfigError,
  proxyFor,
  withEnvironmentProxy,
} from '../src/index.js'

const PROXY = 'http://127.0.0.1:7890'

function routeOf(url: string, env: Record<string, string>): string | null {
  return proxyFor(url, withEnvironmentProxy(localNetworkPolicy(), env))?.endpoint ?? null
}

describe('environmentProxy', () => {
  it('reads one proxy per scheme, lower-case names first, and never keeps credentials in the URL', () => {
    expect(environmentProxy({})).toBeNull()
    expect(environmentProxy({ NO_PROXY: 'example.com' })).toBeNull()
    const proxy = environmentProxy({ HTTPS_PROXY: 'http://user:p%40ss@proxy.example:8080', http_proxy: 'http://user:p%40ss@proxy.example:8080', no_proxy: 'Example.com, .local' })
    expect(proxy).toEqual({
      source: 'environment',
      https: { url: 'http://proxy.example:8080', endpoint: 'proxy.example:8080', username: 'user', password: 'p@ss' },
      http: { url: 'http://proxy.example:8080', endpoint: 'proxy.example:8080', username: 'user', password: 'p@ss' },
      noProxy: ['example.com', '.local'],
    })
    expect(environmentProxy({ https_proxy: '', HTTPS_PROXY: PROXY })).toBeNull()
    expect(environmentProxy({ HTTPS_PROXY: '127.0.0.1:7890' })?.https?.url).toBe(PROXY)
    expect(environmentProxy({ HTTPS_PROXY: 'https://[::1]' })?.https?.endpoint).toBe('[::1]:443')
  })

  it('is switched off by W2L_PROXY=off and rejects what it cannot honour without echoing the value', () => {
    expect(environmentProxy({ HTTPS_PROXY: 'socks5://u:secret@127.0.0.1:1080', W2L_PROXY: 'off' })).toBeNull()
    expect(() => environmentProxy({ HTTPS_PROXY: 'socks5://u:secret@127.0.0.1:1080' })).toThrow(ProxyConfigError)
    expect(() => environmentProxy({ HTTPS_PROXY: 'socks5://u:secret@127.0.0.1:1080' })).not.toThrow(/secret/)
    expect(() => environmentProxy({ HTTPS_PROXY: PROXY, HTTP_PROXY: 'http://127.0.0.1:3128' })).toThrow(/same proxy/)
    expect(() => environmentProxy({ HTTPS_PROXY: PROXY, W2L_PROXY: 'on' })).toThrow(/W2L_PROXY/)
  })
})

describe('proxyFor', () => {
  it('chooses the proxy by scheme', () => {
    expect(routeOf('https://en.wikipedia.org/wiki/X', { HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY })).toBe('127.0.0.1:7890')
    expect(routeOf('http://example.com/', { HTTPS_PROXY: PROXY })).toBeNull()
    expect(routeOf('https://example.com/', { HTTP_PROXY: PROXY })).toBeNull()
    expect(routeOf('http://example.com/', { HTTP_PROXY: PROXY })).toBe('127.0.0.1:7890')
  })

  it('sends NO_PROXY hosts, their subdomains, matching ports and IP ranges direct', () => {
    const env = { HTTPS_PROXY: PROXY, HTTP_PROXY: PROXY, NO_PROXY: 'localhost,127.0.0.1,::1,.local,example.com,*.corp.test,api.test:8443,10.0.0.0/8,[fd00::1]:8080' }
    for (const url of ['https://example.com/', 'https://a.b.example.com/', 'http://printer.local/', 'http://local/', 'https://corp.test/', 'https://x.corp.test/', 'https://api.test:8443/', 'http://10.1.2.3/', 'http://[fd00::1]:8080/']) {
      expect(routeOf(url, env)).toBeNull()
    }
    for (const url of ['https://notexample.com/', 'https://example.com.evil.test/', 'https://api.test/', 'http://11.1.2.3/', 'http://[fd00::1]/']) {
      expect(routeOf(url, env)).toBe('127.0.0.1:7890')
    }
    expect(routeOf('https://anything.example/', { HTTPS_PROXY: PROXY, NO_PROXY: 'a.test, *' })).toBeNull()
  })

  it('keeps loopback direct whatever NO_PROXY says', () => {
    for (const url of ['http://localhost:8787/', 'http://api.localhost/', 'http://127.0.0.1:8787/', 'http://127.9.9.9/', 'http://[::1]:8787/', 'http://[::ffff:127.0.0.1]/']) {
      expect(routeOf(url, { HTTP_PROXY: PROXY })).toBeNull()
    }
  })

  it('never routes a hosted or request-origin policy through a proxy', () => {
    const egressProxy = environmentProxy({ HTTPS_PROXY: PROXY })!
    expect(proxyFor('https://example.com/', hostedNetworkPolicy())).toBeNull()
    expect(proxyFor('https://example.com/', { origin: 'request', egressProxy })).toBeNull()
    expect(proxyFor('https://example.com/', { origin: 'operator', egressProxy })?.endpoint).toBe('127.0.0.1:7890')
  })
})

describe('NO_PROXY entries and startup notices', () => {
  it('parses host, suffix, port, IP and CIDR entries and ignores inner wildcards', () => {
    expect(parseNoProxyEntry('*.Example.com:8080')).toEqual({ kind: 'host', host: 'example.com', port: 8080 })
    expect(parseNoProxyEntry('::1')).toMatchObject({ kind: 'ip', address: '::1', port: null })
    expect(parseNoProxyEntry('[::1]:8080')).toMatchObject({ kind: 'ip', address: '::1', port: 8080 })
    expect(parseNoProxyEntry('127.0.0.1:8080')).toMatchObject({ kind: 'ip', address: '127.0.0.1', port: 8080 })
    expect(parseNoProxyEntry('192.168.0.0/16')).toEqual({ kind: 'cidr', cidr: '192.168.0.0/16' })
    expect(parseNoProxyEntry('a.*.example.com')).toBeNull()
  })

  it('says at startup what local mode proxies and what hosted mode ignores', () => {
    expect(describeEgressProxy(environmentProxy({ HTTPS_PROXY: PROXY, NO_PROXY: '.local' })!))
      .toBe('outbound https: requests use the environment proxy 127.0.0.1:7890; http: requests, loopback and NO_PROXY (.local) go direct. W2L_PROXY=off ignores the proxy variables.')
    expect(hostedProxyNotice({})).toBeNull()
    expect(hostedProxyNotice({ HTTPS_PROXY: PROXY, NO_PROXY: 'localhost' })).toMatch(/^hosted mode ignores HTTPS_PROXY, NO_PROXY/)
  })
})
