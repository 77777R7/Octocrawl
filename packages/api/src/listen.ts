import { readFileSync } from 'node:fs'
import { accessGrantFromText, type AccessGrant } from '@w2l/http-core'
import { browserEngineChoice, COMPAT_LIBRARY, compatHostsChoice, DEFAULT_COMPAT_PROFILE, type BrowserEngineName } from '@w2l/bench'
import { describeEgressProxy, egressProxies, hostedNetworkPolicy, hostedProxyNotice, LOCAL_PRIVATE_ALLOWLIST, localNetworkPolicy, HOSTED_MAP_MAX_LIMIT, HOSTED_MAP_MAX_TIMEOUT_MS, MAX_MAP_LIMIT, MAX_MAP_TIMEOUT_MS, withEnvironmentProxy, withOperatorContact, type NetworkPolicy, type ProxyServer } from '@w2l/contracts'

export type ApiMode = 'local' | 'hosted'

/** The listen hosts that reach this machine alone: a local server on any other host needs a token. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * How the API process delivers job webhooks, apart from how it fetches
 * pages: TLS always verified, the shell's HTTP(S)_PROXY never used
 * (`W2L_DELIVERY_PROXY_URL` names an explicit proxy), `W2L_DELIVERY_CA_FILE`
 * trusted. Local mode reaches https receivers on public and local-network
 * addresses and plain http on loopback; hosted mode public https only, plus
 * `W2L_DELIVERY_PRIVATE_ALLOWLIST`.
 */
export interface DeliveryConfig {
  networkPolicy: NetworkPolicy
  allowHttpLoopback: boolean
  proxyUrl?: string
  caFile?: string
  /** The startup line describing the policy, printed once. */
  notice: string
}

export interface ListenConfig {
  mode: ApiMode
  host: string
  port: number
  /** Accepted bearer tokens; none leaves a local server open. */
  tokens: readonly string[]
  networkPolicy: NetworkPolicy
  defaultMaxPages: number | null
  /** The largest map `limit` and `timeout` the server takes: 5000 and 60 000 ms hosted, 100 000 and 300 000 ms locally. */
  mapMaxLimit: number
  mapMaxTimeoutMs: number
  /**
   * Whether a scrape or batch may carry a recorded robots override. A local
   * server's user decides that for their own fetches; a hosted server takes
   * none, whoever holds a token.
   */
  allowRobotsOverride: boolean
  /**
   * Pages the engine fetches at once across a crawl or batch
   * (`W2L_WORKER_COUNT`, 1 to 64, default 4): a batch's or crawl's own
   * `maxConcurrency` may lower it, never raise it, and the per-host ceiling
   * (`W2L_PER_HOST_CONCURRENCY`) still holds for each host.
   */
  workerCount: number
  /** Startup lines about the environment proxy, printed once. */
  notices: readonly string[]
  /**
   * The per-caller budget for requests that start work (`W2L_RATE_LIMIT_PER_MINUTE`
   * or `--rate-limit-per-minute`), per bearer token; absent means no limit.
   */
  rateLimit?: { perMinute: number }
  /** How this process delivers job webhooks. */
  delivery: DeliveryConfig
  /** Whether the job stream routes (`/events`, `/ws` on crawls and batches) are served; `W2L_JOB_STREAMS=off` turns them into 404s. */
  jobStreams: boolean
  /**
   * What the operator allows enhanced access to do on this server (ADR 0005): `--access-grant
   * <file>` or `W2L_ACCESS_GRANT` (a file path, or the JSON itself). Null when none is given, and
   * then every capability ADR 0005 puts behind a grant stays off.
   */
  accessGrant: AccessGrant | null
  /**
   * The engine the public browser rung launches (`W2L_BROWSER_ENGINE`): stock Playwright unless the
   * grant names `enhanced_browser` and Patchright is asked for; a hosted server refuses Patchright.
   */
  browserEngine: BrowserEngineName
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

/**
 * The server's access grant, validated. A grant with any problem stops startup with every problem
 * listed: a server that silently dropped a refused or deferred capability would run with less than
 * the operator thinks, or with more than they meant. A hosted server has no person's browser, so
 * tier `my_browser` is refused there.
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
  return grant
}

/** The startup line that says what the grant allows. */
export function accessGrantNotice(grant: AccessGrant): string {
  const usd = (value: number | null) => (value === null ? 'none' : `${value} USD`)
  return `access grant (ADR 0005): tier ${grant.tier}; ${grant.capabilities.length === 0 ? 'no capabilities' : grant.capabilities.join(', ')}; run budget ${usd(grant.budget.perRunUsd)}; per-request budget ${usd(grant.budget.perRequestUsd)} (not enforced yet)${grant.attestation === null ? '' : `; accepted by ${grant.attestation.principal}`}`
}

/** `W2L_JOB_STREAMS=off` is the one value that turns the stream routes off; anything else leaves them on. */
function jobStreamsEnabled(env: NodeJS.ProcessEnv): boolean {
  return (env['W2L_JOB_STREAMS'] ?? '').trim().toLowerCase() !== 'off'
}

export const JOB_STREAMS_OFF_NOTICE = 'job streams off (W2L_JOB_STREAMS=off): GET /v1/crawl/:id/events, /v1/batches/:id/events and the /ws routes answer 404; clients poll the status and listing routes'

export function parseListen(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ListenConfig {
  const hosted = argv.includes('--hosted') || env['W2L_API_MODE'] === 'hosted'
  const port = parsePort(argv, env)
  const tokens = readTokens(argv, env)
  const rateLimit = parseRateLimit(argv, env)
  const workerCount = parseWorkerCount(env)
  const accessGrant = readAccessGrant(argv, env, hosted)
  const browserEngine = browserEngineChoice(env, accessGrant, hosted)
  const engineNotice = browserEngine === 'playwright' ? [] : [`browser engine: ${browserEngine} on the public browser rung (ADR 0005 enhanced_browser); saved logins and managed sessions keep stock Playwright`]
  const compatHosts = compatHostsChoice(env, accessGrant, hosted)
  const egressList = readEgressProxies(env, accessGrant, hosted)
  const egressEchoUrl = readEgressEchoUrl(env, egressList)
  const egressNotice = egressList.length === 0 ? [] : [`egress proxies (ADR 0005 egress_sessions): ${egressList.map((proxy) => proxy.endpoint).join(', ')}; a batch or crawl keeps one for its run and moves on only when the proxy itself fails its probe (at most 2 times), never after a block, a challenge, a 429 or a site's reset; a scrape takes the next healthy one${egressEchoUrl === null ? '' : `; each is asked where it leaves from at ${new URL(egressEchoUrl).host}`}`]
  const compatNotice = compatHosts.length === 0 ? [] : [`compatible transport (ADR 0005 compatible_transport): ${COMPAT_LIBRARY.name} ${COMPAT_LIBRARY.version}, profile ${DEFAULT_COMPAT_PROFILE}, in place of the http rung for standard-mode pages on ${compatHosts.join(', ')} and their subdomains${(env.W2L_COMPAT_HOSTS ?? '').trim() === '' ? ' (the hosts its acceptance showed it helps, research/access/benefit-hosts.v1.json; W2L_COMPAT_HOSTS names others, none turns it off)' : ''}; a request with custom headers or mobile keeps the http rung`]
  if (hosted) {
    if (tokens.length === 0) {
      throw new Error('hosted mode requires --token, W2L_API_TOKEN or W2L_API_TOKENS')
    }
    return {
      mode: 'hosted',
      host: readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '0.0.0.0',
      port,
      workerCount,
      tokens,
      // Hosted SSRF guarantees depend on direct, DNS-pinned connections.
      networkPolicy: withOperatorContact(tunedPolicy(hostedNetworkPolicy(), env), env),
      defaultMaxPages: 100,
      mapMaxLimit: HOSTED_MAP_MAX_LIMIT,
      mapMaxTimeoutMs: HOSTED_MAP_MAX_TIMEOUT_MS,
      allowRobotsOverride: false,
      notices: [hostedProxyNotice(env), ...(jobStreamsEnabled(env) ? [] : [JOB_STREAMS_OFF_NOTICE]), ...(accessGrant === null ? [] : [accessGrantNotice(accessGrant)])].filter(notice => notice !== null),
      ...(rateLimit === undefined ? {} : { rateLimit }),
      delivery: deliveryConfig('hosted', env),
      jobStreams: jobStreamsEnabled(env),
      accessGrant,
      browserEngine,
      compatHosts,
      egressProxies: egressList,
      egressEchoUrl,
    }
  }
  const networkPolicy = withOperatorContact(withEnvironmentProxy(tunedPolicy(localNetworkPolicy(), env), env), env)
  const host = readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '127.0.0.1'
  // A local server fetches the person's localhost and network for its callers: one other machines can reach, or a web page that
  // rebinds a name to it, answers only callers that hold a token.
  if (!LOOPBACK_HOSTS.has(host.toLowerCase()) && tokens.length === 0) {
    throw new Error(`listening on ${host} needs a token: other machines, and web pages, could use this server to read your localhost and network. Give one with --token or W2L_API_TOKEN, or listen on 127.0.0.1`)
  }
  return {
    mode: 'local',
    host,
    port,
    workerCount,
    tokens,
    networkPolicy,
    defaultMaxPages: null,
    mapMaxLimit: MAX_MAP_LIMIT,
    mapMaxTimeoutMs: MAX_MAP_TIMEOUT_MS,
    allowRobotsOverride: true,
    notices: [...(networkPolicy.egressProxy ? [describeEgressProxy(networkPolicy.egressProxy)] : []), ...(jobStreamsEnabled(env) ? [] : [JOB_STREAMS_OFF_NOTICE]), ...(accessGrant === null ? [] : [accessGrantNotice(accessGrant)]), ...engineNotice, ...compatNotice, ...egressNotice],
    ...(rateLimit === undefined ? {} : { rateLimit }),
    delivery: deliveryConfig('local', env),
    jobStreams: jobStreamsEnabled(env),
    accessGrant,
    browserEngine,
    compatHosts,
    egressProxies: egressList,
    egressEchoUrl,
  }
}

/** The delivery policy of a mode: the public egress rule, plus the local allowlist and plain-http loopback locally; `W2L_DELIVERY_PRIVATE_ALLOWLIST` extends either. */
export function deliveryConfig(mode: ApiMode, env: NodeJS.ProcessEnv = process.env): DeliveryConfig {
  const extra = (env['W2L_DELIVERY_PRIVATE_ALLOWLIST'] ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  const policy = hostedNetworkPolicy()
  policy.privateAllowlist = [...(mode === 'local' ? LOCAL_PRIVATE_ALLOWLIST : []), ...extra]
  const proxyUrl = (env['W2L_DELIVERY_PROXY_URL'] ?? '').trim()
  const caFile = (env['W2L_DELIVERY_CA_FILE'] ?? '').trim()
  const reach = mode === 'local' ? 'https receivers on public and local-network addresses, plain http on loopback' : 'https receivers on public addresses' + (extra.length > 0 ? ` and ${extra.join(', ')}` : '')
  const route = proxyUrl.length > 0 ? `through ${proxyUrl}` : 'direct, the environment proxy not used'
  return {
    networkPolicy: policy,
    allowHttpLoopback: mode === 'local',
    ...(proxyUrl.length > 0 ? { proxyUrl } : {}),
    ...(caFile.length > 0 ? { caFile } : {}),
    notice: `webhook deliveries: ${reach}; TLS verified; ${route}`,
  }
}

/** The largest per-minute budget `W2L_RATE_LIMIT_PER_MINUTE` / `--rate-limit-per-minute` takes. */
export const MAX_RATE_LIMIT_PER_MINUTE = 100_000

/** `--rate-limit-per-minute N` wins over `W2L_RATE_LIMIT_PER_MINUTE`; unset or empty means no limit; anything else stops startup. */
function parseRateLimit(argv: readonly string[], env: NodeJS.ProcessEnv): { perMinute: number } | undefined {
  const flag = readFlag(argv, '--rate-limit-per-minute')
  const raw = (flag ?? env['W2L_RATE_LIMIT_PER_MINUTE'] ?? '').trim()
  if (raw.length === 0) return undefined
  const perMinute = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isInteger(perMinute) || perMinute < 1 || perMinute > MAX_RATE_LIMIT_PER_MINUTE) {
    throw new Error(`${flag === undefined ? 'W2L_RATE_LIMIT_PER_MINUTE' : '--rate-limit-per-minute'} must be an integer between 1 and ${MAX_RATE_LIMIT_PER_MINUTE}`)
  }
  return { perMinute }
}

export const MAX_WORKER_COUNT = 64

function parseWorkerCount(env: NodeJS.ProcessEnv): number {
  const raw = (env['W2L_WORKER_COUNT'] ?? '').trim()
  if (raw === '') return 4
  const count = Number(raw)
  if (!/^\d+$/.test(raw) || count < 1 || count > MAX_WORKER_COUNT) throw new Error(`W2L_WORKER_COUNT must be an integer from 1 to ${MAX_WORKER_COUNT}`)
  return count
}

function tunedPolicy(base: NetworkPolicy, env: NodeJS.ProcessEnv): NetworkPolicy {
  const concurrency = env['W2L_PER_HOST_CONCURRENCY'] === undefined ? base.perHostConcurrency : Number(env['W2L_PER_HOST_CONCURRENCY'])
  const delay = env['W2L_PER_HOST_MIN_DELAY_MS'] === undefined ? base.perHostMinDelayMs : Number(env['W2L_PER_HOST_MIN_DELAY_MS'])
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('W2L_PER_HOST_CONCURRENCY must be 1, 2, 3, or 4')
  if (!Number.isInteger(delay) || delay < 1 || delay > 60_000) throw new Error('W2L_PER_HOST_MIN_DELAY_MS must be 1..60000')
  return { ...base, perHostConcurrency: concurrency, perHostMinDelayMs: delay }
}

export function parsePort(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): number {
  const raw = readFlag(argv, '--port') ?? env['W2L_API_PORT'] ?? '8787'
  const port = Number(raw)
  if (!Number.isFinite(port) || port < 1) throw new Error('--port must be a positive integer')
  return port
}

/**
 * Every `--token` on the command line; without one, W2L_API_TOKEN and the
 * comma-separated W2L_API_TOKENS. Command-line tokens replace the
 * environment's, as `--token` has always replaced W2L_API_TOKEN. A `--token`
 * that is last, followed by another flag or blank stops startup; the error
 * never repeats a token.
 */
function readTokens(argv: readonly string[], env: NodeJS.ProcessEnv): readonly string[] {
  const flags: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const inline = arg.startsWith('--token=')
    const value = inline ? arg.slice('--token='.length) : arg === '--token' ? argv[++i] : null
    if (value === null) continue
    if (value === undefined || !inline && value.startsWith('--') || value.trim() === '') {
      throw new Error('--token needs a value: use --token <token> or --token=<token>, or set W2L_API_TOKEN')
    }
    flags.push(value)
  }
  const listed = flags.length > 0 ? flags : [env['W2L_API_TOKEN'] ?? '', ...(env['W2L_API_TOKENS'] ?? '').split(',')]
  return [...new Set(listed.map((token) => token.trim()).filter((token) => token.length > 0))]
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`))
  if (eq !== undefined) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1]
  return undefined
}
