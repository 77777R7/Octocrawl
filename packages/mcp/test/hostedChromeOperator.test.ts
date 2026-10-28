import { describe, expect, it } from 'vitest'
import { MemoryHostedAccess } from '../src/hostedAccess.js'
import { MemoryHostedQuota } from '../src/hostedApi.js'
import { MemoryHostedChromeSpend } from '../src/hostedChromeMeter.js'
import { HOSTED_CHROME_OPERATOR_ENV, hostedChromeConfigFromEnv, hostedChromeOperator } from '../src/hostedChromeOperator.js'

// hosted_chrome's operator config from the environment (ADR 0005, revision of 2026-10-27, decision two, condition one):
// the service's URL, the operator's statement and the egress tariff. None set: no rung; part of them: no start.

const ATTESTATION = { principal: 'operator@example.test', at: '2026-10-29T00:00:00Z', statement: 'hosted_chrome on the octocrawl-chrome service, D2 datacenter egress' }
/** A made-up datacenter plan: 100 IPs rented together for $2.99 a month. */
const TARIFF = { vendor: 'webshare', tariff: { perIpMonthUsd: 0.0299, rentedIps: 100 } }
const FULL = {
  W2L_HOSTED_CHROME_URL: 'https://octocrawl-chrome-abc123-as.a.run.app',
  W2L_HOSTED_CHROME_ATTESTATION: JSON.stringify(ATTESTATION),
  W2L_HOSTED_CHROME_EGRESS: JSON.stringify(TARIFF),
}

describe('hosted_chrome\'s operator config from the environment', () => {
  it('is nothing with no variable set, so a deploy without them changes nothing', () => {
    expect(hostedChromeConfigFromEnv({})).toBeNull()
    expect(hostedChromeConfigFromEnv({ W2L_HOSTED_CHROME_URL: '', W2L_HOSTED_CHROME_ATTESTATION: ' ', W2L_HOSTED_CHROME_EGRESS: '' })).toBeNull()
  })

  it('reads the URL, the statement and the egress: a priced exit, or `google` for Cloud Run\'s own', () => {
    expect(hostedChromeConfigFromEnv(FULL)).toEqual({ serviceUrl: FULL.W2L_HOSTED_CHROME_URL, attestation: ATTESTATION, egress: TARIFF })
    expect(hostedChromeConfigFromEnv({ ...FULL, W2L_HOSTED_CHROME_EGRESS: 'google' })?.egress).toBeNull()
  })

  it('refuses part of the set by the names missing, and never prints a value', () => {
    for (const name of HOSTED_CHROME_OPERATOR_ENV) {
      const env: Record<string, string> = { ...FULL }
      delete env[name]
      let message = ''
      try { hostedChromeConfigFromEnv(env) } catch (error) { message = (error as Error).message }
      expect(message).toContain(`${name} is unset`)
      expect(message).not.toContain(ATTESTATION.statement)
      expect(message).not.toContain('0.0299')
    }
  })

  it('refuses a URL, a statement or an egress it cannot use, naming the variable', () => {
    const refusals: [Record<string, string>, RegExp][] = [
      [{ W2L_HOSTED_CHROME_URL: 'http://octocrawl-chrome.example' }, /W2L_HOSTED_CHROME_URL.*https/],
      [{ W2L_HOSTED_CHROME_URL: 'not a url' }, /W2L_HOSTED_CHROME_URL/],
      [{ W2L_HOSTED_CHROME_ATTESTATION: '{' }, /W2L_HOSTED_CHROME_ATTESTATION.*JSON/],
      [{ W2L_HOSTED_CHROME_ATTESTATION: JSON.stringify({ ...ATTESTATION, statement: ' ' }) }, /W2L_HOSTED_CHROME_ATTESTATION.*statement/],
      [{ W2L_HOSTED_CHROME_ATTESTATION: JSON.stringify({ ...ATTESTATION, at: 'yesterday' }) }, /W2L_HOSTED_CHROME_ATTESTATION.*at/],
      [{ W2L_HOSTED_CHROME_EGRESS: 'residential' }, /W2L_HOSTED_CHROME_EGRESS/],
      [{ W2L_HOSTED_CHROME_EGRESS: JSON.stringify({ vendor: '', tariff: TARIFF.tariff }) }, /W2L_HOSTED_CHROME_EGRESS.*vendor/],
      // A rent with no count of IPs leaves the month's fixed cost unknown: refused, as the counter refuses it.
      [{ W2L_HOSTED_CHROME_EGRESS: JSON.stringify({ vendor: 'webshare', tariff: { perIpMonthUsd: 0.0299 } }) }, /W2L_HOSTED_CHROME_EGRESS.*rentedIps/],
    ]
    for (const [change, refusal] of refusals) expect(() => hostedChromeConfigFromEnv({ ...FULL, ...change }), JSON.stringify(change)).toThrow(refusal)
  })
})

describe('hosted_chrome\'s operator', () => {
  it('carries the statement, a client for the service with an ID token for its URL, and the D5 counter', async () => {
    const config = hostedChromeConfigFromEnv(FULL)!
    const audiences: string[] = []
    const sent: { url: string; authorization: string | null }[] = []
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
      sent.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') })
      return new Response(JSON.stringify({ requestedUrl: 'https://shop.test/', status: 'success' }), { status: 200 })
    }) as typeof fetch
    const settings = new MemoryHostedAccess({ compatibleTransport: { enabled: false, allowedUids: null }, hostedChrome: { enabled: true, allowedUids: ['account-1'], monthlyCapUsd: 20, dailyAttemptsPerAccount: 20 } })
    const quota = new MemoryHostedQuota()
    const operator = hostedChromeOperator(config, { settings, spend: new MemoryHostedChromeSpend(), quota, idToken: (audience) => { audiences.push(audience); return async () => 'made-up-id-token' }, fetcher, log: () => {} })
    expect(operator.attestation).toEqual(ATTESTATION)
    expect(audiences).toEqual([FULL.W2L_HOSTED_CHROME_URL])
    await operator.client.fetch('https://shop.test/', {}, undefined)
    expect(sent).toEqual([{ url: `${FULL.W2L_HOSTED_CHROME_URL}/v1/read`, authorization: 'Bearer made-up-id-token' }])
    // The counter is the switch's: the listed account is admitted and its attempt taken; another is not.
    expect((await operator.meter.admit({ account: 'account-1' })).ok).toBe(true)
    expect(quota.counts.get(`${new Date().toISOString().slice(0, 10)}-hostedChrome-account-1`)).toBe(1)
    expect(await operator.meter.admit({ account: 'account-2' })).toMatchObject({ ok: false, reason: 'switched_off' })
  })
})
