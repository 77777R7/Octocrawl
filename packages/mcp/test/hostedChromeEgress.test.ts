import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { connect, createServer, type AddressInfo, type Server, type Socket } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostedNetworkPolicy, type NetworkPolicy } from '@w2l/contracts'
import { CompatAddressGuard, type GuardResolver } from '@w2l/api'
import { datacenterExit, GOOGLE_EXIT, hostedChromeExitFromEnv, parseHostedChromeProxies } from '../src/hostedChromeEgress.js'

// hosted_chrome's datacenter exit (ADR 0005 decision three, D2 of 2026-10-29): the operator's proxies, one chosen per
// read, each connection checked by the address guard before it reaches the proxy. Every login here is made up.

const LOGIN = { user: 'made-up-user', pass: 'made-up-pass-7f3a' }

/** A CONNECT proxy on loopback that keeps each target and login it was given, then tunnels to the target. */
async function fakeProxy(answer = 200): Promise<{ server: Server; port: number; asked: { target: string; auth: string | null }[] }> {
  const asked: { target: string; auth: string | null }[] = []
  const server = createServer((client: Socket) => {
    let head = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      head = Buffer.concat([head, chunk])
      const end = head.indexOf('\r\n\r\n')
      if (end < 0) return
      client.off('data', onData)
      const lines = head.subarray(0, end).toString('latin1').split('\r\n')
      const target = lines[0]!.split(' ')[1]!
      const auth = lines.find((line) => line.toLowerCase().startsWith('proxy-authorization:'))?.slice(20).trim() ?? null
      asked.push({ target, auth })
      if (answer !== 200) return void client.end(`HTTP/1.1 ${answer} No\r\n\r\n`)
      const [host, port] = [target.slice(0, target.lastIndexOf(':')), Number(target.slice(target.lastIndexOf(':') + 1))]
      const upstream = connect({ host, port }, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        const rest = head.subarray(end + 4)
        if (rest.length > 0) upstream.write(rest)
        client.pipe(upstream)
        upstream.pipe(client)
      })
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
    }
    client.on('data', onData)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, port: (server.address() as AddressInfo).port, asked }
}

let site: HttpServer
let sitePort = 0
beforeAll(async () => {
  site = createHttpServer((_req, res) => res.writeHead(200, { 'content-type': 'text/plain' }).end('tide ledger'))
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  sitePort = (site.address() as AddressInfo).port
})
afterAll(async () => {
  site.closeAllConnections()
  await new Promise<void>((resolve) => site.close(() => resolve()))
})

const policy: NetworkPolicy = { ...hostedNetworkPolicy(), origin: 'operator', privateAllowlist: ['pinned.test'] }
const resolver: GuardResolver = async (name) => ({ 'pinned.test': [{ address: '127.0.0.1', family: 4 }], 'inside.test': [{ address: '10.0.0.7', family: 4 }] } as Record<string, { address: string; family: number }[]>)[name] ?? []

/** GET through the guard's SOCKS5 port (no login), naming `name`; answers what came back. */
const getThrough = (guardUrl: string, name: string) => new Promise<string>((resolve, reject) => {
  const proxy = new URL(guardUrl)
  const socket = connect(Number(proxy.port), '127.0.0.1')
  let got = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    const before = got.length
    got = Buffer.concat([got, chunk])
    if (before < 12 && got.length >= 12 && got[3] === 0) socket.write(`GET / HTTP/1.1\r\nHost: ${name}\r\nConnection: close\r\n\r\n`)
  })
  socket.on('error', reject)
  socket.on('close', () => resolve(got.toString('latin1')))
  const host = Buffer.from(name)
  socket.write(Buffer.from([5, 1, 0]))
  socket.write(Buffer.from([5, 1, 0, 3, host.length, ...host, sitePort >> 8, sitePort & 0xff]))
})

describe('the operator\'s proxy list', () => {
  it('reads host:port:user:pass lines, skipping blank lines and comments', () => {
    expect(parseHostedChromeProxies(`# made up\n198.51.100.7:8080:${LOGIN.user}:${LOGIN.pass}\n\n proxy.example.net:3128:u:p:with:colons \r\n`)).toEqual([
      { host: '198.51.100.7', port: 8080, username: LOGIN.user, password: LOGIN.pass },
      { host: 'proxy.example.net', port: 3128, username: 'u', password: 'p:with:colons' },
    ])
  })

  it('refuses a malformed line by its number, never by its content, and an empty list', () => {
    for (const text of [`198.51.100.7:8080:${LOGIN.user}`, `198.51.100.7:http:${LOGIN.user}:${LOGIN.pass}`, `198.51.100.7:70000:${LOGIN.user}:${LOGIN.pass}`, `:8080:${LOGIN.user}:${LOGIN.pass}`]) {
      let message = ''
      try { parseHostedChromeProxies(`# first\n${text}`) } catch (error) { message = (error as Error).message }
      expect(message).toMatch(/line 2/)
      expect(message).not.toContain(LOGIN.user)
      expect(message).not.toContain(LOGIN.pass)
    }
    expect(() => parseHostedChromeProxies('# nothing\n\n')).toThrow(/no proxy/)
  })
})

describe('the exit from the environment', () => {
  it('is Cloud Run\'s own without the variable; the list from the mounted file with it; refuses a file it cannot read', async () => {
    expect(await hostedChromeExitFromEnv({})).toBe(GOOGLE_EXIT)
    expect(await hostedChromeExitFromEnv({ W2L_HOSTED_CHROME_PROXIES_FILE: ' ' })).toBe(GOOGLE_EXIT)
    const dir = await mkdtemp(join(tmpdir(), 'w2l-hosted-chrome-egress-'))
    try {
      const file = join(dir, 'proxies')
      await writeFile(file, `198.51.100.7:8080:${LOGIN.user}:${LOGIN.pass}\n198.51.100.8:8080:${LOGIN.user}:${LOGIN.pass}\n`)
      const exit = await hostedChromeExitFromEnv({ W2L_HOSTED_CHROME_PROXIES_FILE: file })
      expect(exit.kind).toBe('datacenter')
      expect(exit.count).toBe(2)
      await expect(hostedChromeExitFromEnv({ W2L_HOSTED_CHROME_PROXIES_FILE: join(dir, 'missing') })).rejects.toThrow(/W2L_HOSTED_CHROME_PROXIES_FILE/)
      await writeFile(file, `198.51.100.7:8080:${LOGIN.user}\n`)
      const refusal = await hostedChromeExitFromEnv({ W2L_HOSTED_CHROME_PROXIES_FILE: file }).catch((error: Error) => error.message)
      expect(refusal).toMatch(/line 1/)
      expect(refusal).not.toContain(LOGIN.user)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

describe('the datacenter exit behind the address guard', () => {
  it('tunnels each checked address through the chosen proxy with its login, names it by host:port alone, and never sees a refused one', async () => {
    const proxy = await fakeProxy()
    const other = await fakeProxy()
    const proxies = [{ host: '127.0.0.1', port: proxy.port, username: LOGIN.user, password: LOGIN.pass }, { host: '127.0.0.1', port: other.port, username: 'x', password: 'y' }]
    let pick = 0
    const exit = datacenterExit(proxies, () => pick)
    const guard = new CompatAddressGuard(policy, resolver, { login: false, dial: exit.dial })
    try {
      // Before any read chose one, nothing is dialled.
      expect(exit.proxy()).toBeNull()
      exit.choose()
      expect(exit.proxy()).toBe(`127.0.0.1:${proxy.port}`)
      const url = await guard.proxyUrl()
      expect(await getThrough(url, 'pinned.test')).toContain('tide ledger')
      // The proxy was given the address the guard checked, never the name, with the chosen login.
      expect(proxy.asked).toEqual([{ target: `127.0.0.1:${sitePort}`, auth: `Basic ${Buffer.from(`${LOGIN.user}:${LOGIN.pass}`).toString('base64')}` }])
      // A private address is refused by the guard before any proxy hears of it.
      expect(await getThrough(url, 'inside.test')).not.toContain('tide ledger')
      expect(proxy.asked).toHaveLength(1)
      // The next read's choice holds for all its connections.
      pick = 1
      exit.choose()
      expect(exit.proxy()).toBe(`127.0.0.1:${other.port}`)
      expect(await getThrough(url, 'pinned.test')).toContain('tide ledger')
      expect([proxy.asked.length, other.asked.length]).toEqual([1, 1])
    } finally {
      await guard.close()
      for (const server of [proxy.server, other.server]) await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('answers a proxy that refuses the tunnel as a failed connection, naming its status and no login', async () => {
    const proxy = await fakeProxy(407)
    const exit = datacenterExit([{ host: '127.0.0.1', port: proxy.port, username: LOGIN.user, password: LOGIN.pass }])
    exit.choose()
    try {
      const error = await Promise.resolve(exit.dial('127.0.0.1', sitePort)).then(() => null, (failure: Error) => failure)
      expect(error?.message).toMatch(/407/)
      expect(error?.message).not.toContain(LOGIN.pass)
      expect(error?.message).not.toContain(LOGIN.user)
    } finally { await new Promise<void>((resolve) => proxy.server.close(() => resolve())) }
  })
})
