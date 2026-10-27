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
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { connect, createServer, isIP, type Server, type Socket } from 'node:net'
import { evaluateHostname, evaluateResolved, type NetworkPolicy } from '@w2l/contracts'

/** How the guard resolves a name; dns.lookup's shape, so a test can name the addresses. */
export type GuardResolver = (hostname: string, options: { all: true }) => Promise<{ address: string; family: number }[]>

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

  constructor(private readonly policy: NetworkPolicy, private readonly resolve: GuardResolver = lookup) {
    if (policy.egressProxy != null) throw new Error('the address guard connects to the site itself: not with an egress proxy')
  }

  /** The proxy impit is given: `socks5h://<login>@127.0.0.1:<port>`, the server started on first use. */
  async proxyUrl(): Promise<string> {
    if (this.closed) throw new Error('the address guard is closed')
    this.listening ??= new Promise((resolve, reject) => {
      const server = createServer((socket) => this.serve(socket))
      server.once('error', reject)
      // A guard left open does not keep the process alive; the transport closes it with its lane.
      server.listen(0, '127.0.0.1', () => { server.unref(); resolve({ server, port: (server.address() as { port: number }).port }) })
    })
    const { port } = await this.listening
    return `socks5h://${this.user}:${this.password}@127.0.0.1:${port}`
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
    // The greeting: the methods offered. Only a login is taken.
    const [version, count] = await input.read(2)
    if (version !== 5) return void client.destroy()
    const methods = await input.read(count!)
    if (!methods.includes(2)) return void client.end(Buffer.from([5, 0xff]))
    client.write(Buffer.from([5, 2]))
    // The login (RFC 1929).
    const [, userLength] = await input.read(2)
    const user = await input.read(userLength!)
    const [passwordLength] = await input.read(1)
    const password = await input.read(passwordLength!)
    if (!same(user, this.user) || !same(password, this.password)) return void client.end(Buffer.from([1, 1]))
    client.write(Buffer.from([1, 0]))
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
   * Connects to the checked address and passes bytes both ways. A side that ends sends its end on (pipe), so a response
   * the site ends with its connection reaches impit whole; a side that fails or leaves ends the other.
   */
  private open(client: Socket, address: string, port: number, early: Buffer): void {
    const site = connect({ host: address, port })
    this.sockets.add(site)
    const timer = setTimeout(() => site.destroy(Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' })), CONNECT_MS)
    let connected = false
    site.once('connect', () => {
      connected = true
      clearTimeout(timer)
      client.write(reply(REPLY.succeeded))
      if (early.length > 0) site.write(early)
      client.pipe(site)
      site.pipe(client)
    })
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
