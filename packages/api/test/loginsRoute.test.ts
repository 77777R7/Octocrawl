import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'
import type { CdpConnection } from '../src/chromeLogin.js'

/** `/v1/logins`: the person's saved logins, imported from their Chrome (a fake one here), listed and forgotten, without a cookie leaving the server. */

const COOKIES = [
  { name: 'sid', value: 'secret-cookie-value', domain: '.example.com', path: '/', expires: -1, httpOnly: true, secure: true, session: true },
  { name: 'pref', value: 'other-value', domain: 'www.example.com', path: '/', expires: 1893456000, httpOnly: false, secure: false },
]

describe('saved logins through the API', () => {
  let root: string
  let engine: ApiEngine | null = null
  afterEach(async () => { await engine?.close(); engine = null; await rm(root, { recursive: true, force: true }) })

  async function setup(kind: 'local' | 'no-chrome' | 'hosted') {
    root = await mkdtemp(join(tmpdir(), 'w2l-logins-'))
    const chromeDir = join(root, 'chrome')
    await mkdir(chromeDir, { recursive: true })
    await writeFile(join(chromeDir, 'DevToolsActivePort'), '9222\n/devtools/browser/x\n')
    const connect = async (): Promise<CdpConnection> => ({ async send() { return { cookies: COOKIES } }, close() {} })
    engine = createApiEngine({
      taskRoot: join(root, 'tasks'),
      sessionsFile: join(root, 'sessions.json'),
      ...(kind === 'hosted' ? { hosted: true } : {}),
      ...(kind === 'no-chrome' ? {} : { userChrome: { userDataDir: chromeDir, connect } }),
    })
    return createApp(engine)
  }
  const call = async (app: ReturnType<typeof createApp>, method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: res.status, body: await res.json() as Record<string, any> }
  }

  it('imports a site\'s login from the person\'s Chrome, lists it and forgets it, never answering a cookie', async () => {
    const app = await setup('local')
    const imported = await call(app, 'POST', '/v1/logins/import', { site: 'https://www.example.com/account' })
    expect(imported).toMatchObject({ status: 200, body: { domain: 'www.example.com', cookieCount: 2, sessionSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } })
    expect(JSON.stringify(imported.body)).not.toContain('secret-cookie-value')
    // The sessions file holds them, for mode authed to use.
    expect(await readFile(join(root, 'sessions.json'), 'utf8')).toContain('secret-cookie-value')
    const listed = await call(app, 'GET', '/v1/logins')
    expect(listed).toMatchObject({ status: 200, body: { logins: [{ domain: 'www.example.com', cookieCount: 2 }] } })
    expect(JSON.stringify(listed.body)).not.toContain('secret-cookie-value')
    expect(await call(app, 'DELETE', '/v1/logins/www.example.com')).toMatchObject({ status: 200, body: { removed: true } })
    expect(await call(app, 'DELETE', '/v1/logins/www.example.com')).toMatchObject({ status: 404 })
    expect((await call(app, 'GET', '/v1/logins')).body).toEqual({ logins: [] })
  })

  it('imports and forgets at once, as an agent calling in parallel would, without one undoing another', async () => {
    const app = await setup('local')
    const sites = ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com']
    // The fake Chrome's cookies are on example.com and www.example.com: every one of these sites takes the parent's.
    const imports = await Promise.all(sites.map((site) => call(app, 'POST', '/v1/logins/import', { site })))
    expect(imports.map((res) => [res.status, res.body.domain])).toEqual(sites.map((site) => [200, site]))
    expect((await call(app, 'GET', '/v1/logins')).body.logins.map((login: { domain: string }) => login.domain).sort()).toEqual(sites)
    const removals = await Promise.all(sites.slice(0, 3).map((site) => call(app, 'DELETE', `/v1/logins/${site}`)))
    expect(removals.map((res) => res.status)).toEqual([200, 200, 200])
    expect((await call(app, 'GET', '/v1/logins')).body.logins.map((login: { domain: string }) => login.domain)).toEqual(['d.example.com'])
  })

  it('refuses what is not a site, by name, before Chrome is asked', async () => {
    const app = await setup('local')
    expect(await call(app, 'POST', '/v1/logins/import', { site: 'localhost' })).toMatchObject({ status: 400, body: { error: expect.stringContaining('is not a domain') } })
    expect(await call(app, 'POST', '/v1/logins/import', {})).toMatchObject({ status: 400, body: { error: 'site must be a domain or a page URL' } })
    expect(await call(app, 'POST', '/v1/logins/import', { site: 'example.com', cookies: [] })).toMatchObject({ status: 400, body: { error: 'unsupported login import option: cookies' } })
  })

  it('a server that is not the person\'s own, or cannot reach their Chrome, saves none', async () => {
    const hosted = await setup('hosted')
    expect(await call(hosted, 'POST', '/v1/logins/import', { site: 'example.com' })).toMatchObject({ status: 409, body: { error: expect.stringContaining('does not save logins') } })
    expect((await call(hosted, 'GET', '/v1/logins')).body).toEqual({ logins: [] })
    expect(await call(hosted, 'DELETE', '/v1/logins/example.com')).toMatchObject({ status: 409 })
    await engine!.close(); engine = null; await rm(root, { recursive: true, force: true })
    const noChrome = await setup('no-chrome')
    expect(await call(noChrome, 'POST', '/v1/logins/import', { site: 'example.com' })).toMatchObject({ status: 409 })
  })
})
