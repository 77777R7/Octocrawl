import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rememberSites, type importChromeLogin } from '@w2l/api'
import { runCli } from '../src/run.js'
import { login } from '../src/login.js'

describe('octocrawl login', () => {
  let root: string
  let env: NodeJS.ProcessEnv
  const out: string[] = []
  const err: string[] = []
  const io = () => ({ env, stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-cli-login-'))
    env = { W2L_SESSIONS_FILE: join(root, 'sessions.json') }
    out.length = 0
    err.length = 0
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('import saves to W2L_SESSIONS_FILE and prints the count, never a cookie', async () => {
    const calls: Parameters<typeof importChromeLogin>[0][] = []
    const fake: typeof importChromeLogin = async (options) => {
      calls.push(options)
      return { domain: 'example.com', cookieCount: 4, localStorage: null, localStorageRead: false, localStorageUnread: [], localStorageUnreadReasons: [], sessionSha256: 'a'.repeat(64), sessionsFile: options.sessionsFile }
    }
    const code = await login(['import', 'example.com', '--timeout', '30', '--chrome-user-data-dir', join(root, 'Chrome')], io(), fake)
    expect(code).toBe(0)
    expect(calls[0]).toEqual({ site: 'example.com', sessionsFile: join(root, 'sessions.json'), userDataDir: join(root, 'Chrome'), timeoutMs: 30_000 })
    expect(JSON.parse(out[0]!)).toMatchObject({ domain: 'example.com', cookieCount: 4 })
    expect(err.join('\n')).toMatch(/Allow remote debugging/)
  })

  it('with remote debugging off, says how to turn it on and exits 1', async () => {
    await mkdir(join(root, 'Chrome'))
    const code = await runCli(['login', 'import', 'example.com', '--chrome-user-data-dir', join(root, 'Chrome')], io())
    expect(code).toBe(1)
    expect(err.at(-1)).toMatch(/chrome:\/\/inspect\/#remote-debugging/)
  })

  it('list and remove work on the saved logins file; bad command lines exit 2', async () => {
    expect(await runCli(['login', 'list'], io())).toBe(0)
    expect(JSON.parse(out.at(-1)!)).toEqual({ sessionsFile: join(root, 'sessions.json'), logins: [] })
    expect(await runCli(['login', 'remove', 'example.com'], io())).toBe(1)
    expect(await runCli(['login', 'import'], io())).toBe(2)
    expect(await runCli(['login', 'import', 'a.com', 'b.com'], io())).toBe(2)
    expect(await runCli(['login', 'import', 'a.com', '--timeout', '0'], io())).toBe(2)
    expect(await runCli(['login', 'nope'], io())).toBe(2)
    expect(await runCli(['login', '--help'], io())).toBe(0)
  })

  it('allowed lists the sites remembered for the my-browser lane, and revoke forgets one by host, port or URL', async () => {
    expect(await runCli(['login', 'allowed'], io())).toBe(0)
    const file = join(root, 'allowed-sites.json')
    expect(JSON.parse(out.at(-1)!)).toEqual({ file, sites: [] })
    await rememberSites(file, ['example.com', 'example.com:8443'], '2026-11-08T00:00:00.000Z')
    expect(await runCli(['login', 'allowed'], io())).toBe(0)
    expect(JSON.parse(out.at(-1)!).sites).toEqual([{ host: 'example.com', allowedAt: '2026-11-08T00:00:00.000Z' }, { host: 'example.com:8443', allowedAt: '2026-11-08T00:00:00.000Z' }])
    // A URL of the site, and its host in another case, name it; the default port is no port.
    expect(await runCli(['login', 'revoke', 'https://Example.com:443/a?b=1'], io())).toBe(0)
    expect(JSON.parse(out.at(-1)!)).toEqual({ site: 'example.com', revoked: true })
    expect(await runCli(['login', 'revoke', 'example.com'], io())).toBe(1)
    expect(await runCli(['login', 'revoke', 'example.com:8443'], io())).toBe(0)
    expect(await runCli(['login', 'allowed'], io())).toBe(0)
    expect(JSON.parse(out.at(-1)!).sites).toEqual([])
    expect(await runCli(['login', 'revoke'], io())).toBe(2)
    expect(await runCli(['login', 'revoke', 'not a site'], io())).toBe(2)
    expect(await runCli(['login', '--help'], io())).toBe(0)
    expect(out.at(-1)).toContain('revoke <site> forgets one')
  })
})
