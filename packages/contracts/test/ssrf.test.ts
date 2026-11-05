import { describe, expect, it } from 'vitest'
import {
  classifyIp,
  evaluateAddress,
  evaluateHostname,
  evaluateResolved,
  evaluateUrl,
  hostedNetworkPolicy,
  isLoopbackAddress,
  localNetworkPolicy,
} from '../src/index.js'

describe('classifyIp', () => {
  it('names loopback, RFC1918, link-local, and metadata', () => {
    expect(classifyIp('127.0.0.1')).toBe('loopback_address')
    expect(classifyIp('10.0.0.8')).toBe('private_address')
    expect(classifyIp('172.16.1.1')).toBe('private_address')
    expect(classifyIp('192.168.1.1')).toBe('private_address')
    expect(classifyIp('169.254.1.1')).toBe('link_local_address')
    expect(classifyIp('169.254.169.254')).toBe('cloud_metadata_address')
    expect(classifyIp('0.0.0.0')).toBe('unspecified_address')
    expect(classifyIp('8.8.8.8')).toBeNull()
  })

  it('classifies IPv6 loopback, ULA, and IPv4-mapped loopback', () => {
    expect(classifyIp('::1')).toBe('loopback_address')
    expect(classifyIp('fc00::1')).toBe('private_address')
    expect(classifyIp('::ffff:127.0.0.1')).toBe('loopback_address')
    expect(classifyIp('2001:4860:4860::8888')).toBeNull()
  })
})

describe('addresses no public site has', () => {
  it('refuses the reserved IPv4 ranges', () => {
    for (const address of ['0.1.2.3', '192.0.0.8', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.7', '240.0.0.1', '250.1.2.3', '255.255.255.255']) {
      expect(classifyIp(address), address).toBe('private_address')
    }
  })

  it('leaves the public addresses beside those ranges alone', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '192.0.1.1', '192.0.3.1', '192.88.98.1', '198.17.255.255', '198.20.0.0', '198.51.99.1', '203.0.112.1', '223.255.255.255']) {
      expect(classifyIp(address), address).toBeNull()
    }
    for (const address of ['2606:4700:4700::1111', '2a00:1450:4001::1', '2001:4860:4860::8888', '2400:cb00::1']) {
      expect(classifyIp(address), address).toBeNull()
    }
  })

  it('reads the IPv4 address inside an IPv6 form, as a translator on the path would', () => {
    const inside: Array<[string, string]> = [
      ['::127.0.0.1', 'loopback_address'], ['::ffff:0:127.0.0.1', 'loopback_address'], ['64:ff9b::127.0.0.1', 'loopback_address'], ['64:ff9b::7f00:1', 'loopback_address'],
      ['2002:7f00:1::', 'loopback_address'], ['2002:a00:1::', 'private_address'], ['64:ff9b::10.0.0.1', 'private_address'], ['::10.0.0.1', 'private_address'],
      ['64:ff9b::169.254.169.254', 'cloud_metadata_address'], ['2002:a9fe:a9fe::', 'cloud_metadata_address'], ['::169.254.169.254', 'cloud_metadata_address'],
    ]
    for (const [address, violation] of inside) expect(classifyIp(address), address).toBe(violation)
    // A public address stays public through a translator.
    expect(classifyIp('64:ff9b::8.8.8.8')).toBeNull()
    expect(classifyIp('2002:808:808::')).toBeNull()
  })

  it('refuses IPv6 outside global unicast, and its special blocks', () => {
    for (const address of ['fec0::1', 'feff::1', '100::1', '64:ff9b:1::1', '2001::1', '2001:db8::1', '2001:2::1', '2001:20::1', '3fff::1', '4000::1', 'e000::1', '1000::1']) {
      expect(classifyIp(address), address).toBe('private_address')
    }
  })

  it('names AWS\'s IPv6 metadata address, which no allowlist lets through', () => {
    expect(classifyIp('fd00:ec2::254')).toBe('cloud_metadata_address')
    expect(evaluateAddress('imds.test', 'fd00:ec2::254', localNetworkPolicy())).toMatchObject({ allowed: false, violation: 'cloud_metadata_address' })
  })

  it('calls only this machine\'s own addresses loopback: a form that carries 127.0.0.1 can leave it', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '::1', '[::1]', '::ffff:127.0.0.1']) expect(isLoopbackAddress(address), address).toBe(true)
    for (const address of ['2002:7f00:1::', '64:ff9b::7f00:1', '::ffff:0:7f00:1', '::7f00:1', '::127.0.0.1', '10.0.0.1', '::2', 'example.com']) expect(isLoopbackAddress(address), address).toBe(false)
  })

  it('refuses them on a hosted server, and keeps a local one working behind a proxy client that answers DNS from 198.18.0.0/15', () => {
    expect(evaluateAddress('fake.test', '198.18.0.1', hostedNetworkPolicy()).allowed).toBe(false)
    expect(evaluateAddress('fake.test', '198.18.0.1', localNetworkPolicy()).allowed).toBe(true)
    expect(evaluateAddress('nat.test', '64:ff9b::a9fe:a9fe', localNetworkPolicy())).toMatchObject({ allowed: false, violation: 'cloud_metadata_address' })
  })
})

describe('local vs hosted network policy', () => {
  it('lets the operator allowlist loopback for fixtures', () => {
    const local = evaluateHostname('127.0.0.1', localNetworkPolicy())
    expect(local?.allowed).toBe(true)
    const hosted = evaluateHostname('127.0.0.1', hostedNetworkPolicy())
    expect(hosted?.allowed).toBe(false)
    expect(hosted?.violation).toBe('loopback_address')
  })

  it('never allowlists cloud metadata, even in local mode', () => {
    expect(evaluateHostname('169.254.169.254', localNetworkPolicy())?.allowed).toBe(false)
    expect(evaluateHostname('metadata.google.internal', hostedNetworkPolicy())?.violation).toBe(
      'cloud_metadata_address',
    )
  })

  it('rejects a public hostname that resolves to a private address', () => {
    const decision = evaluateResolved('example.com', ['1.1.1.1', '10.0.0.1'], hostedNetworkPolicy())
    expect(decision.allowed).toBe(false)
    expect(decision.violation).toBe('private_address')
  })

  it('accepts a hostname whose every resolved address is public', () => {
    const decision = evaluateResolved('example.com', ['1.1.1.1', '8.8.8.8'], hostedNetworkPolicy())
    expect(decision.allowed).toBe(true)
    expect(decision.pinnedAddress).toBe('1.1.1.1')
  })

  it('denies non-http(s) URLs before DNS', () => {
    const decision = evaluateUrl('file:///etc/passwd', hostedNetworkPolicy())
    expect('allowed' in decision && decision.allowed).toBe(false)
  })

  it('returns a hostname for public DNS names so the caller can resolve', () => {
    const decision = evaluateUrl('https://example.com/x', hostedNetworkPolicy())
    expect(decision).toEqual({ hostname: 'example.com' })
  })
})

describe('evaluateAddress allowlist', () => {
  it('ignores a request-origin allowlist', () => {
    const decision = evaluateAddress('127.0.0.1', '127.0.0.1', {
      ...localNetworkPolicy(),
      origin: 'request',
      privateAllowlist: ['127.0.0.1/32'],
    })
    expect(decision.allowed).toBe(false)
    expect(decision.violation).toBe('loopback_address')
  })
})
