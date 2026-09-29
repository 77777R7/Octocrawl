import { describe, expect, it } from 'vitest'
import {
  MODE_IDENTITIES,
  RESEARCH_USER_AGENT,
  browserClientHints,
  browserUserAgent,
  formatIdentitySummary,
  identityBundleFrom,
  identityBundleIssues,
  localNetworkPolicy,
  modeIdentity,
  operatorContact,
  researchUserAgent,
  robotsAgent,
  withOperatorContact,
  type CrawlMode,
} from '../src/index.js'

/**
 * Identity invariants. The mode switch is honest by construction, and the
 * load-bearing rule is alignment: the client hints must quote the same Chrome
 * major as the UA, and the declared-bot mode must carry no browser hints at
 * all. A violation of either is the self-contradiction the live probe showed
 * gets a request blocked — which means the bug and the lie are the same thing.
 */

describe('modeIdentity', () => {
  it('covers exactly the four modes with no surprises', () => {
    expect(Object.keys(MODE_IDENTITIES).sort()).toEqual(['authed', 'proxy', 'research', 'standard'])
  })

  it('research is the declared bot: no client hints', () => {
    const id = modeIdentity('research')
    expect(id.clientHints).toEqual({})
    expect(id.userAgent).toContain('w2l-research')
    expect(id.lane).toBe('browser_local')
  })

  it('research user agent never claims Chromium', () => {
    expect(modeIdentity('research').userAgent).not.toMatch(/Chrome\/|Chromium/)
  })

  it('standard, authed, proxy share one consistent-browser identity', () => {
    const std = modeIdentity('standard')
    const authed = modeIdentity('authed')
    const proxy = modeIdentity('proxy')
    expect(authed.userAgent).toBe(std.userAgent)
    expect(proxy.userAgent).toBe(std.userAgent)
    expect(authed.clientHints).toEqual(std.clientHints)
    expect(proxy.clientHints).toEqual(std.clientHints)
  })

  it('browser modes differ only in lane', () => {
    expect(modeIdentity('standard').lane).toBe('browser_local')
    expect(modeIdentity('authed').lane).toBe('browser_local_authed')
    expect(modeIdentity('proxy').lane).toBe('browser_proxy')
  })

  it('client hints quote the same Chrome major as the UA', () => {
    for (const major of [128, 130, 200]) {
      const ua = browserUserAgent(major)
      const hints = browserClientHints(major)
      expect(ua).toContain(`Chrome/${major}.0.0.0`)
      expect(hints['sec-ch-ua']).toContain(`"${major}"`)
      expect(hints['sec-ch-ua-platform']).toContain('macOS')
    }
  })

  it('no mode maps two different modes to the same identity+lane pair by accident', () => {
    const seen = new Set<string>()
    for (const mode of Object.keys(MODE_IDENTITIES) as CrawlMode[]) {
      const id = modeIdentity(mode)
      seen.add(`${id.userAgent}|${id.lane}`)
    }
    // research shares browser_local with standard but has a distinct UA; the
    // three browser modes share a UA but distinct lanes. Net: all four pairs
    // are unique.
    expect(seen.size).toBe(4)
  })
})

describe('declared research contact (W2L_CONTACT)', () => {
  it('appends the operator contact to the research User-Agent, and to no other mode', () => {
    const contact = 'W2L maintainers https://github.com/77777R7/w2l'
    expect(researchUserAgent(null)).toBe(RESEARCH_USER_AGENT)
    expect(researchUserAgent(contact)).toBe(`${RESEARCH_USER_AGENT.slice(0, -1)}; contact: ${contact})`)
    const research = modeIdentity('research', undefined, contact)
    expect(research.userAgent).toBe(researchUserAgent(contact))
    expect(research.clientHints).toEqual({})
    expect(identityBundleIssues(identityBundleFrom(research))).toEqual([])
    expect(modeIdentity('standard', undefined, contact).userAgent).toBe(modeIdentity('standard').userAgent)
  })

  it("declares the contact to sec.gov and its subdomains in SEC's own format, and matches robots.txt as w2l-research there", () => {
    const contact = 'Jane Doe jane@example.org'
    for (const host of ['sec.gov', 'www.sec.gov', 'EFTS.SEC.GOV', 'www.sec.gov.']) {
      expect(researchUserAgent(contact, host), host).toBe(`W2L Research ${contact}`)
      expect(modeIdentity('research', undefined, contact, host).userAgent, host).toBe(`W2L Research ${contact}`)
    }
    for (const host of [null, 'example.org', 'notsec.gov', 'sec.gov.example.org']) {
      expect(researchUserAgent(contact, host), String(host)).toBe(researchUserAgent(contact))
    }
    // Without a contact SEC.gov gets the plain research identity; standard mode never declares one.
    expect(researchUserAgent(null, 'www.sec.gov')).toBe(RESEARCH_USER_AGENT)
    expect(modeIdentity('standard', undefined, contact, 'www.sec.gov').userAgent).toBe(modeIdentity('standard').userAgent)
    const sec = identityBundleFrom(modeIdentity('research', undefined, contact, 'www.sec.gov'))
    expect(identityBundleIssues(sec)).toEqual([])
    expect(identityBundleIssues({ ...sec, clientHints: browserClientHints(128) })).toContain('research UA must not send Chromium client hints')
    expect(formatIdentitySummary(sec)).toBe('w2l-research · en-US')
    expect(robotsAgent(sec.userAgent)).toContain('w2l-research')
    expect(robotsAgent(researchUserAgent(contact))).toBe(researchUserAgent(contact))
  })

  it('reads W2L_CONTACT as printable ASCII of at most 200 characters, and refuses anything else', () => {
    expect(operatorContact({})).toBeNull()
    expect(operatorContact({ W2L_CONTACT: '   ' })).toBeNull()
    expect(operatorContact({ W2L_CONTACT: ' Jane Doe jane@example.org ' })).toBe('Jane Doe jane@example.org')
    expect(operatorContact({ W2L_CONTACT: 'x'.repeat(200) })).toHaveLength(200)
    for (const refused of ['Jürgen jurgen@example.org', 'x'.repeat(201), 'Jane (lab) jane@example.org', 'back\\slash', 'two\nlines', 'tab\there', 'Chrome/140 fan']) {
      expect(() => operatorContact({ W2L_CONTACT: refused }), refused).toThrow(/^W2L_CONTACT /)
    }
    expect(() => researchUserAgent('Jane (lab)')).toThrow(/W2L_CONTACT/)
  })

  it('puts the contact on the operator policy only when one is set', () => {
    expect(withOperatorContact(localNetworkPolicy(), { W2L_CONTACT: 'jane@example.org' }).contact).toBe('jane@example.org')
    expect(withOperatorContact(localNetworkPolicy(), {})).toEqual(localNetworkPolicy())
  })
})
