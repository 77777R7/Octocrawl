import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localNetworkPolicy } from '@w2l/contracts'
import { ResilientHttpSubject } from '../src/subjects/resilientHttp.js'
import { BrowserLocalSubject } from '../src/subjects/browserLocal.js'

/**
 * A certificate that does not verify, on both local lanes: `failed` /
 * `tls_error` by default (never a connection error, never a policy denial
 * that hides the cause), and under `skipTlsVerification` the page, with the
 * relaxation on the record and the robots.txt verdict read for real.
 */

const PROSE = 'The harbour office records tide height, wind and visibility for every hour of the day, and the ledger is kept for the whole year. '.repeat(3)
const hits: string[] = []
let server: Server
let origin: string
let dir: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'w2l-tls-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
  server = createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
    hits.push(req.url ?? '')
    if (req.url === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: *\nAllow: /\n'); return }
    if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html><head><title>Self-signed</title></head><body><article><h1>Self-signed report</h1><p>${PROSE}</p></article></body></html>`)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

const TLS_WARNING = { code: 'tls_unverified', message: "The certificate of 127.0.0.1 was not verified at the caller's request; the content cannot be attributed to that host with certainty." }

describe('skipTlsVerification on the http lane', () => {
  it('reports a certificate that does not verify as tls_error by default, with the code', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      hits.length = 0
      const out = await subject.fetch(`${origin}/article`)
      expect(out).toMatchObject({ status: 'failed', failureReason: 'tls_error', lane: 'http', markdown: null })
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'request_failed', detail: expect.objectContaining({ reason: 'tls_error', code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }) }))
      expect(out.warnings).toBeUndefined()
      // The handshake failed before any request reached the server.
      expect(hits).toEqual([])
    } finally { await subject.teardown() }
  })

  it('loads the page under the option, with the warning, the trace event and a real robots.txt verdict, for that request alone', async () => {
    const subject = new ResilientHttpSubject('standard', localNetworkPolicy())
    try {
      hits.length = 0
      const out = await subject.fetch(`${origin}/article`, undefined, undefined, {}, undefined, { skipTlsVerification: true })
      expect(out).toMatchObject({ status: 'success', lane: 'http' })
      expect(out.markdown).toContain('Self-signed report')
      expect(out.warnings).toEqual([TLS_WARNING])
      expect(out.trace).toContainEqual(expect.objectContaining({ event: 'tls_verification_skipped', detail: { host: '127.0.0.1' } }))
      const robots = out.trace.find((t) => t.event === 'robots_checked')
      expect(robots?.detail).toMatchObject({ decision: 'allowed' })
      expect(robots?.detail).not.toHaveProperty('unreachable')
      expect(hits).toEqual(['/robots.txt', '/article'])
      // The relaxation was the request's: the subject's own routes still verify.
      const again = await subject.fetch(`${origin}/article`)
      expect(again).toMatchObject({ status: 'failed', failureReason: 'tls_error' })
      expect(again.warnings).toBeUndefined()
    } finally { await subject.teardown() }
  })
})

describe('skipTlsVerification on the browser lane', () => {
  const subject = new BrowserLocalSubject('standard', null, false, localNetworkPolicy())
  afterAll(async () => { await subject.teardown() })

  it('fails a bad certificate as tls_error by default and loads it under the option, recorded', async () => {
    const denied = await subject.fetch(`${origin}/article`, Date.now() + 60_000)
    expect(denied).toMatchObject({ status: 'failed', failureReason: 'tls_error', lane: 'browser_local', markdown: null })
    expect(denied.trace).toContainEqual(expect.objectContaining({ event: 'request_failed', detail: expect.objectContaining({ reason: 'tls_error' }) }))
    expect(denied.warnings).toBeUndefined()
    const loaded = await subject.fetch(`${origin}/article`, Date.now() + 60_000, undefined, undefined, { skipTlsVerification: true })
    expect(loaded).toMatchObject({ status: 'success', lane: 'browser_local' })
    expect(loaded.markdown).toContain('Self-signed report')
    expect(loaded.warnings).toEqual([TLS_WARNING])
    expect(loaded.trace).toContainEqual(expect.objectContaining({ event: 'tls_verification_skipped', detail: { host: '127.0.0.1' } }))
    expect(loaded.trace.find((t) => t.event === 'robots_checked')?.detail).toMatchObject({ decision: 'allowed' })
    expect(loaded.trace.some((t) => t.event === 'identity_mismatch')).toBe(false)
    // The record is schemaVersion 2: it has no TLS field, so the trace and the warning are the record of the relaxation.
    expect(loaded.compliance).toMatchObject({ schemaVersion: 2, finalUrl: `${origin}/article` })
  }, 60_000)
})
