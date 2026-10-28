import { describe, expect, it } from 'vitest'
import {
  evaluateGovernance,
  hostMatchesAllowlist,
  MODE_CHANNELS,
  PUBLIC_POLICY,
} from '../src/governance.js'

describe('hostMatchesAllowlist', () => {
  it('matches exact hosts', () => {
    expect(hostMatchesAllowlist('example.com', 'example.com')).toBe(true)
    expect(hostMatchesAllowlist('EXAMPLE.com', 'example.com')).toBe(true)
  })

  it('matches *.domain and the apex itself, never substrings', () => {
    expect(hostMatchesAllowlist('shop.example.com', '*.example.com')).toBe(true)
    expect(hostMatchesAllowlist('example.com', '*.example.com')).toBe(true)
    // A substring match here would authorize a host the operator never named.
    expect(hostMatchesAllowlist('example.com.evil.net', 'example.com')).toBe(false)
    expect(hostMatchesAllowlist('notexample.com', 'example.com')).toBe(false)
  })
})

describe('evaluateGovernance', () => {
  it('default mode permits only public channels', () => {
    const d = evaluateGovernance('https://example.com/p', PUBLIC_POLICY)
    expect(d.allowed).toBe(true)
    // http_compat is the http lane over another transport, with the same public identity.
    expect(d.permittedChannels).toEqual(['http', 'http_compat', 'browser_local'])
  })

  it('mode controls which channels may run', () => {
    expect(evaluateGovernance('https://x.test/p', { mode: 'research' }).permittedChannels).toEqual([
      'http',
      'browser_local',
      'provider',
    ])
    expect(evaluateGovernance('https://x.test/p', { mode: 'authed' }).permittedChannels).toEqual([
      'http',
      'browser_local',
      'provider',
      'authed_session',
      'handoff',
    ])
  })

  it('refuses a host outside the allowlist before any channel runs', () => {
    const d = evaluateGovernance('https://other.test/p', {
      mode: 'authed',
      allowlistedDomains: ['example.com'],
    })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('not on the domain allowlist')
    expect(d.permittedChannels).toEqual([])
  })

  it('admits wildcarded hosts on the allowlist', () => {
    const d = evaluateGovernance('https://shop.example.com/p', {
      mode: 'authed',
      allowlistedDomains: ['*.example.com'],
    })
    expect(d.allowed).toBe(true)
  })

  it('rejects malformed urls', () => {
    expect(evaluateGovernance('not a url', PUBLIC_POLICY).allowed).toBe(false)
  })
})

describe('enhanced access', () => {
  it('permits the provider lane and, where the browser lane is, the installed_chrome and hosted_chrome rungs (ADR 0005); never without enhanced', () => {
    expect(evaluateGovernance('https://example.com/', { ...PUBLIC_POLICY, enhanced: true }).permittedChannels).toEqual([...MODE_CHANNELS.standard, 'provider', 'installed_chrome', 'hosted_chrome'])
    expect(evaluateGovernance('https://example.com/', PUBLIC_POLICY).permittedChannels).not.toContain('installed_chrome')
    expect(evaluateGovernance('https://example.com/', PUBLIC_POLICY).permittedChannels).not.toContain('hosted_chrome')
    expect(evaluateGovernance('https://example.com/', { ...PUBLIC_POLICY, mode: 'research', enhanced: true }).permittedChannels).toEqual([...MODE_CHANNELS.research, 'installed_chrome', 'hosted_chrome'])
  })
})

describe('MODE_CHANNELS', () => {
  it('never permits a channel above what the mode authorizes', () => {
    expect(MODE_CHANNELS.standard).not.toContain('provider')
    expect(MODE_CHANNELS.standard).not.toContain('authed_session')
    expect(MODE_CHANNELS.research).not.toContain('authed_session')
    expect(MODE_CHANNELS.authed).toContain('handoff')
  })
})
