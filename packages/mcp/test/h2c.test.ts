import { afterEach, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect, type ClientHttp2Session } from 'node:http2'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { serveH2cToo } from '../src/h2c.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

/** A server answering `handle` over HTTP/1 and h2c on one port, as the hosted API does. */
async function serve(handle: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handle)
  const h2c = serveH2cToo(server, handle)
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  cleanup.push(() => { h2c.close(); return new Promise<void>((done) => server.close(() => done())) })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** One stream's status and body length; `paused` leaves the body unread until `read()` is called. */
function get(session: ClientHttp2Session, path: string, paused = false) {
  const stream = session.request({ ':path': path })
  stream.end()
  let status = 0
  let bytes = 0
  stream.on('response', (head) => { status = Number(head[':status']) })
  stream.on('data', (chunk: Buffer) => { bytes += chunk.length })
  if (paused) stream.pause()
  const done = new Promise<{ status: number; bytes: number; reset: number }>((resolve) => stream.on('close', () => resolve({ status, bytes, reset: stream.rstCode ?? 0 })))
  return { done, read: () => stream.resume() }
}

it('answers HTTP/1 and h2c on one port with the same handler', async () => {
  const url = await serve((req, res) => { req.resume(); req.on('end', () => res.end(`HTTP/${req.httpVersion} ${req.method}`)) })
  // A body larger than one read, so the HTTP/1 parser gets what the sniffer read first and the rest after.
  expect(await (await fetch(url, { method: 'POST', body: 'x'.repeat(200_000) })).text()).toBe('HTTP/1.1 POST')
  const session = connect(url)
  cleanup.push(async () => { session.close() })
  const stream = session.request({ ':method': 'POST', ':path': '/' })
  stream.end('x')
  stream.setEncoding('utf8')
  let text = ''
  stream.on('data', (chunk: string) => { text += chunk })
  await once(stream, 'end')
  expect(text).toBe('HTTP/2.0 POST')
})

it('answers another request on the same HTTP/2 connection while a response larger than 10 MB waits to be read', async () => {
  const big = Buffer.alloc(20 * 1024 * 1024, 'x')
  const url = await serve((req, res) => { req.resume(); res.end(req.url === '/big' ? big : 'small') })
  const session = connect(url)
  cleanup.push(async () => { session.close() })
  const large = get(session, '/big', true)
  await new Promise((resolve) => setTimeout(resolve, 200))
  expect(await get(session, '/small').done).toEqual({ status: 200, bytes: 5, reset: 0 })
  large.read()
  expect(await large.done).toEqual({ status: 200, bytes: big.length, reset: 0 })
})
