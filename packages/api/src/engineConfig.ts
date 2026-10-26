import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { accessGrantFromText, type AccessGrant } from '@w2l/http-core'
import { browserEngineChoice, browserIdentityChoice, type BrowserIdentityChoice, CapSolver, capSolverFetch, type CaptchaSolving, COMPAT_LIBRARY, compatHostsChoice, DEFAULT_COMPAT_PROFILE, loadImpit, loadPatchrightEngine, startSolverForwarder, type BrowserEngineName } from '@w2l/bench'
import { egressProxies, environmentProxy, type NetworkPolicy, type ProxyServer } from '@w2l/contracts'

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
  /**
   * ADR 0005 `third_party_captcha_solver` (revision of 2026-10-25): the solver the grant names, its key
   * (`CAPSOLVER_API_KEY`) and, when the grant's solver exit is `proxy`, the operator's sticky exit (`W2L_SOLVER_PROXY`).
   * Local only. Null when the grant does not name the capability.
   */
  captchaSolver: CaptchaSolverConfig | null
  /** Startup lines about the grant and what it turned on, printed once. */
  notices: string[]
}

/** The solver as the grant and the environment give it; started by startCaptchaSolving. The key and the exit's login stay in memory. */
export interface CaptchaSolverConfig {
  vendor: 'capsolver'
  apiKey: string
  /** The run's exit for every rung, chosen before any request; null when the grant's solver exit is `none`. */
  upstream: ProxyServer | null
  /** The IP the forwarder dials for `upstream` (W2L_SOLVER_PROXY_ADDRESS), the solver still given its hostname; null: its own. */
  upstreamAddress: string | null
  /** The scheme the solver is given `upstream` by (W2L_SOLVER_PROXY_SCHEME), the browser's being http; null: http too. */
  solverScheme: 'socks5' | null
  perSolveUsd: number
  maxSolvesPerCall: number
  grantHash: string | null
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
  const captchaSolver = readCaptchaSolver(env, accessGrant, hosted, egressList)
  const notices = [
    ...(accessGrant === null ? [] : [accessGrantNotice(accessGrant)]),
    ...(browserEngine === 'playwright' ? [] : [`browser engine: ${browserEngine} on the public browser rung (ADR 0005 enhanced_browser); saved logins and managed sessions keep stock Playwright`]),
    ...(browserIdentity === 'declared' ? [] : ['browser identity: actual on the public browser rung (W2L_BROWSER_IDENTITY): the browser sends its own User-Agent and client hints, which the record declares; an experiment switch (docs/pa-challenge-botcheck-tasks.md G2)']),
    ...(compatHosts.length === 0 ? [] : [`compatible transport (ADR 0005 compatible_transport): ${COMPAT_LIBRARY.name} ${COMPAT_LIBRARY.version}, profile ${DEFAULT_COMPAT_PROFILE}, in place of the http rung for standard-mode pages on ${compatHosts.join(', ')} and their subdomains${(env.W2L_COMPAT_HOSTS ?? '').trim() === '' ? ' (the hosts its acceptance showed it helps, research/access/benefit-hosts.v1.json; W2L_COMPAT_HOSTS names others, none turns it off)' : ''}; a request with custom headers or mobile keeps the http rung`]),
    ...(egressList.length === 0 ? [] : [`egress proxies (ADR 0005 egress_sessions): ${egressList.map((proxy) => proxy.endpoint).join(', ')}; a batch or crawl keeps one for its run and moves on only when the proxy itself fails its probe (at most 2 times), never after a block, a challenge, a 429 or a site's reset; a scrape takes the next healthy one${egressEchoUrl === null ? '' : `; each is asked where it leaves from at ${new URL(egressEchoUrl).host}`}`]),
    ...(captchaSolver === null ? [] : [`captcha solver (ADR 0005 third_party_captcha_solver): ${captchaSolver.vendor}, $${captchaSolver.perSolveUsd} a solve by the grant's tariff, at most ${captchaSolver.maxSolvesPerCall} a page, within the grant's budget; on the public browser rungs of requests that choose access enhanced${captchaSolver.upstream === null ? '; no solver exit, so DataDome and Cloudflare challenges are not solved' : `; every rung leaves through the solver exit ${captchaSolver.upstream.endpoint}${captchaSolver.upstreamAddress === null ? '' : `, dialled at ${captchaSolver.upstreamAddress}`}${captchaSolver.solverScheme === null ? '' : ` and given to ${captchaSolver.vendor} as ${captchaSolver.solverScheme}`} from its first request, and DataDome and Cloudflare challenges are solved through it`}`]),
  ]
  return { accessGrant, browserEngine, browserIdentity, compatHosts, egressProxies: egressList, egressEchoUrl, workerCount, captchaSolver, notices }
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
  if (hosted && grant.capabilities.includes('third_party_captcha_solver')) {
    throw new Error('access grant refused: third_party_captcha_solver is local only for now; a hosted server will take it behind its own switch, off by default (ADR 0005, revision of 2026-10-25)')
  }
  if (hosted && grant.capabilities.includes('installed_chrome')) {
    throw new Error('access grant refused: installed_chrome launches the Google Chrome of the machine Octocrawl runs on, which a hosted server does not offer (ADR 0005)')
  }
  return grant
}

/**
 * The solver of a grant that names third_party_captcha_solver, checked at startup: its key from CAPSOLVER_API_KEY, and
 * for a solver exit `proxy` the operator's sticky exit from W2L_SOLVER_PROXY (an http:// URL with its login), which the
 * run's every rung then leaves through. Errors never repeat either value.
 */
function readCaptchaSolver(env: NodeJS.ProcessEnv, grant: AccessGrant | null, hosted: boolean, egressList: readonly ProxyServer[]): CaptchaSolverConfig | null {
  const solverExit = (env.W2L_SOLVER_PROXY ?? '').trim()
  const solverAddress = (env.W2L_SOLVER_PROXY_ADDRESS ?? '').trim()
  const solverScheme = (env.W2L_SOLVER_PROXY_SCHEME ?? '').trim().toLowerCase()
  if (solverScheme !== '' && solverScheme !== 'socks5' && solverScheme !== 'http') throw new Error('W2L_SOLVER_PROXY_SCHEME must be socks5 or http (the scheme the solver is given W2L_SOLVER_PROXY by)')
  if (solverScheme !== '' && solverExit === '') throw new Error('W2L_SOLVER_PROXY_SCHEME is the scheme the solver is given W2L_SOLVER_PROXY by: set W2L_SOLVER_PROXY too, or unset it')
  if (solverAddress !== '' && solverExit === '') throw new Error('W2L_SOLVER_PROXY_ADDRESS is the address W2L_SOLVER_PROXY\'s host is dialled at: set W2L_SOLVER_PROXY too, or unset it')
  if (solverAddress !== '' && isIP(solverAddress) === 0) throw new Error('W2L_SOLVER_PROXY_ADDRESS must be an IP address (the gateway the exit\'s hostname is dialled at)')
  if (grant === null || !grant.capabilities.includes('third_party_captcha_solver') || grant.solver == null) {
    if (solverExit !== '') throw new Error('W2L_SOLVER_PROXY needs an access grant that names third_party_captcha_solver with solver.egress "proxy" (ADR 0005)')
    return null
  }
  if (hosted) throw new Error('third_party_captcha_solver is refused on a hosted server (ADR 0005)')
  const apiKey = (env.CAPSOLVER_API_KEY ?? '').trim()
  if (apiKey === '') throw new Error('the access grant names third_party_captcha_solver with solver capsolver: set CAPSOLVER_API_KEY (for example from .w2l/access/capsolver.env)')
  const tariff = grant.tariffs[grant.solver.vendor]!
  let upstream: ProxyServer | null = null
  if (grant.solver.egress === 'proxy') {
    if (solverExit === '') throw new Error('the access grant\'s solver exit is "proxy": set W2L_SOLVER_PROXY to the operator\'s sticky exit (http://user:password@host:port)')
    if (egressList.length > 0) throw new Error('W2L_SOLVER_PROXY and W2L_EGRESS_PROXIES both choose the run\'s exit; set one (ADR 0005)')
    let parsed: ReturnType<typeof environmentProxy>
    try { parsed = environmentProxy({ HTTPS_PROXY: solverExit }) } catch { throw new Error('W2L_SOLVER_PROXY is not an http(s) proxy URL') }
    if (parsed?.https == null || !parsed.https.url.startsWith('http://')) throw new Error('W2L_SOLVER_PROXY must be an http:// proxy URL with its login')
    upstream = parsed.https
  } else if (solverExit !== '') {
    throw new Error('W2L_SOLVER_PROXY is set but the access grant\'s solver exit is "none"; set solver.egress to "proxy" in the grant, or unset it')
  }
  return { vendor: grant.solver.vendor, apiKey, upstream, upstreamAddress: upstream === null || solverAddress === '' ? null : solverAddress, solverScheme: upstream === null || solverScheme !== 'socks5' ? null : 'socks5', perSolveUsd: tariff.perSolveUsd, maxSolvesPerCall: tariff.maxSolvesPerCall!, grantHash: grant.sha256 ?? null }
}

/**
 * Start the configured solver before the engine is built: the local forwarder to the solver exit, when the grant chose
 * one, and the vendor's client, whose API calls follow the operator's environment proxy. `exit` is the proxy every rung
 * of the run is then given (withPoolProxy); `close` stops the forwarder.
 */
export async function startCaptchaSolving(config: CaptchaSolverConfig | null, env: NodeJS.ProcessEnv = process.env): Promise<{ solving: CaptchaSolving; exit: ProxyServer | null; close: () => Promise<void> } | null> {
  if (config === null) return null
  const forwarder = config.upstream === null ? null : await startSolverForwarder(config.upstream, config.upstreamAddress ?? undefined, config.solverScheme ?? undefined)
  const api = capSolverFetch(environmentProxy(env) !== null)
  const solver = new CapSolver({ apiKey: config.apiKey, fetchImpl: api.fetch })
  return {
    solving: { solver, perSolveUsd: config.perSolveUsd, maxSolvesPerCall: config.maxSolvesPerCall, egress: forwarder?.egress ?? null, grantHash: config.grantHash },
    exit: forwarder?.server ?? null,
    close: async () => { await forwarder?.close(); await api.close() },
  }
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
