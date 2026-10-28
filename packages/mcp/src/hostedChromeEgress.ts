/**
 * hosted_chrome's exit on the octocrawl-chrome service (ADR 0005, revision of 2026-10-27, decision three; D2, decided by
 * Howard on 2026-10-29: datacenter proxies).
 *
 * Without a proxy list the service leaves from Cloud Run's own egress (`google`). With one, from the operator's
 * datacenter proxies: a Secret Manager secret mounted as a file (W2L_HOSTED_CHROME_PROXIES_FILE), one `host:port:user:pass`
 * line a proxy. Each read chooses one before its first request and keeps it for all its connections, whatever the site
 * answers (the ADR's one sticky exit a call; no switch after a 429, a 403 or a challenge).
 *
 * The proxy is the address guard's dial (compatGuard.ts): Chrome's every connection reaches the guard first, which
 * resolves and checks the name, and the proxy is asked for a CONNECT tunnel to the checked address alone, never the name,
 * so it cannot resolve the name again to an address the guard never saw. A proxy that refuses the tunnel fails that
 * connection, and the read is judged as the lane judges any failed connection.
 *
 * A record names the proxy by `host:port` alone. The login is sent to the proxy and nowhere else: no message, log line
 * or trace event carries it, and a malformed line is named by its number, never its content.
 */
import { randomInt } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { connect, isIP, type Socket } from 'node:net'
import type { AccessEgressKind } from '@w2l/contracts'
import type { GuardDial } from '@w2l/api'

/** One proxy of the operator's list. */
export interface HostedChromeProxy { host: string; port: number; username: string; password: string }

/** Where the service's reads leave from: the kind the record names, and, for a proxy list, the guard's dial. */
export interface HostedChromeExit {
  kind: AccessEgressKind
  /** The proxies to choose from; 0 for Cloud Run's own egress. */
  count: number
  /** Chooses this read's proxy, before its first request. */
  choose(): void
  /** The proxy the current read leaves through, `host:port` alone; null when it leaves directly or none was chosen. */
  proxy(): string | null
  /** How the guard carries a checked connection on; absent: directly. */
  dial?: GuardDial
}

/** Cloud Run's own egress: no proxy, and nothing to choose. */
export const GOOGLE_EXIT: HostedChromeExit = { kind: 'google', count: 0, choose: () => {}, proxy: () => null }

/** How long a proxy has to agree to a tunnel; the read's own deadline ends it first. */
const TUNNEL_MS = 30_000
/** The longest answer to a CONNECT the dial reads. */
const MAX_TUNNEL_HEAD = 16_384
const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/

/** The operator's list: `host:port:user:pass` a line (the password may hold colons); blank lines and `#` comments skipped. */
export function parseHostedChromeProxies(text: string): HostedChromeProxy[] {
  const proxies: HostedChromeProxy[] = []
  for (const [index, raw] of text.split('\n').entries()) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const [host = '', port = '', username = '', ...rest] = line.split(':')
    const password = rest.join(':')
    const number = Number(port)
    // Named by its number alone: the line holds a login.
    if (!HOST.test(host) || !/^\d{1,5}$/.test(port) || number < 1 || number > 65_535 || username === '' || password === '') {
      throw new Error(`hosted_chrome's proxy list, line ${index + 1}: not host:port:user:pass`)
    }
    proxies.push({ host, port: number, username, password })
  }
  if (proxies.length === 0) throw new Error('hosted_chrome\'s proxy list holds no proxy')
  return proxies
}

/**
 * The operator's datacenter proxies as the service's exit: `choose` picks one for the read (at random, or by `pick`), and
 * `dial` tunnels each checked address through it with its login.
 */
export function datacenterExit(proxies: readonly HostedChromeProxy[], pick: (count: number) => number = (count) => randomInt(count)): HostedChromeExit & { dial: GuardDial } {
  if (proxies.length === 0) throw new Error('hosted_chrome\'s datacenter exit needs at least one proxy')
  let current: HostedChromeProxy | null = null
  return {
    kind: 'datacenter',
    count: proxies.length,
    choose: () => {
      const at = pick(proxies.length)
      current = proxies[Number.isInteger(at) && at >= 0 && at < proxies.length ? at : 0]!
    },
    proxy: () => current === null ? null : `${current.host}:${current.port}`,
    dial: (address, port) => {
      if (current === null) return Promise.reject(new Error('hosted_chrome chose no proxy for this read'))
      return tunnel(current, address, port)
    },
  }
}

/** A CONNECT tunnel through `proxy` to the checked `address`, handed over once the proxy answered 200. */
function tunnel(proxy: HostedChromeProxy, address: string, port: number): Promise<Socket> {
  const authority = isIP(address) === 6 ? `[${address}]:${port}` : `${address}:${port}`
  const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')
  return new Promise((resolve, reject) => {
    const socket = connect({ host: proxy.host, port: proxy.port })
    let head = Buffer.alloc(0)
    const fail = (error: Error) => { cleanup(); socket.destroy(); reject(error) }
    const timer = setTimeout(() => fail(Object.assign(new Error('the proxy did not open a tunnel in time'), { code: 'ETIMEDOUT' })), TUNNEL_MS)
    const onError = (error: Error) => fail(Object.assign(new Error('the proxy could not be reached'), { code: (error as NodeJS.ErrnoException).code }))
    const onClose = () => fail(new Error('the proxy closed the connection before the tunnel opened'))
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk])
      const end = head.indexOf('\r\n\r\n')
      if (end < 0) { if (head.length > MAX_TUNNEL_HEAD) fail(new Error('the proxy\'s answer to CONNECT is too long')); return }
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(head.subarray(0, end).toString('latin1'))?.[1] ?? 'no status'
      if (status !== '200') return fail(Object.assign(new Error(`the proxy refused the tunnel (${status})`), { code: status === '407' ? 'EPROXYAUTH' : 'ECONNREFUSED' }))
      cleanup()
      // What the site sent after the proxy's answer goes back on the socket, read by whoever pipes it next.
      socket.pause()
      const rest = head.subarray(end + 4)
      if (rest.length > 0) socket.unshift(rest)
      resolve(socket)
    }
    const cleanup = () => { clearTimeout(timer); socket.off('data', onData); socket.off('error', onError); socket.off('close', onClose) }
    socket.on('data', onData)
    socket.once('error', onError)
    socket.once('close', onClose)
    socket.once('connect', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\nProxy-Authorization: Basic ${auth}\r\n\r\n`))
  })
}

/**
 * The exit the environment names: W2L_HOSTED_CHROME_PROXIES_FILE, the mounted secret's path, for the datacenter proxies;
 * unset, Cloud Run's own egress. A file named and not read, or a list that does not parse, stops the start.
 */
export async function hostedChromeExitFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<HostedChromeExit> {
  const path = env.W2L_HOSTED_CHROME_PROXIES_FILE?.trim() ?? ''
  if (path === '') return GOOGLE_EXIT
  let text: string
  try { text = await readFile(path, 'utf8') } catch (error) {
    throw new Error(`W2L_HOSTED_CHROME_PROXIES_FILE could not be read (${(error as NodeJS.ErrnoException).code ?? 'error'}): mount the proxy secret there, or unset it to leave from Cloud Run's own egress`)
  }
  return datacenterExit(parseHostedChromeProxies(text))
}
