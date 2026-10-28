/**
 * The address guard of the browser-compatible transport on a hosted engine (ADR 0005 `compatible_transport`, ROADMAP
 * stage H item 2). impit resolves host names itself and takes no resolver, so the undici lane's guarded lookup, which
 * checks every address a name resolves to and connects only to a checked one (egress.ts createGuardedDispatcher), does
 * not reach it, and a name could resolve to one address at the lane's check and to another at impit's connect.
 *
 * The guard is a SOCKS5 server (RFC 1928) on 127.0.0.1 in the same process, which a hosted transport gives impit as its
 * proxy (`socks5h://`, so impit sends the name, not an address it resolved). For each connection it resolves the name
 * itself, checks the name and every address as the guarded lookup does (evaluateHostname, then evaluateResolved, under
 * the lane's policy), and connects only to an address it checked, IPv4 first. A refused address is answered "not allowed
 * by ruleset" (0x02) and a name that does not resolve "host unreachable" (0x04): the transport reports them as the
 * undici lane does, SsrfDeniedError and DnsLookupError. Once connected it only passes bytes: impit's own TLS handshake
 * and HTTP/2 reach the site unchanged, and the certificate is impit's to check.
 *
 * The port takes a login (RFC 1929) the guard makes up when it starts and gives impit alone, so no other client on the
 * machine can use it; it takes CONNECT alone, and the policy's checks hold for whoever connects.
 *
 * The same guard stands before ADR 0005 `hosted_chrome` (revision of 2026-10-27): Chrome is given it as its only proxy
 * (hostedChromeProxy), sends it every name, and reaches nothing the guard did not check. Chrome takes no SOCKS login, so
 * that guard listens without one (`login: false`); its checks hold for whoever connects, which on the Chrome service is
 * that Chrome alone. What carries a checked connection on is the guard's `dial`: by default a direct connection, and an
 * egress proxy's tunnel to the checked address once hosted_chrome has one. Either way a name reaches no proxy before it
 * has been resolved and checked, and the proxy is handed the checked address, never the name, so it cannot resolve the
 * name again to an address the guard never saw.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { connect, createServer, isIP, type Server, type Socket } from 'node:net'
import { evaluateHostname, evaluateResolved, type NetworkPolicy } from '@w2l/contracts'

/** How the guard resolves a name; dns.lookup's shape, so a test can name the addresses. */
export type GuardResolver = (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>

/**
 * How the guard reaches an address it checked: a socket that emits `connect` once bytes can pass, or `error`; or a promise
 * of a socket bytes can already pass on (an egress proxy's tunnel, handed over once the proxy agreed), rejected with the
 * connection's error. The address is always one the guard checked, never a name.
 */
export type GuardDial = (address: string, port: number) => Socket | Promise<Socket>

export interface AddressGuardOptions {
  /** Whether a client must log in (RFC 1929). Default true; false for a client that takes no SOCKS login (Chrome). */
  login?: boolean
  /** How a checked connection is carried on. Default a direct connection to the checked address. */
  dial?: GuardDial
}

/** The SOCKS5 replies the guard gives (RFC 1928 §6); the transport reads the first two by impit's names for them. */
const REPLY = { succeeded: 0, failure: 1, notAllowed: 2, networkUnreachable: 3, hostUnreachable: 4, refused: 5, timedOut: 6, commandNotSupported: 7, addressNotSupported: 8 } as const
/** How long a client has to log in and name its destination. */
const HANDSHAKE_MS = 10_000
/** How long the guard waits for the site's connection; the transport's own deadline ends a request first. */
const CONNECT_MS = 30_000

/** A socket's bytes, read a message at a time while the guard negotiates; paused once it has what it needs. */
function messages(socket: Socket): { read: (n: number) => Promise<Buffer>; rest: () => Buffer; stop: () => void } {
  let buffer = Buffer.alloc(0)
  let waiting: { n: number; resolve: (bytes: Buffer) => void; reject: (error: Error) => void } | null = null
  const pump = () => {
    if (waiting === null || buffer.length < waiting.n) return
    const { n, resolve } = waiting
    waiting = null
    const bytes = buffer.subarray(0, n)
    buffer = buffer.subarray(n)
    resolve(bytes)
  }
  const onData = (chunk: Buffer) => { buffer = Buffer.concat([buffer, chunk]); pump() }
  const onEnd = () => { waiting?.reject(new Error('the client left during the handshake')); waiting = null }
  socket.on('data', onData)
  socket.on('close', onEnd)
  return {
    read: (n) => new Promise((resolve, reject) => { waiting = { n, resolve, reject }; pump() }),
    rest: () => buffer,
    // Paused first: no byte arrives with no listener while the guard connects to the site.
    stop: () => { socket.pause(); socket.off('data', onData); socket.off('close', onEnd) },
  }
}

/** The answer to a CONNECT: the reply code, and nothing bound (BND.ADDR 0.0.0.0, BND.PORT 0). */
function reply(code: number): Buffer {
  return Buffer.from([5, code, 0, 1, 0, 0, 0, 0, 0, 0])
}

/** A connection error as the guard answers it; 0x04 is kept for a name that does not resolve. */
function connectReply(error: NodeJS.ErrnoException): number {
  if (error.code === 'ECONNREFUSED') return REPLY.refused
  if (error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') return REPLY.networkUnreachable
  if (error.code === 'ETIMEDOUT') return REPLY.timedOut
  return REPLY.failure
}

export class CompatAddressGuard {
  private readonly user = randomBytes(16).toString('hex')
  private readonly password = randomBytes(16).toString('hex')
  private readonly sockets = new Set<Socket>()
  private listening: Promise<{ server: Server; port: number }> | null = null
  private closed = false
  private readonly login: boolean
  private readonly dial: GuardDial

  constructor(private readonly policy: NetworkPolicy, private readonly resolve: GuardResolver = lookup, options: AddressGuardOptions = {}) {
    if (policy.egressProxy != null) throw new Error('the address guard connects to the site itself: not with an egress proxy')
    this.login = options.login !== false
    this.dial = options.dial ?? ((host, port) => connect({ host, port }))
  }

  /**
   * The proxy a client is given, the server started on first use: `socks5h://<login>@127.0.0.1:<port>` for impit, or
   * `socks5://127.0.0.1:<port>` without a login, the form Chrome reads (Chrome sends names to a SOCKS5 proxy).
   */
  async proxyUrl(): Promise<string> {
    if (this.closed) throw new Error('the address guard is closed')
    this.listening ??= new Promise((resolve, reject) => {
      const server = createServer((socket) => this.serve(socket))
      server.once('error', reject)
      // A guard left open does not keep the process alive; the transport closes it with its lane.
      server.listen(0, '127.0.0.1', () => { server.unref(); resolve({ server, port: (server.address() as { port: number }).port }) })
    })
    const { port } = await this.listening
    return this.login ? `socks5h://${this.user}:${this.password}@127.0.0.1:${port}` : `socks5://127.0.0.1:${port}`
  }

  /** Stops listening and ends every connection it passes. */
  async close(): Promise<void> {
    this.closed = true
    for (const socket of this.sockets) socket.destroy()
    const listening = this.listening
    if (listening === null) return
    const { server } = await listening.catch(() => ({ server: null }))
    if (server !== null) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private serve(client: Socket): void {
    this.sockets.add(client)
    client.on('close', () => this.sockets.delete(client))
    client.on('error', () => {})
    client.setTimeout(HANDSHAKE_MS, () => client.destroy())
    void this.negotiate(client).catch(() => client.destroy())
  }

  private async negotiate(client: Socket): Promise<void> {
    const input = messages(client)
    // The greeting: the methods offered. A guard with a login takes only a login; one without, only no login.
    const [version, count] = await input.read(2)
    if (version !== 5) return void client.destroy()
    const methods = await input.read(count!)
    const method = this.login ? 2 : 0
    if (!methods.includes(method)) return void client.end(Buffer.from([5, 0xff]))
    client.write(Buffer.from([5, method]))
    if (this.login) {
      // The login (RFC 1929).
      const [, userLength] = await input.read(2)
      const user = await input.read(userLength!)
      const [passwordLength] = await input.read(1)
      const password = await input.read(passwordLength!)
      if (!same(user, this.user) || !same(password, this.password)) return void client.end(Buffer.from([1, 1]))
      client.write(Buffer.from([1, 0]))
    }
    // The request: CONNECT alone, to an IPv4 address, a name or an IPv6 address.
    const [, command, , type] = await input.read(4)
    let host: string
    if (type === 1) host = [...await input.read(4)].join('.')
    else if (type === 3) host = (await input.read((await input.read(1))[0]!)).toString('latin1')
    else if (type === 4) host = ipv6(await input.read(16))
    else return void client.end(reply(REPLY.addressNotSupported))
    const port = (await input.read(2)).readUInt16BE(0)
    if (command !== 1) return void client.end(reply(REPLY.commandNotSupported))
    const target = await this.check(host)
    // The client may have left, or the guard closed, while the name resolved: then nothing is opened for it.
    if (client.destroyed || client.readableEnded || this.closed) return void client.destroy()
    if (typeof target === 'number') return void client.end(reply(target))
    input.stop()
    client.setTimeout(0)
    this.open(client, target, port, input.rest())
  }

  /**
   * The address to connect to for `host`, checked as the guarded lookup checks it; or the reply that refuses it. A literal
   * is connected to only in a form Node reads as an address: another (012.0.0.1) would go to the system resolver, which
   * may read it otherwise (as octal, 10.0.0.1) than the check did.
   */
  private async check(host: string): Promise<string | number> {
    const literal = evaluateHostname(host, this.policy)
    if (literal !== null) return literal.allowed && literal.pinnedAddress !== null && isIP(literal.pinnedAddress) !== 0 ? literal.pinnedAddress : REPLY.notAllowed
    let records: { address: string }[]
    try { records = await this.resolve(host.toLowerCase(), { all: true }) } catch { return REPLY.hostUnreachable }
    if (records.length === 0) return REPLY.hostUnreachable
    const verdict = evaluateResolved(host.toLowerCase(), records.map((record) => record.address), this.policy)
    if (!verdict.allowed || verdict.pinnedAddress === null) return REPLY.notAllowed
    return records.find((record) => isIP(record.address) === 4)?.address ?? verdict.pinnedAddress
  }

  /**
   * Connects to the checked address (through `dial`) and passes bytes both ways. A side that ends sends its end on (pipe), so a response
   * the site ends with its connection reaches impit whole; a side that fails or leaves ends the other.
   */
  private open(client: Socket, address: string, port: number, early: Buffer): void {
    let dialled: Socket | Promise<Socket>
    try { dialled = this.dial(address, port) } catch { return void client.end(reply(REPLY.failure)) }
    if (dialled instanceof Promise) {
      // A tunnel the dial opens itself, within its own deadline: handed over connected, or its error answered.
      dialled.then((site) => {
        if (client.destroyed || this.closed) return void site.destroy()
        this.pass(client, site, early, true)
      }, (error: NodeJS.ErrnoException) => { if (!client.destroyed) client.end(reply(connectReply(error))) })
      return
    }
    this.pass(client, dialled, early, false)
  }

  /** Passes bytes between the client and the site's socket, once it is connected (`connected`: it is already). */
  private pass(client: Socket, site: Socket, early: Buffer, connected: boolean): void {
    this.sockets.add(site)
    const timer = connected ? undefined : setTimeout(() => site.destroy(Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })), CONNECT_MS)
    const start = () => {
      connected = true
      clearTimeout(timer)
      client.write(reply(REPLY.succeeded))
      if (early.length > 0) site.write(early)
      client.pipe(site)
      site.pipe(client)
    }
    if (connected) start()
    else site.once('connect', start)
    site.on('error', (error: NodeJS.ErrnoException) => {
      if (!connected && !client.destroyed) client.end(reply(connectReply(error)))
      else client.destroy()
    })
    site.on('close', () => { clearTimeout(timer); this.sockets.delete(site) })
    client.on('close', () => site.destroy())
  }
}

function same(given: Buffer, expected: string): boolean {
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

function ipv6(bytes: Buffer): string {
  const groups: string[] = []
  for (let i = 0; i < 16; i += 2) groups.push(bytes.readUInt16BE(i).toString(16))
  return groups.join(':')
}
