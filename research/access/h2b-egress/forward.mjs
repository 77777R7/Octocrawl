// H2b metering forwarder (research/access/runs/2026-10-27-h2b-egress-8ece08ab.md): the installed Chrome's only proxy
// (chrome.sh points it here), so its bytes are the installed_chrome rung's alone; the other rungs never see it. Each
// task call gets one exit for all its connections, and every tunnel's bytes are counted against the call it opened in.
//   direct     no upstream: the forwarder connects to the site itself (Cloud Run's own Google egress).
//   webshare   H2B_UPSTREAMS is the rotating residential gateway URL (`http://<user>-us-rotate:<password>@host:port`);
//              each call gets a fresh numeric session id in place of `rotate` (Webshare's sticky session).
// The call's exit is read through the call's own route at its first tunnel and again when it ends (api.ipify.org),
// so an exit that moved inside a call shows. Control is a Unix socket only this user can open (curl --unix-socket):
//   POST /call?task=<id>&n=<k>   start a call; POST /end   end it (echo, counters); GET /calls   every call's counters.
// H2B_UPSTREAMS carries the login: nothing this process prints, answers or logs names it, a bad value included.
import http from 'node:http'
import net from 'node:net'
import tls from 'node:tls'
import { randomInt } from 'node:crypto'
import { chmodSync, rmSync } from 'node:fs'

const style = process.env.H2B_SESSION_STYLE ?? 'direct'
const port = Number(process.env.FORWARD_PORT ?? 8796)
const control = process.env.H2B_CONTROL ?? '/tmp/h2b-forward.sock'
const ECHO_HOST = 'api.ipify.org'
const CONNECT_TIMEOUT_MS = 30_000
const ECHO_TIMEOUT_MS = 20_000

/** The gateway from H2B_UPSTREAMS. A value that does not parse is refused without being repeated: it holds a login. */
function gateway() {
  const text = (process.env.H2B_UPSTREAMS ?? '').trim().replace(/^["']|["']$/g, '')
  let url
  try { url = new URL(text) } catch { url = null }
  if (url === null || url.protocol !== 'http:' || url.username === '' || url.password === '') throw new Error('H2B_UPSTREAMS is not one http:// proxy URL with a login (its value is not shown)')
  const username = decodeURIComponent(url.username)
  if (!/-rotate$/.test(username)) throw new Error('the Webshare gateway username must end in -rotate (its value is not shown)')
  return { host: url.hostname, port: Number(url.port || 80), username, password: decodeURIComponent(url.password) }
}
if (style !== 'direct' && style !== 'webshare') throw new Error(`H2B_SESSION_STYLE must be direct or webshare, not ${style}`)
const base = style === 'webshare' ? gateway() : null

/** The route of a new call: null for direct, else the gateway with this call's session; `label` is what may be printed. */
function newRoute() {
  if (base === null) return { upstream: null, label: { exit: 'direct' } }
  const session = String(randomInt(100_000_000, 1_000_000_000))
  return { upstream: { ...base, username: base.username.replace(/-rotate$/, `-${session}`) }, label: { exit: 'webshare', session, gateway: `${base.host}:${base.port}` } }
}
const authOf = (upstream) => `Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}`
/** A proxy's reason header, with the account's user name taken out in case the proxy echoes it. */
function scrub(text) {
  if (base === null) return text
  const user = base.username.replace(/-[^-]+-rotate$/, '')
  return user.length < 3 ? text : text.split(user).join('<user>')
}

const calls = []
let current = null
function newCall(task, n) {
  const route = newRoute()
  const call = {
    task, n, startedAt: new Date().toISOString(), endedAt: null, route, ...route.label,
    tunnels: 0, http: 0, up: 0, down: 0, statuses: {}, errors: {}, refusals: [], connectMs: [], hosts: new Map(),
    exitStart: null, exitEnd: null, echo: [],
  }
  calls.push(call)
  return call
}
current = newCall('idle', 0)

/** Bytes of one tunnel, counted against the call it opened in, by site host. */
function count(call, host, up, down) {
  call.up += up; call.down += down
  call.hosts.set(host, (call.hosts.get(host) ?? 0) + up + down)
}

function splitTarget(target) {
  const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(target)
  return match === null ? [target, '443'] : [match[1], match[2]]
}

/**
 * A TCP connection to `target` (host:port) through the call's route: straight to it for direct, or a CONNECT through the
 * gateway. Resolves with the socket once the tunnel is open, or with the refusal (status and the proxy's reason header).
 */
function openTunnel(call, target) {
  return new Promise((resolve) => {
    const started = Date.now()
    const [host, portText] = splitTarget(target)
    const upstream = call.route.upstream
    const socket = upstream === null ? net.connect(Number(portText), host) : net.connect(upstream.port, upstream.host)
    let settled = false
    const done = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
    const timer = setTimeout(() => { socket.destroy(); done({ socket: null, status: 'connect_timeout', ms: Date.now() - started }) }, CONNECT_TIMEOUT_MS)
    socket.once('error', (error) => done({ socket: null, status: `error:${error.code ?? error.name}`, ms: Date.now() - started }))
    socket.once('connect', () => {
      if (upstream === null) { done({ socket, status: '200', ms: Date.now() - started, overheadUp: 0, overheadDown: 0 }); return }
      const request = `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${authOf(upstream)}\r\n\r\n`
      socket.write(request)
      let buffered = Buffer.alloc(0)
      const onData = (chunk) => {
        buffered = Buffer.concat([buffered, chunk])
        const end = buffered.indexOf('\r\n\r\n')
        if (end < 0) return
        socket.off('data', onData)
        const head = buffered.subarray(0, end).toString('latin1')
        const status = head.split(' ')[1] ?? '502'
        const reason = scrub(head.split('\r\n').slice(1).filter((line) => /^x-[a-z-]*(reason|error)|^proxy-status/i.test(line)).join('; ')).slice(0, 200)
        const rest = buffered.subarray(end + 4)
        if (status !== '200') { socket.destroy(); done({ socket: null, status, reason, ms: Date.now() - started, overheadUp: request.length, overheadDown: end + 4 }); return }
        done({ socket, status, ms: Date.now() - started, rest, overheadUp: request.length, overheadDown: end + 4 })
      }
      socket.on('data', onData)
    })
  })
}

/** The call's exit address, read through its own route: a tunnel to api.ipify.org, TLS, one GET. Bytes kept apart. */
async function echo(call, when) {
  const started = Date.now()
  const opened = await openTunnel(call, `${ECHO_HOST}:443`)
  if (opened.socket === null) return { when, ip: null, status: opened.status, ms: Date.now() - started }
  // TLS takes over the socket's reads, so its own counters (CONNECT exchange included) give the echo's bytes.
  const raw = opened.socket
  return await new Promise((resolve) => {
    const secure = tls.connect({ socket: opened.socket, servername: ECHO_HOST })
    let body = ''
    const timer = setTimeout(() => { secure.destroy(); resolve({ when, ip: null, status: 'echo_timeout', ms: Date.now() - started }) }, ECHO_TIMEOUT_MS)
    secure.once('secureConnect', () => secure.write(`GET /?format=json HTTP/1.1\r\nHost: ${ECHO_HOST}\r\nConnection: close\r\n\r\n`))
    secure.on('data', (chunk) => { body += chunk.toString('latin1') })
    secure.once('error', (error) => { clearTimeout(timer); resolve({ when, ip: null, status: `error:${error.code ?? error.name}`, ms: Date.now() - started }) })
    secure.once('close', () => {
      clearTimeout(timer)
      resolve({ when, ip: body.match(/"ip":"([^"]+)"/)?.[1] ?? null, status: body.split(' ')[1] ?? null, ms: Date.now() - started, bytes: raw.bytesRead + raw.bytesWritten })
    })
  })
}

/** The start echo goes out beside the call's first tunnel, so it never delays Chrome; a different end address shows a move. */
function startEcho(call) {
  if (call.exitStartPending !== undefined) return
  call.exitStartPending = echo(call, 'start').then((result) => { call.echo.push(result); call.exitStart = result.ip })
}

function summary(call) {
  const sorted = [...call.connectMs].sort((a, b) => a - b)
  const { route, hosts, exitStartPending, connectMs, ...rest } = call
  return {
    ...rest,
    connectMsP50: sorted.length === 0 ? null : sorted[Math.floor((sorted.length - 1) / 2)],
    connectMsMax: sorted.length === 0 ? null : sorted.at(-1),
    exitMoved: call.exitStart !== null && call.exitEnd !== null && call.exitStart !== call.exitEnd,
    topHosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([host, bytes]) => ({ host, bytes })),
  }
}

const server = http.createServer((req, res) => {
  // Plain http:// through the proxy: forwarded with the call's login, or straight to the site for direct.
  const call = current
  call.http++
  let target
  try { target = new URL(req.url) } catch { res.writeHead(400); res.end(); return }
  const upstream = call.route.upstream
  const options = upstream === null
    ? { host: target.hostname, port: Number(target.port || 80), method: req.method, path: `${target.pathname}${target.search}`, headers: req.headers }
    : { host: upstream.host, port: upstream.port, method: req.method, path: req.url, headers: { ...req.headers, 'proxy-authorization': authOf(upstream) } }
  // Header bytes are estimated from the parsed headers: each name and value plus its ": " or CRLF, and the first line.
  const headerBytes = (raw, line) => raw.reduce((n, part) => n + part.length + 2, 0) + line + 2
  let up = headerBytes(req.rawHeaders, req.method.length + req.url.length + 12), down = 0
  const forwarded = http.request(options, (answer) => {
    call.statuses[`http:${answer.statusCode}`] = (call.statuses[`http:${answer.statusCode}`] ?? 0) + 1
    down += headerBytes(answer.rawHeaders, 17 + (answer.statusMessage?.length ?? 0))
    res.writeHead(answer.statusCode ?? 502, answer.headers)
    answer.on('data', (chunk) => { down += chunk.length })
    answer.on('end', () => count(call, target.hostname, up, down))
    answer.pipe(res)
  })
  forwarded.on('error', (error) => { call.errors[error.code ?? 'error'] = (call.errors[error.code ?? 'error'] ?? 0) + 1; if (!res.headersSent) res.writeHead(502); res.end() })
  req.on('data', (chunk) => { up += chunk.length })
  req.pipe(forwarded)
})

server.on('connect', async (req, client, head) => {
  const call = current
  call.tunnels++
  const target = req.url ?? ''
  const [host] = splitTarget(target)
  if (call.task !== 'idle' && call.task !== 'selfcheck') startEcho(call)
  client.on('error', () => {})
  const opened = await openTunnel(call, target)
  call.statuses[opened.status] = (call.statuses[opened.status] ?? 0) + 1
  call.connectMs.push(opened.ms)
  count(call, host, opened.overheadUp ?? 0, opened.overheadDown ?? 0)
  if (opened.socket === null) {
    if (call.refusals.length < 5) call.refusals.push({ host, status: opened.status, ...(opened.reason ? { reason: opened.reason } : {}) })
    if (opened.status.startsWith('error:') || opened.status === 'connect_timeout') call.errors[opened.status] = (call.errors[opened.status] ?? 0) + 1
    client.end(`HTTP/1.1 ${/^\d{3}$/.test(opened.status) ? opened.status : '502'} Upstream refused\r\n\r\n`)
    return
  }
  const tunnel = opened.socket
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
  if (opened.rest?.length > 0) { client.write(opened.rest); count(call, host, 0, opened.rest.length) }
  if (head.length > 0) { tunnel.write(head); count(call, host, head.length, 0) }
  tunnel.on('data', (chunk) => count(call, host, 0, chunk.length))
  client.on('data', (chunk) => count(call, host, chunk.length, 0))
  tunnel.pipe(client)
  client.pipe(tunnel)
  tunnel.on('error', () => client.destroy())
  client.on('close', () => tunnel.destroy())
  tunnel.on('close', () => client.destroy())
})

const controlServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://h2b')
  const reply = (body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  if (req.method === 'POST' && url.pathname === '/call') {
    current = newCall(url.searchParams.get('task') ?? 'unknown', Number(url.searchParams.get('n') ?? calls.length))
    reply({ call: { task: current.task, n: current.n, startedAt: current.startedAt, ...current.route.label } })
  } else if (req.method === 'POST' && url.pathname === '/end') {
    // The call stops taking new tunnels at once: a slow echo below can never hand the next call's tunnels this session.
    const call = current
    if (call.task !== 'idle') current = newCall('idle', call.n)
    call.endedAt = new Date().toISOString()
    await call.exitStartPending
    if (call.tunnels > 0) { const result = await echo(call, 'end'); call.echo.push(result); call.exitEnd = result.ip }
    reply({ callEnd: summary(call) })
  } else if (req.method === 'GET' && url.pathname === '/calls') {
    reply({ calls: calls.filter((call) => call.task !== 'idle' || call.tunnels > 0).map(summary) })
  } else { res.writeHead(404); res.end() }
})

rmSync(control, { force: true })
controlServer.listen(control, () => chmodSync(control, 0o600))
server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ forwarder: { port, style, hosts: base === null ? [] : [`${base.host}:${base.port}`] } }))
})
