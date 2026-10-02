import { describe, expect, it } from 'vitest'
import {
  BROWSER_FINGERPRINT,
  MOBILE_BROWSER_FINGERPRINT,
  PREVIEW_PRODUCT_TOKEN,
  assertIdentityBundle,
  browserClientHints,
  browserUserAgent,
  browserUserAgentMetadata,
  checkIdentityHonesty,
  serializeBrands,
  formatIdentitySummary,
  headersFromIdentity,
  identityBundleFrom,
  identityBundleIssues,
  identityForRoute,
  modeIdentity,
  previewIdentity,
  vendorIdentityIssues,
} from '../src/index.js'

describe('identityBundleIssues', () => {
  it('accepts the four honest mode identities', () => {
    for (const mode of ['research', 'standard', 'authed', 'proxy'] as const) {
      const issues = identityBundleIssues(identityBundleFrom(modeIdentity(mode)))
      expect(issues, mode).toEqual([])
    }
  })

  it('rejects HeadlessChrome in the UA', () => {
    const bundle = identityBundleFrom(modeIdentity('standard'))
    const issues = identityBundleIssues({
      ...bundle,
      userAgent: bundle.userAgent.replace('Chrome/', 'HeadlessChrome/'),
    })
    expect(issues.some((i) => i.includes('HeadlessChrome'))).toBe(true)
  })

  it('rejects a Chrome major that disagrees with sec-ch-ua', () => {
    const bundle = identityBundleFrom(modeIdentity('standard', 128))
    const issues = identityBundleIssues({
      ...bundle,
      clientHints: { ...bundle.clientHints, 'sec-ch-ua': '"Chromium";v="200", "Google Chrome";v="200", "Not;A=Brand";v="24"' },
    })
    expect(issues.some((i) => i.includes('Chrome major mismatch'))).toBe(true)
  })

  it('rejects a platform hint that disagrees with the UA', () => {
    const bundle = identityBundleFrom(modeIdentity('standard'))
    const issues = identityBundleIssues({
      ...bundle,
      clientHints: { ...bundle.clientHints, 'sec-ch-ua-platform': '"Windows"' },
    })
    expect(issues.some((i) => i.includes('platform mismatch'))).toBe(true)
  })

  it('rejects a research UA that also claims Chromium hints', () => {
    const bundle = identityBundleFrom(modeIdentity('research'))
    const issues = identityBundleIssues({
      ...bundle,
      clientHints: { 'sec-ch-ua': '"Chromium";v="128"' },
    })
    expect(issues.some((i) => i.includes('research UA'))).toBe(true)
  })

  it('rejects a viewport larger than the screen', () => {
    const bundle = identityBundleFrom(modeIdentity('standard'))
    const issues = identityBundleIssues({
      ...bundle,
      viewport: { width: 4000, height: 3000 },
      screen: BROWSER_FINGERPRINT.screen,
    })
    expect(issues.some((i) => i.includes('smaller than viewport'))).toBe(true)
  })

  it('rejects a browser UA with no client hints', () => {
    const bundle = identityBundleFrom(modeIdentity('standard'))
    const issues = identityBundleIssues({ ...bundle, clientHints: {} })
    expect(issues.some((i) => i.includes('missing aligned client hints'))).toBe(true)
  })
})

describe('headersFromIdentity', () => {
  it('standard: User-Agent Chrome major equals sec-ch-ua major', () => {
    const headers = headersFromIdentity(identityBundleFrom(modeIdentity('standard', 128)))
    const uaMajor = /Chrome\/(\d+)/.exec(headers['user-agent'] ?? '')?.[1]
    const hintMajor = /Chromium";v="(\d+)"/.exec(headers['sec-ch-ua'] ?? '')?.[1]
    expect(uaMajor).toBe('128')
    expect(hintMajor).toBe('128')
  })

  it('research: zero Chromium client hints', () => {
    const headers = headersFromIdentity(identityBundleFrom(modeIdentity('research')))
    expect(headers['user-agent']).toContain('w2l-research')
    expect(headers['sec-ch-ua']).toBeUndefined()
    expect(headers['sec-ch-ua-platform']).toBeUndefined()
    expect(headers['sec-ch-ua-mobile']).toBeUndefined()
  })

  it('throws on a contradictory bundle before any bytes exist', () => {
    const bundle = identityBundleFrom(modeIdentity('standard'))
    expect(() =>
      headersFromIdentity({
        ...bundle,
        clientHints: { ...bundle.clientHints, 'sec-ch-ua-platform': '"Windows"' },
      }),
    ).toThrow(/identity bundle inconsistent/)
    expect(() => assertIdentityBundle({ ...bundle, userAgent: bundle.userAgent.replace('Chrome/', 'HeadlessChrome/') })).toThrow(
      /HeadlessChrome/,
    )
  })
})

describe('previewIdentity', () => {
  it('appends the product token to the standard User-Agent and keeps a coherent bundle', () => {
    const preview = previewIdentity(modeIdentity('standard', 128))
    expect(preview.userAgent).toBe(`${browserUserAgent(128)} ${PREVIEW_PRODUCT_TOKEN}`)
    expect(preview.clientHints).toEqual(browserClientHints(128))
    expect(preview.respectsRobots).toBe(true)
    expect(identityBundleIssues(identityBundleFrom(preview))).toEqual([])
    expect(formatIdentitySummary(identityBundleFrom(preview))).toBe(formatIdentitySummary(identityBundleFrom(modeIdentity('standard', 128))))
  })

  it('is for the standard identity only', () => {
    for (const mode of ['research', 'authed', 'proxy'] as const) {
      expect(() => previewIdentity(modeIdentity(mode)), mode).toThrow(/standard identity/)
    }
  })
})

describe('formatIdentitySummary', () => {
  it('standard names Chrome major, platform, and locale', () => {
    const line = formatIdentitySummary(identityBundleFrom(modeIdentity('standard', 128)))
    expect(line).toContain('Chrome/128')
    expect(line).toContain('macOS')
    expect(line).toContain('en-US')
    expect(line.length).toBeGreaterThan(0)
  })

  it('research names the declared bot, not Chromium', () => {
    const line = formatIdentitySummary(identityBundleFrom(modeIdentity('research')))
    expect(line).toContain('w2l-research')
    expect(line).not.toMatch(/Chrome\//)
    expect(line.length).toBeGreaterThan(0)
  })
})

describe('vendorIdentityIssues', () => {
  const chrome =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
  const headless =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36'

  it('standard accepts a headed Chrome UA with no hints', () => {
    expect(vendorIdentityIssues('standard', chrome)).toEqual([])
  })

  it('rejects HeadlessChrome in every mode', () => {
    expect(vendorIdentityIssues('standard', headless).some((i) => i.includes('HeadlessChrome'))).toBe(true)
    expect(vendorIdentityIssues('research', headless).some((i) => i.includes('HeadlessChrome'))).toBe(true)
  })

  it('research must not look like Chrome', () => {
    expect(vendorIdentityIssues('research', chrome).some((i) => i.includes('research mode'))).toBe(true)
    expect(vendorIdentityIssues('research', 'w2l-research/0.1')).toEqual([])
  })

  it('rejects UA vs sec-ch-ua disagreement', () => {
    const issues = vendorIdentityIssues('standard', chrome, {
      'sec-ch-ua': '"Chromium";v="200", "Google Chrome";v="200", "Not;A=Brand";v="24"',
    })
    expect(issues.some((i) => i.includes('Chrome major mismatch'))).toBe(true)
  })
})

describe('identityForRoute — changing IP is not changing identity', () => {
  const proxy = { url: 'http://us-east.proxy.example:8080' }
  const session = {
    storageState: '{"cookies":[{"name":"sid","value":"x","domain":".example.com","path":"/"}]}',
  }
  const resume = { browserbaseContextId: 'ctx-1' }

  it('proxy / storageState produce the same bundle as no access, byte for byte', () => {
    const bare = identityForRoute('standard', null, 128)
    const viaProxy = identityForRoute('standard', { proxy }, 128)
    const viaSession = identityForRoute('standard', { session }, 128)
    const viaBoth = identityForRoute('standard', { proxy, session }, 128)
    expect(viaProxy).toEqual(bare)
    expect(viaSession).toEqual(bare)
    expect(viaBoth).toEqual(bare)
    expect(headersFromIdentity(viaProxy)).toEqual(headersFromIdentity(bare))
  })

  it('vendor session resume does not change the declared bundle', () => {
    const bare = identityForRoute('research', null)
    const resumed = identityForRoute('research', { resume })
    expect(resumed).toEqual(bare)
    expect(resumed.userAgent).toContain('w2l-research')
  })

  it('refuses a timezone retune to match proxy geo', () => {
    expect(() =>
      identityForRoute('standard', { proxy }, 128, { timezoneId: 'America/New_York' }),
    ).toThrow(/changing IP or session is not changing identity/)
    expect(() => identityForRoute('proxy', { proxy }, 128, { locale: 'en-GB' })).toThrow(
      /not changing identity/,
    )
  })
})

describe('the mobile identity', () => {
  it('is coherent, differs from the desktop one only in UA, mobile hint, platform, viewport, screen, scale and touch, and passes the honesty check', () => {
    const desktop = identityForRoute('standard', null, 128)
    const mobile = identityForRoute('standard', null, 128, undefined, 'mobile')
    expect(identityBundleIssues(mobile)).toEqual([])
    expect(mobile.userAgent).toBe('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36')
    expect(mobile.clientHints).toEqual({ ...desktop.clientHints, 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' })
    expect(mobile).toMatchObject({ locale: desktop.locale, timezoneId: desktop.timezoneId, viewport: { width: 412, height: 915 }, screen: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true })
    expect(mobile).toMatchObject(MOBILE_BROWSER_FINGERPRINT)
    expect(desktop).toMatchObject(BROWSER_FINGERPRINT)
    const differing = (Object.keys(mobile) as Array<keyof typeof mobile>).filter((key) => JSON.stringify(mobile[key]) !== JSON.stringify(desktop[key]))
    expect(differing.sort()).toEqual(['clientHints', 'deviceScaleFactor', 'hasTouch', 'isMobile', 'screen', 'userAgent', 'viewport'])
    const identity = modeIdentity('standard', 128, null, null, 'mobile')
    expect(identity.device).toBe('mobile')
    expect(modeIdentity('standard', 128).device).toBe('desktop')
    const sent = Object.entries(headersFromIdentity(mobile)).map(([name, value]) => ({ name, value }))
    expect(checkIdentityHonesty(identity, { headers: sent })).toEqual({ honest: true, mismatches: [] })
    // A mobile hint on a desktop UA, or the reverse, is a contradiction, not a device.
    expect(identityBundleIssues({ ...desktop, clientHints: { ...desktop.clientHints, 'sec-ch-ua-mobile': '?1' } }).some((i) => i.includes('mobile mismatch'))).toBe(true)
    expect(identityBundleIssues({ ...mobile, isMobile: false }).some((i) => i.includes('mobile mismatch'))).toBe(true)
    // Research declares a bot: no device, whatever is asked.
    expect(modeIdentity('research', 128, null, null, 'mobile')).not.toHaveProperty('device')
    expect(identityForRoute('research', null, 128, undefined, 'mobile').userAgent).toContain('w2l-research')
    expect(formatIdentitySummary(mobile)).toBe('Chrome/128 · Android · en-US · mobile')
  })

  it('backs each declared identity with user-agent metadata whose brands, platform and mobile flag are the declared hints', () => {
    for (const device of ['desktop', 'mobile'] as const) {
      const hints = modeIdentity('standard', 128, null, null, device).clientHints
      const metadata = browserUserAgentMetadata(128, device)
      expect(serializeBrands(metadata.brands)).toBe(hints['sec-ch-ua'])
      expect(`"${metadata.platform}"`).toBe(hints['sec-ch-ua-platform'])
      expect(metadata.mobile ? '?1' : '?0').toBe(hints['sec-ch-ua-mobile'])
      expect(metadata.fullVersionList.map((entry) => entry.version)).toEqual(['128.0.0.0', '128.0.0.0', '24.0.0.0'])
    }
    expect(browserUserAgentMetadata(128, 'mobile')).toMatchObject({ model: 'Pixel 7', platformVersion: '14.0.0', mobile: true })
    expect(browserUserAgentMetadata(128)).toMatchObject({ model: '', platform: 'macOS', mobile: false })
  })
})
