import { readFileSync } from 'node:fs'
import { accessGrantFromText, type AccessGrant } from '@w2l/http-core'
import { browserEngineChoice, browserIdentityChoice, type BrowserIdentityChoice, COMPAT_LIBRARY, compatHostsChoice, DEFAULT_COMPAT_PROFILE, loadImpit, loadPatchrightEngine, type BrowserEngineName } from '@w2l/bench'
import { egressProxies, type NetworkPolicy, type ProxyServer } from '@w2l/contracts'

/**
 * The engine options every entry point that runs the engine on this machine reads from its environment: the API server
 * (`w2l-api`, `octocrawl serve`), a one-off `octocrawl` command and the local MCP host. One loader, so the same grant and
 * the same variables give each of them the same rungs (docs/pa-enhancement-tasks.md A2).
 */
export interface EngineConfig {
  /**
   * What the operator allows enhanced access to do (ADR 0005): `--access-grant <file>` where the entry point takes
   * flags, else `W2L_ACCESS_GRANT` (a file path, or the JSON itself). Null when none is given, and then every
   * capability ADR 0005 puts behind a grant stays off.
   */
  accessGrant: AccessGrant | null
  /**
   * The engine the public browser rung launches (`W2L_BROWSER_ENGINE`): stock Playwright unless the
   * grant names `enhanced_browser` and Patchright is asked for; a hosted server refuses Patchright.
   */
  browserEngine: BrowserEngineName
  /** Which identity the public browser rung sends (`W2L_BROWSER_IDENTITY`): the mode's declared one, or the browser's own (`actual`, local only). */
  browserIdentity: BrowserIdentityChoice
  /**
   * The hosts whose standard-mode pages go over the browser-compatible transport (`W2L_COMPAT_HOSTS`):
   * only with a grant that names `compatible_transport`, never on a hosted server. Empty: none.
   */
  compatHosts: string[]
  /**
   * The operator's egress proxies (`W2L_EGRESS_PROXIES`): only with a grant that names `egress_sessions`,
   * never on a hosted server. Empty: none.
   */
  egressProxies: ProxyServer[]
  /** `W2L_EGRESS_ECHO_URL`: the URL each egress is asked where it leaves from; only with egress proxies. Null: not asked. */
  egressEchoUrl: string | null
  /**
   * Pages the engine fetches at once across a crawl or batch
   * (`W2L_WORKER_COUNT`, 1 to 64, default 4): a batch's or crawl's own
   * `maxConcurrency` may lower it, never raise it, and the per-host ceiling
   * (`W2L_PER_HOST_CONCURRENCY`) still holds for each host.
   */
  workerCount: number
  /** Startup lines about the grant and what it turned on, printed once. */
  notices: string[]
}

export const MAX_WORKER_COUNT = 64

/**
 * The engine options from the environment, checked at startup. `hosted` keeps every refusal a hosted server makes:
 * tier `my_browser`, `installed_chrome`, the compatible transport, egress proxies, Patchright and the actual browser
 * identity. `argv` is read for `--access-grant` alone, by an entry point that takes it (the API server).
 */
export function loadEngineConfig(env: NodeJS.ProcessEnv, options: { hosted: boolean; argv?: readonly string[] }): EngineConfig {
  const { hosted } = options
  const workerCount = parseWorkerCount(env)
  const accessGrant = readAccessGrant(options.argv ?? [], env, hosted)
  const browserEngine = browserEngineChoice(env, accessGrant, hosted)
  const browserIdentity = browserIdentityChoice(env, hosted)
  const compatHosts = compatHostsChoice(env, accessGrant, hosted)
  const egressList = readEgressProxies(env, accessGrant, hosted)
  const egressEchoUrl = readEgressEchoUrl(env, egressList)
  const notices = [
    ...(accessGrant === null ? [] : [accessGrantNotice(accessGrant)]),
    ...(browserEngine === 'playwright' ? [] : [`browser engine: ${browserEngine} on the public browser rung (ADR 0005 enhanced_browser); saved logins and managed sessions keep stock Playwright`]),
    ...(browserIdentity === 'declared' ? [] : ['browser identity: actual on the public browser rung (W2L_BROWSER_IDENTITY): the browser sends its own User-Agent and client hints, which the record declares; an experiment switch (docs/pa-challenge-botcheck-tasks.md G2)']),
    ...(compatHosts.length === 0 ? [] : [`compatible transport (ADR 0005 compatible_transport): ${COMPAT_LIBRARY.name} ${COMPAT_LIBRARY.version}, profile ${DEFAULT_COMPAT_PROFILE}, in place of the http rung for standard-mode pages on ${compatHosts.join(', ')} and their subdomains${(env.W2L_COMPAT_HOSTS ?? '').trim() === '' ? ' (the hosts its acceptance showed it helps, research/access/benefit-hosts.v1.json; W2L_COMPAT_HOSTS names others, none turns it off)' : ''}; a request with custom headers or mobile keeps the http rung`]),
    ...(egressList.length === 0 ? [] : [`egress proxies (ADR 0005 egress_sessions): ${egressList.map((proxy) => proxy.endpoint).join(', ')}; a batch or crawl keeps one for its run and moves on only when the proxy itself fails its probe (at most 2 times), never after a block, a challenge, a 429 or a site's reset; a scrape takes the next healthy one${egressEchoUrl === null ? '' : `; each is asked where it leaves from at ${new URL(egressEchoUrl).host}`}`]),
  ]
  return { accessGrant, browserEngine, browserIdentity, compatHosts, egressProxies: egressList, egressEchoUrl, workerCount, notices }
}

/**
 * The optional modules the configuration needs, loaded before the entry point serves: Patchright (an optional install)
 * and impit (a native module) fail at startup, not on the first page. Resolves to Patchright's version line, or null.
 */
export async function preloadEngineModules(config: Pick<EngineConfig, 'browserEngine' | 'compatHosts'>): Promise<string | null> {
  let line: string | null = null
  if (config.browserEngine === 'patchright') {
    const engine = await loadPatchrightEngine()
    line = `patchright ${engine.version ?? '(version unknown)'} loaded`
  }
  if (config.compatHosts.length > 0) await loadImpit()
  return line
}

/** `W2L_PER_HOST_CONCURRENCY` and `W2L_PER_HOST_MIN_DELAY_MS` over a network policy, checked at startup. */
export function tunedPolicy(base: NetworkPolicy, env: NodeJS.ProcessEnv): NetworkPolicy {
  const concurrency = env['W2L_PER_HOST_CONCURRENCY'] === undefined ? base.perHostConcurrency : Number(env['W2L_PER_HOST_CONCURRENCY'])
  const delay = env['W2L_PER_HOST_MIN_DELAY_MS'] === undefined ? base.perHostMinDelayMs : Number(env['W2L_PER_HOST_MIN_DELAY_MS'])
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('W2L_PER_HOST_CONCURRENCY must be 1, 2, 3, or 4')
  if (!Number.isInteger(delay) || delay < 1 || delay > 60_000) throw new Error('W2L_PER_HOST_MIN_DELAY_MS must be 1..60000')
  return { ...base, perHostConcurrency: concurrency, perHostMinDelayMs: delay }
}

/** The startup line that says what the grant allows. */
export function accessGrantNotice(grant: AccessGrant): string {
  const usd = (value: number | null) => (value === null ? 'none' : `${value} USD`)
  return `access grant (ADR 0005): tier ${grant.tier}; ${grant.capabilities.length === 0 ? 'no capabilities' : grant.capabilities.join(', ')}; run budget ${usd(grant.budget.perRunUsd)}; per-request budget ${usd(grant.budget.perRequestUsd)}${grant.attestation === null ? '' : `; accepted by ${grant.attestation.principal}`}`
}

function parseWorkerCount(env: NodeJS.ProcessEnv): number {
  const raw = (env['W2L_WORKER_COUNT'] ?? '').trim()
  if (raw === '') return 4
  const count = Number(raw)
  if (!/^\d+$/.test(raw) || count < 1 || count > MAX_WORKER_COUNT) throw new Error(`W2L_WORKER_COUNT must be an integer from 1 to ${MAX_WORKER_COUNT}`)
  return count
}

/**
 * The access grant, validated. A grant with any problem stops startup with every problem listed: a server that
 * silently dropped a refused or deferred capability would run with less than the operator thinks, or with more than
 * they meant. A hosted server has no person's browser and no Chrome of its own to launch, so tier `my_browser` and
 * `installed_chrome` are refused there.
 */
function readAccessGrant(argv: readonly string[], env: NodeJS.ProcessEnv, hosted: boolean): AccessGrant | null {
  const source = (readFlag(argv, '--access-grant') ?? env['W2L_ACCESS_GRANT'] ?? '').trim()
  if (source === '') return null
  let text: string
  try {
    text = source.startsWith('{') ? source : readFileSync(source, 'utf8')
  } catch (error) {
    throw new Error(`access grant: cannot read ${source}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const grant = accessGrantFromText(text)
  if (hosted && grant.tier === 'my_browser') {
    throw new Error("access grant refused: tier my_browser reads the person's own Chrome, which a hosted server does not have")
  }
  if (hosted && grant.capabilities.includes('installed_chrome')) {
    throw new Error('access grant refused: installed_chrome launches the Google Chrome of the machine Octocrawl runs on, which a hosted server does not offer (ADR 0005)')
  }
  return grant
}

/** W2L_EGRESS_PROXIES, checked at startup: the grant must name egress_sessions; a hosted server refuses them. */
function readEgressProxies(env: NodeJS.ProcessEnv, grant: AccessGrant | null, hosted: boolean): ProxyServer[] {
  const proxies = egressProxies(env.W2L_EGRESS_PROXIES)
  if (proxies.length === 0) return []
  if (hosted) throw new Error('W2L_EGRESS_PROXIES is refused on a hosted server (ADR 0005: a hosted server connects direct, to addresses it checked)')
  if (!(grant?.capabilities ?? []).includes('egress_sessions')) throw new Error('W2L_EGRESS_PROXIES needs an access grant that names egress_sessions (ADR 0005; --access-grant or W2L_ACCESS_GRANT)')
  return proxies
}

/** W2L_EGRESS_ECHO_URL, checked at startup: an http(s) URL, and only beside W2L_EGRESS_PROXIES, the egresses it asks about. */
function readEgressEchoUrl(env: NodeJS.ProcessEnv, egresses: readonly ProxyServer[]): string | null {
  const raw = env.W2L_EGRESS_ECHO_URL?.trim() ?? ''
  if (raw === '') return null
  if (egresses.length === 0) throw new Error('W2L_EGRESS_ECHO_URL asks each egress proxy where it leaves from: it needs W2L_EGRESS_PROXIES')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('W2L_EGRESS_ECHO_URL must be an http(s) URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('W2L_EGRESS_ECHO_URL must be an http(s) URL')
  return url.href
}

export function readFlag(argv: readonly string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`))
  if (eq !== undefined) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1]
  return undefined
}
