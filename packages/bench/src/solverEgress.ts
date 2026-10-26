/**
 * The run's solver exit (ADR 0005, revision of 2026-10-25): a local forward proxy on 127.0.0.1 that sends everything to
 * the operator's sticky exit (W2L_SOLVER_PROXY) with its login. The installed Chrome takes no proxy login on its command
 * line, so every rung of the run leaves through this forwarder from its first request, and a solve bound to an exit
 * (DataDome, Cloudflare's challenge) is sent the same upstream: the browser and the solver share one exit, chosen
 * before the run, never after a block. HTTPS goes through CONNECT; plain HTTP is forwarded with Proxy-Authorization.
 * The login is never logged, and an upstream's refusal reaches the client as its status only.
 */

import http from 'node:http'
import net from 'node:net'
import type { ProxyServer } from '@w2l/contracts'
import type { SolverEgress } from './vendors/captchaSolver.js'

export interface SolverForwarder {
  egress: SolverEgress
  /** The forwarder as a proxy server the run's policy routes through (no login). */
  server: ProxyServer
  close(): Promise<void>
}

/**
 * Start the forwarder on a free loopback port. `upstream` must be an http:// proxy (Webshare's gateway is one).
 * `dialAt`, an IP, is dialled in place of the upstream's hostname (W2L_SOLVER_PROXY_ADDRESS), for a machine whose
 * resolver cannot be trusted with it; the solver is still given the hostname (`egress.upstream`), which CapSolver needed
 * on 2026-10-26 (it refused the gateway's IP and took p.webshare.io, with the same login and sticky session).
 * `solverScheme` (W2L_SOLVER_PROXY_SCHEME) gives the solver the same host, port and login by SOCKS5, for a gateway that
 * serves HTTP and SOCKS5 on one port ("All connection types support HTTP and SOCKS5 Proxy Protocols on the same port",
 * help.webshare.io): CapSolver's DataDome task refused Webshare's exit over http and took it over socks5 (T045,
 * 2026-10-26). The browser still reaches it over HTTP, through this forwarder.
 */
export async function startSolverForwarder(upstream: ProxyServer, dialAt?: string, solverScheme?: 'socks5'): Promise<SolverForwarder> {
  const target = new URL(upstream.url)
  if (target.protocol !== 'http:') throw new Error('the solver exit must be an http:// proxy')
  if (dialAt !== undefined && net.isIP(dialAt) === 0) throw new Error('the solver exit\'s address must be an IP address')
  const host = dialAt ?? target.hostname
  const port = Number(target.port || 80)
  // The port written out: a URL drops http's default 80, which SOCKS5's would read as 1080.
  const solverUpstream = solverScheme === undefined ? upstream : { ...upstream, url: `${solverScheme}://${target.hostname}:${port}` }
  const auth = upstream.username === undefined ? null : `Basic ${Buffer.from(`${upstream.username}:${upstream.password ?? ''}`).toString('base64')}`

  const server = http.createServer((req, res) => {
    // Only a proxy request (an absolute http:// URL): a page's script reaching this loopback port sends a path, which is
    // never passed on with the exit's login.
    if (!/^http:\/\/[^/?#\s]+/i.test(req.url ?? '')) { res.writeHead(400).end(); return }
    const headers = { ...req.headers, ...(auth === null ? {} : { 'proxy-authorization': auth }) }
    const forwarded = http.request({ host, port, method: req.method, path: req.url, headers }, (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(res)
    })
    forwarded.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    req.pipe(forwarded)
  })
  const sockets = new Set<net.Socket>()
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  server.on('connect', (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
    const authority = req.url ?? ''
    // Only host:port, as CONNECT takes: nothing else is written to the upstream.
    if (!/^[A-Za-z0-9.\-[\]:]+:\d{1,5}$/.test(authority)) { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return }
    const tunnel = net.connect(port, host, () => {
      tunnel.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth === null ? '' : `Proxy-Authorization: ${auth}\r\n`}\r\n`)
    })
    sockets.add(tunnel)
    tunnel.on('close', () => sockets.delete(tunnel))
    let buffered = Buffer.alloc(0)
    const onHead = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const end = buffered.indexOf('\r\n\r\n')
      if (end < 0) { if (buffered.length > 16_384) { client.destroy(); tunnel.destroy() } return }
      tunnel.off('data', onHead)
      const status = /^HTTP\/1\.[01] (\d{3})/.exec(buffered.subarray(0, end).toString('latin1'))?.[1] ?? '502'
      if (status !== '200') { client.end(`HTTP/1.1 ${status} Upstream refused\r\n\r\n`); tunnel.destroy(); return }
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      const rest = buffered.subarray(end + 4)
      if (rest.length > 0) client.write(rest)
      if (head.length > 0) tunnel.write(head)
      tunnel.pipe(client)
      client.pipe(tunnel)
    }
    tunnel.on('data', onHead)
    tunnel.on('error', () => client.destroy())
    client.on('error', () => tunnel.destroy())
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()) })
  const address = server.address()
  const localPort = typeof address === 'object' && address !== null ? address.port : 0
  const endpoint = `127.0.0.1:${localPort}`
  return {
    egress: { endpoint, upstream: solverUpstream },
    server: { url: `http://${endpoint}`, endpoint },
    close: () => new Promise<void>((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()) }),
  }
}
