import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { CompatTransport } from '../src/compatTransport.js'

/**
 * The compatible transport's timeouts are the lane's: headersTimeoutMs until the response headers,
 * then bodyTimeoutMs between two chunks of the body, never one limit for the whole request.
 */

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer((req, res) => {
    // Headers that never come.
    if (req.url === '/silent') return
    // A body that keeps arriving, a chunk every 100 ms for 1.5 s (or 4 s).
    if (req.url === '/trickle' || req.url === '/trickle-long') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      let sent = 0
      const chunks = req.url === '/trickle' ? 15 : 40
      const timer = setInterval(() => {
        res.write('x'.repeat(100))
        if (++sent === chunks) { clearInterval(timer); res.end() }
      }, 100)
      res.on('close', () => clearInterval(timer))
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('the compatible transport keeps the lane timeouts', () => {
  it('ends a request whose headers do not come within headersTimeoutMs, as a headers timeout', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    await expect(transport.fetch(`${origin}/silent`, { headersTimeoutMs: 200, bodyTimeoutMs: 5000, capFor: () => 1_000_000 })).rejects.toMatchObject({ name: 'HeadersTimeoutError' })
  })

  it('reads a body that keeps arriving for longer than both timeouts together', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const res = await transport.fetch(`${origin}/trickle`, { headersTimeoutMs: 300, bodyTimeoutMs: 600, capFor: () => 1_000_000 })
    expect((await res.bodyBytes()).byteLength).toBe(1500)
  })

  it("hands the caller's deadline to impit, whose own limit would otherwise be 30 s", async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    // impit's limit is the deadline plus 1 s (2 s here); the body takes 4 s.
    const res = await transport.fetch(`${origin}/trickle-long`, { headersTimeoutMs: 300, bodyTimeoutMs: 600, capFor: () => 1_000_000, deadlineAt: Date.now() + 1000 })
    await expect(res.bodyBytes()).rejects.toMatchObject({ name: 'BodyTimeoutError' })
  })

  it('reports a body that stops arriving as a body timeout', async () => {
    const transport = new CompatTransport(localNetworkPolicy())
    const res = await transport.fetch(`${origin}/trickle`, { headersTimeoutMs: 300, bodyTimeoutMs: 50, capFor: () => 1_000_000 })
    await expect(res.bodyBytes()).rejects.toMatchObject({ name: 'BodyTimeoutError' })
  })
})
