import { afterEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createPreviewServer, type PreviewServerOptions } from '../src/server.js'
import { FirestoreWaitlist, parseWaitlistEntry, type WaitlistEntry } from '../src/waitlist.js'
import type { LogLine } from '../src/site.js'

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function site(extra: Partial<PreviewServerOptions> = {}) {
  const saved: WaitlistEntry[] = []
  const lines: LogLine[] = []
  const server = createPreviewServer({
    quota: { consume: async () => 'ok' }, staticDir: '/nonexistent', amazonState: null, log: line => lines.push(line),
    waitlist: { save: async entry => { saved.push(entry) } }, ...extra,
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const post = (body: unknown, headers: Record<string, string> = {}) => fetch(`${url}/api/waitlist`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return { url, post, saved, lines }
}

const valid = { email: ' Ada@Example.org ', role: 'academic', needs: ['hosted', 'hosted', 'api_key'], useCase: ' Census tables ', trigger: 'quota', ref: 'news.ycombinator.com' }

describe('waitlist entries', () => {
  it('normalises a valid sign-up and refuses anything the form cannot send', () => {
    expect(parseWaitlistEntry(valid)).toEqual({ email: 'ada@example.org', role: 'academic', needs: ['hosted', 'api_key'], useCase: 'Census tables', trigger: 'quota', ref: 'news.ycombinator.com' })
    expect(parseWaitlistEntry({ email: 'a@b.co', trigger: 'footer', role: '', useCase: '', ref: '' })).toEqual({ email: 'a@b.co', role: null, needs: [], useCase: null, trigger: 'footer', ref: null })
    for (const change of [
      { email: 'not-an-email' }, { email: `${'a'.repeat(250)}@b.co` }, { role: 'ceo' }, { needs: ['free_beer'] }, { needs: 'hosted' },
      { useCase: 'x'.repeat(201) }, { trigger: 'popup' }, { trigger: undefined }, { ref: 'https://evil.example/path' }, { phone: '123' },
    ]) expect([change, parseWaitlistEntry({ ...valid, ...change })]).toEqual([change, null])
    expect(parseWaitlistEntry({ ...valid, useCase: '表'.repeat(200) })).not.toBeNull()
    expect(parseWaitlistEntry({ ...valid, website: 'https://spam.example' })).toBe('spam')
  })
})

describe('POST /api/waitlist', () => {
  it('stores a sign-up and logs nothing about it', async () => {
    const { post, saved, lines } = await site()
    const response = await post(valid, { dnt: '1' })
    expect(response.status).toBe(204)
    expect(saved).toEqual([parseWaitlistEntry(valid)])
    expect(lines).toEqual([])
  })

  it('answers a filled hidden field like a person but keeps nothing', async () => {
    const { post, saved } = await site()
    expect((await post({ ...valid, website: 'x' })).status).toBe(204)
    expect(saved).toEqual([])
  })

  it('refuses malformed bodies, other methods and cross-site posts', async () => {
    const { url, post, saved } = await site()
    expect((await post({ ...valid, email: 'nope' })).status).toBe(400)
    expect((await post('{not json')).status).toBe(400)
    expect((await post({ ...valid, useCase: 'x'.repeat(3_000) })).status).toBe(400)
    expect((await post(valid, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await post(valid, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await fetch(`${url}/api/waitlist`)).status).toBe(405)
    expect(saved).toEqual([])
  })

  it('limits one visitor to five sign-ups a day', async () => {
    const { post, saved } = await site()
    const statuses = []
    for (let index = 0; index < 6; index++) statuses.push((await post({ ...valid, email: `p${index}@example.org` })).status)
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429])
    expect(saved).toHaveLength(5)
  })

  it('says so when it cannot store the sign-up, and when no list is configured', async () => {
    const failing = await site({ waitlist: { save: async () => { throw new Error('firestore down') } } })
    const response = await failing.post(valid)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'waitlist_unavailable' })
    const none = await site({ waitlist: undefined })
    expect((await none.post(valid)).status).toBe(501)
  })
})

describe('Firestore waitlist', () => {
  it('writes one document per address, keeping the first sign-up date and no visitor details', async () => {
    const calls: { url: string; body?: string }[] = []
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as string | undefined })
      return String(url).includes('metadata.google.internal')
        ? new Response(JSON.stringify({ access_token: 'token' }))
        : new Response('{}')
    }) as typeof fetch
    const store = new FirestoreWaitlist('w2l-test-project', 'k'.repeat(32), fetcher)
    const entry = parseWaitlistEntry(valid) as WaitlistEntry
    await store.save(entry, new Date('2026-10-03T08:00:00Z'))
    await store.save({ ...entry, role: 'student' }, new Date('2026-10-04T08:00:00Z'))
    const commits = calls.filter(call => call.url.endsWith(':commit')).map(call => JSON.parse(call.body!).writes[0])
    expect(commits[0].update.name).toBe(commits[1].update.name)
    expect(commits[0].update.name).toMatch(/\/waitlist\/[a-f0-9]{64}$/)
    expect(commits[0].update.name).not.toContain('ada')
    expect(commits[1].update.fields.role).toEqual({ stringValue: 'student' })
    expect(commits[1].updateMask.fieldPaths).not.toContain('createdAt')
    expect(commits[1].updateTransforms).toEqual([{ fieldPath: 'createdAt', minimum: { timestampValue: '2026-10-04T08:00:00.000Z' } }])
    expect(Object.keys(commits[0].update.fields).sort()).toEqual(['email', 'needs', 'ref', 'role', 'trigger', 'updatedAt', 'useCase'])
  })

  it('throws when the commit fails, so the page is never told it worked', async () => {
    const fetcher = (async (url: string) => String(url).includes('metadata') ? new Response(JSON.stringify({ access_token: 't' })) : new Response('', { status: 403 })) as typeof fetch
    await expect(new FirestoreWaitlist('w2l-test-project', 'k'.repeat(32), fetcher).save(parseWaitlistEntry(valid) as WaitlistEntry)).rejects.toThrow('403')
  })
})
