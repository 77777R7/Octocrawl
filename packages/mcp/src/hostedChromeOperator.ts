/**
 * hosted_chrome's operator config, from the environment of the hosted API and the job worker (ADR 0005, revision of
 * 2026-10-27, decision two, condition one: the operator's statement, tariff and budget, in Secret Manager). With it, a
 * hosted engine builds the rung (engine.ts `hostedChrome`); the account's switch and the call's `access: "enhanced"`
 * decide each call.
 *
 *   W2L_HOSTED_CHROME_URL          the octocrawl-chrome service's URL (https), also the audience of its ID token
 *   W2L_HOSTED_CHROME_ATTESTATION  the operator's statement, JSON: { "principal", "at" (ISO 8601), "statement" }
 *   W2L_HOSTED_CHROME_EGRESS       the service's exit and its price: `google` for Cloud Run's own egress, or JSON
 *                                  { "vendor", "tariff" } (a VendorTariff, normalizeVendorTariff; D2's datacenter plan
 *                                  is its rent, perIpMonthUsd for each of rentedIps). It must name the exit the
 *                                  service is deployed with: the counter prices each read by it.
 *
 * None set: no rung, and `access: "enhanced"` is refused at the gate as before. Some set and not all: the process does
 * not start. The counter (D5) is the switch's two numbers, counted in `hostedChromeSpend` and `hostedQuotas`
 * (hostedChromeMeter.ts). Messages name the variables, never their values.
 */
import { normalizeVendorTariff, type HostedChromeOperator } from '@w2l/api'
import type { HostedAccessSource } from './hostedAccess.js'
import type { HostedQuota } from './hostedApi.js'
import { httpHostedChromeClient, metadataIdToken } from './hostedChrome.js'
import { HostedChromeCounter, type HostedChromeEgress, type HostedChromeSpendStore } from './hostedChromeMeter.js'

/** The variables that make up the config, all or none. */
export const HOSTED_CHROME_OPERATOR_ENV = ['W2L_HOSTED_CHROME_URL', 'W2L_HOSTED_CHROME_ATTESTATION', 'W2L_HOSTED_CHROME_EGRESS'] as const

export interface HostedChromeOperatorConfig {
  serviceUrl: string
  attestation: { principal: string; at: string; statement: string }
  /** The priced exit, or null for Cloud Run's own egress. */
  egress: HostedChromeEgress | null
}

/** The config the environment names; null with none of its variables set. Throws for part of them, or one it cannot use. */
export function hostedChromeConfigFromEnv(env: NodeJS.ProcessEnv): HostedChromeOperatorConfig | null {
  const read = (name: (typeof HOSTED_CHROME_OPERATOR_ENV)[number]) => env[name]?.trim() ?? ''
  const unset = HOSTED_CHROME_OPERATOR_ENV.filter((name) => read(name) === '')
  if (unset.length === HOSTED_CHROME_OPERATOR_ENV.length) return null
  if (unset.length > 0) throw new Error(`hosted_chrome's operator config is partial: ${unset.map((name) => `${name} is unset`).join(', ')}; set all of ${HOSTED_CHROME_OPERATOR_ENV.join(', ')}, or none to leave the rung off`)

  const serviceUrl = read('W2L_HOSTED_CHROME_URL')
  let url: URL
  try { url = new URL(serviceUrl) } catch { throw new Error('W2L_HOSTED_CHROME_URL is not a URL') }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search !== '' || url.username !== '') throw new Error('W2L_HOSTED_CHROME_URL is the service\'s https:// URL, with no path')

  const attestation = json('W2L_HOSTED_CHROME_ATTESTATION', read('W2L_HOSTED_CHROME_ATTESTATION'))
  if (attestation === null || typeof attestation !== 'object' || Array.isArray(attestation)) throw new Error('W2L_HOSTED_CHROME_ATTESTATION is a JSON object: { principal, at, statement }')
  const { principal, at, statement } = attestation as Record<string, unknown>
  for (const [key, value] of [['principal', principal], ['at', at], ['statement', statement]] as const) {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`W2L_HOSTED_CHROME_ATTESTATION needs ${key}: who accepted the rung, when (ISO 8601), and what they accepted`)
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at as string) || Number.isNaN(Date.parse(at as string))) throw new Error('W2L_HOSTED_CHROME_ATTESTATION\'s at is an ISO 8601 time')

  const egressText = read('W2L_HOSTED_CHROME_EGRESS')
  let egress: HostedChromeEgress | null = null
  if (egressText !== 'google') {
    const parsed = egressText.startsWith('{') ? json('W2L_HOSTED_CHROME_EGRESS', egressText) : null
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('W2L_HOSTED_CHROME_EGRESS is `google` (Cloud Run\'s own egress) or JSON { vendor, tariff }')
    const { vendor, tariff } = parsed as Record<string, unknown>
    if (typeof vendor !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(vendor)) throw new Error('W2L_HOSTED_CHROME_EGRESS needs vendor: a lowercase name')
    const normalized = normalizeVendorTariff(vendor, tariff)
    if (!normalized.ok) throw new Error(`W2L_HOSTED_CHROME_EGRESS's tariff is refused: ${normalized.problems.map((problem) => `${problem.field}: ${problem.reason}`).join('; ')}`)
    egress = { vendor, tariff }
  }
  return { serviceUrl, attestation: { principal: principal as string, at: at as string, statement: statement as string }, egress }
}

function json(name: string, text: string): unknown {
  try { return JSON.parse(text) } catch { throw new Error(`${name} is not JSON`) }
}

export interface HostedChromeOperatorDeps {
  /** The switches, the account switch's two numbers among them. */
  settings: HostedAccessSource
  spend: HostedChromeSpendStore
  quota: HostedQuota
  /** The ID token source for an audience; the metadata server's by default. */
  idToken?: (audience: string) => () => Promise<string>
  fetcher?: typeof fetch
  log?: (line: string) => void
}

/** The engine's operator config: the statement, the service's client, and the D5 counter. */
export function hostedChromeOperator(config: HostedChromeOperatorConfig, deps: HostedChromeOperatorDeps): HostedChromeOperator {
  const idToken = (deps.idToken ?? ((audience: string) => metadataIdToken(audience)))(config.serviceUrl)
  return {
    attestation: config.attestation,
    client: httpHostedChromeClient(config.serviceUrl, idToken, deps.fetcher),
    meter: new HostedChromeCounter({ settings: deps.settings, spend: deps.spend, quota: deps.quota, egress: config.egress, ...(deps.log === undefined ? {} : { log: deps.log }) }),
  }
}
