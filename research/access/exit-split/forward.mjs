// M1 exit-vs-environment forwarder (docs/enhanced-access-tasks.md, M1): one local port per upstream proxy, so the
// installed Chrome, which takes no proxy login on its command line, can leave through a proxy that needs one.
// chrome.sh points each Chrome launch at the next port, so each read has one exit, as hosted_chrome chooses one per read.
//   EXIT_SPLIT_PROXIES  the proxy list file, one `ip:port:user:password` per line (Webshare's datacenter list)
//   EXIT_SPLIT_BASE     the first local port (default 18900); line i of the seeded shuffle listens on base + i
//   EXIT_SPLIT_LOG      a JSONL file: one line per connection (local port, upstream host:port, target host, outcome, ms)
// The file carries logins: nothing this process prints or logs names one, a bad line included.
import http from 'node:http'
import net from 'node:net'
import { appendFileSync, readFileSync } from 'node:fs'

const SEED = 20261110
const CONNECT_TIMEOUT_MS = 30_000
const base = Number(process.env.EXIT_SPLIT_BASE ?? 18900)
const logFile = process.env.EXIT_SPLIT_LOG ?? null
const lines = readFileSync(process.env.EXIT_SPLIT_PROXIES ?? '', 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const entries = lines.map((line, i) => {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5}):([^:\s]+):(\S+)$/.exec(line)
  if (match === null) throw new Error(`proxy list line ${i + 1} is not ip:port:user:password (its value is not shown)`)
  return { host: match[1], port: Number(match[2]), auth: `Basic ${Buffer.from(`${match[3]}:${match[4]}`).toString('base64')}` }
})
if (entries.length === 0) throw new Error('the proxy list holds no line')

/** The same order on every run: a seeded Fisher–Yates shuffle (mulberry32), as h2b-egress/forward.mjs does. */
function shuffled(items, seed) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), state | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
  return out
}
const log = (entry) => { if (logFile !== null) appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`) }

shuffled(entries, SEED).forEach((upstream, i) => {
  const local = base + i
  const id = `${upstream.host}:${upstream.port}`
  const server = http.createServer((request, response) => {
    // A plain-http page: the absolute URL goes to the upstream proxy as it came, with the login added.
    const started = Date.now()
    let target = ''
    try { target = new URL(request.url ?? '').host } catch {}
    const out = http.request({ host: upstream.host, port: upstream.port, method: request.method, path: request.url, headers: { ...request.headers, 'proxy-authorization': upstream.auth }, timeout: CONNECT_TIMEOUT_MS }, (answer) => {
      log({ local, upstream: id, target, kind: 'http', outcome: answer.statusCode, ms: Date.now() - started })
      response.writeHead(answer.statusCode ?? 502, answer.headers)
      answer.pipe(response)
    })
    out.on('timeout', () => out.destroy(new Error('timeout')))
    out.on('error', (error) => { log({ local, upstream: id, target, kind: 'http', outcome: `error:${error.code ?? error.message}`, ms: Date.now() - started }); if (!response.headersSent) response.writeHead(502); response.end() })
    request.pipe(out)
  })
  server.on('connect', (request, client, head) => {
    const started = Date.now()
    const target = request.url ?? ''
    let settled = false
    const fail = (outcome) => {
      if (settled) return
      settled = true
      log({ local, upstream: id, target, kind: 'connect', outcome, ms: Date.now() - started })
      try { client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') } catch {}
      socket.destroy()
    }
    const socket = net.connect({ host: upstream.host, port: upstream.port })
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => fail('error:timeout'))
    socket.on('error', (error) => fail(`error:${error.code ?? error.message}`))
    client.on('error', () => socket.destroy())
    socket.once('connect', () => socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${upstream.auth}\r\n\r\n`))
    let buffered = Buffer.alloc(0)
    const onData = (chunk) => {
      buffered = Buffer.concat([buffered, chunk])
      const end = buffered.indexOf('\r\n\r\n')
      if (end === -1) { if (buffered.length > 16_384) fail('error:head_too_large'); return }
      socket.off('data', onData)
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(buffered.subarray(0, end).toString('latin1'))?.[1] ?? 0)
      if (status !== 200) { fail(`upstream:${status}`); return }
      settled = true
      socket.setTimeout(0)
      log({ local, upstream: id, target, kind: 'connect', outcome: 200, ms: Date.now() - started })
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      const rest = buffered.subarray(end + 4)
      if (rest.length > 0) client.write(rest)
      if (head.length > 0) socket.write(head)
      socket.pipe(client)
      client.pipe(socket)
      socket.on('close', () => client.destroy())
      client.on('close', () => socket.destroy())
    }
    socket.on('data', onData)
  })
  server.on('clientError', (_error, socket) => socket.destroy())
  server.listen(local, '127.0.0.1')
})
console.log(JSON.stringify({ event: 'exit_split_forwarder', base, proxies: entries.length }))
