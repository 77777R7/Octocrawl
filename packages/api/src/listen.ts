import { describeEgressProxy, hostedNetworkPolicy, hostedProxyNotice, localNetworkPolicy, withEnvironmentProxy, withOperatorContact, type NetworkPolicy } from '@w2l/contracts'

export type ApiMode = 'local' | 'hosted'

export interface ListenConfig {
  mode: ApiMode
  host: string
  port: number
  token: string | null
  networkPolicy: NetworkPolicy
  defaultMaxPages: number | null
  /** Startup lines about the environment proxy, printed once. */
  notices: readonly string[]
}

export function parseListen(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): ListenConfig {
  const hosted = argv.includes('--hosted') || env['W2L_API_MODE'] === 'hosted'
  const port = parsePort(argv, env)
  const token = readFlag(argv, '--token') ?? env['W2L_API_TOKEN'] ?? null
  if (hosted) {
    if (token === null || token.length === 0) {
      throw new Error('hosted mode requires --token or W2L_API_TOKEN')
    }
    return {
      mode: 'hosted',
      host: readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '0.0.0.0',
      port,
      token,
      // Hosted SSRF guarantees depend on direct, DNS-pinned connections.
      networkPolicy: withOperatorContact(tunedPolicy(hostedNetworkPolicy(), env), env),
      defaultMaxPages: 100,
      notices: [hostedProxyNotice(env)].filter(notice => notice !== null),
    }
  }
  const networkPolicy = withOperatorContact(withEnvironmentProxy(tunedPolicy(localNetworkPolicy(), env), env), env)
  return {
    mode: 'local',
    host: readFlag(argv, '--host') ?? env['W2L_API_HOST'] ?? '127.0.0.1',
    port,
    token,
    networkPolicy,
    defaultMaxPages: null,
    notices: networkPolicy.egressProxy ? [describeEgressProxy(networkPolicy.egressProxy)] : [],
  }
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

function readFlag(argv: readonly string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`))
  if (eq !== undefined) return eq.slice(name.length + 1)
  const idx = argv.indexOf(name)
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1]
  return undefined
}
