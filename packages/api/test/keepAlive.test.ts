import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { closeIdleOnlyWhenUnread } from '../src/keepAlive.js'

// The client runs in its own process, so the server's stall does not stop it: it sends one request on a keep-alive
// connection, then a second one 300 ms after the first answer, and prints what happened to the second.
const CLIENT = `
const socket = require('node:net').connect(Number(process.argv[1]), '127.0.0.1')
let buffer = '', answers = 0, answeredAt = 0
const send = (path) => socket.write('GET ' + path + ' HTTP/1.1\\r\\nHost: x\\r\\nConnection: keep-alive\\r\\n\\r\\n')
socket.on('connect', () => send('/first'))
socket.on('data', (chunk) => {
  buffer += chunk
  while (/\\r\\n\\r\\nok/.test(buffer)) {
    buffer = buffer.replace(/^[\\s\\S]*?\\r\\n\\r\\nok/, '')
    answers += 1
    if (answers === 1) setTimeout(() => send('/second'), 300)
    else { answeredAt = Date.now(); console.log('answered') }
  }
})
socket.on('error', (error) => { console.log(error.code); process.exit(0) })
socket.on('close', () => { console.log(answeredAt > 0 ? 'closed after ' + (Date.now() - answeredAt) + ' ms' : 'closed unanswered'); process.exit(0) })
`

let server: Server | null = null
afterEach(async () => { await new Promise<void>((resolve) => server === null ? resolve() : server.close(() => resolve())); server = null })

/** A server whose idle timeout is 200 ms and whose event loop is held for 1 s, 50 ms after it answers `/first`, as a crawl's extraction holds it. */
async function stallingServer(guarded: boolean): Promise<number> {
  server = createServer((req, res) => {
    res.end('ok')
    if (req.url === '/first') setTimeout(() => setImmediate(() => { const until = Date.now() + 1_000; while (Date.now() < until); }), 50)
  })
  server.keepAliveTimeout = 200
  // Node waits this much longer than the timeout it advertises (1 s by default).
  ;(server as Server & { keepAliveTimeoutBuffer?: number }).keepAliveTimeoutBuffer = 0
  if (guarded) closeIdleOnlyWhenUnread(server)
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()))
  return (server.address() as AddressInfo).port
}

function runClient(port: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CLIENT, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    child.on('error', reject)
    child.on('exit', () => resolve(out.trim().split('\n')))
  })
}

describe('keep-alive idle timeout during an event-loop stall', () => {
  it('resets the request sent during the stall on a plain Node server (the reported ECONNRESET)', async () => {
    // A socket closed with the request unread sends a reset; the client then reads ECONNRESET (on macOS and Linux).
    expect(['ECONNRESET', 'closed unanswered']).toContain((await runClient(await stallingServer(false)))[0])
  })

  it('answers that request, then still closes the idle connection', async () => {
    const lines = await runClient(await stallingServer(true))
    expect(lines[0]).toBe('answered')
    const closedAfter = Number(/^closed after (\d+) ms$/.exec(lines[1] ?? '')?.[1])
    expect(closedAfter).toBeGreaterThanOrEqual(150)
    expect(closedAfter).toBeLessThan(5_000)
  })
})
