import { describeEgressProxy, hostedNetworkPolicy, hostedProxyNotice, LOCAL_PRIVATE_ALLOWLIST, localNetworkPolicy, withEnvironmentProxy, withOperatorContact, type NetworkPolicy } from '@w2l/contracts'

export type ApiMode = 'local' | 'hosted'

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
  /**
   * Whether a scrape or batch may carry a recorded robots override. A local
   * server's user decides that for their own fetches; a hosted server takes
   * none, whoever holds a token.
   */
  allowRobotsOverride: boolean
  /** Startup lines about the environment proxy, printed once. */
  notices: readonly string[]
  /**
   * The per-caller budget for requests that start work (`W2L_RATE_LIMIT_PER_MINUTE`
   * or `--rate-limit-per-minute`), per bearer token; absent means no limit.
   */
  rateLimit?: { perMinute: number }
  /** How this process delivers job webhooks. */
  delivery: DeliveryConfig
}

export function parseListen(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ListenConfig {
  const hosted = argv.includes('--hosted') || env['W2L_API_MODE'] === 'hosted'
  const port = parsePort(argv, env)
  const tokens = readTokens(argv, env)
  const rateLimit = parseRateLimit(argv, env)
  if (hosted) {
    if (tokens.length === 0) {
      throw new Error('hosted mode requires --token, W2L_API_TOKEN or W2L_API_TOKENS')
    }
    return {
      mode: 'hosted',
      host: readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '0.0.0.0',
      port,
      tokens,
      // Hosted SSRF guarantees depend on direct, DNS-pinned connections.
      networkPolicy: withOperatorContact(tunedPolicy(hostedNetworkPolicy(), env), env),
      defaultMaxPages: 100,
      allowRobotsOverride: false,
      notices: [hostedProxyNotice(env)].filter(notice => notice !== null),
      ...(rateLimit === undefined ? {} : { rateLimit }),
      delivery: deliveryConfig('hosted', env),
    }
  }
  const networkPolicy = withOperatorContact(withEnvironmentProxy(tunedPolicy(localNetworkPolicy(), env), env), env)
  return {
    mode: 'local',
    host: readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '127.0.0.1',
    port,
    tokens,
    networkPolicy,
    defaultMaxPages: null,
    allowRobotsOverride: true,
    notices: networkPolicy.egressProxy ? [describeEgressProxy(networkPolicy.egressProxy)] : [],
    ...(rateLimit === undefined ? {} : { rateLimit }),
    delivery: deliveryConfig('local', env),
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
