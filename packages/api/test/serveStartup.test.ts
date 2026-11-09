import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSessionStore } from '@w2l/bench'
import { runApiServer } from '../src/cli.js'
import { rememberSites } from '../src/rememberedSites.js'

const PERSON_LINE = 'a page behind your login'

const freePort = async (): Promise<number> => {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return port
}

describe('what octocrawl serve says when it starts', () => {
  let root: string

  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  /** The lines a server prints as it starts, on a free port, with its own task root and saved logins. */
  async function startup(args: readonly string[], logins: readonly string[] = [], damaged?: string, allowed: readonly string[] = [], chromiumInstalled: () => boolean = () => true): Promise<string[]> {
    root = await mkdtemp(join(tmpdir(), 'w2l-serve-'))
    const sessionsFile = join(root, 'sessions.json')
    if (damaged !== undefined) await writeFile(sessionsFile, damaged)
    await rememberSites(join(root, 'allowed-sites.json'), allowed, '2026-11-08T00:00:00.000Z')
    for (const domain of logins) await new FileSessionStore(sessionsFile).save({ domain, attestedBy: 'test', attestedAt: '2026-11-07T00:00:00.000Z', vendor: 'browser_local_authed', cookies: [] })
    const lines: string[] = []
    const server = await runApiServer(['--port', String(await freePort()), ...args], { W2L_TASK_ROOT: join(root, 'tasks'), W2L_SESSIONS_FILE: sessionsFile }, { signals: false, chromiumInstalled, log: (line) => lines.push(line) })
    await server.close()
    return lines
  }

  const personLines = (lines: readonly string[]) => lines.filter((line) => line.includes(PERSON_LINE))

  it('on this computer alone, names the person\'s own Chrome and a saved login, once', async () => {
    const [line, ...rest] = personLines(await startup([]))
    expect(rest).toEqual([])
    expect(line).toContain('the Chrome you are signed in to (lane my-browser')
    // Started with npx, the command is not on the path: the line says what will run.
    expect(line).toContain('npx octocrawl login import <site>')
    // An agent is told to ask; Octocrawl cannot promise what an agent does.
    expect(line).toContain('an agent is told to ask you first')
    expect(line).toContain('saved logins stay on this computer')
    expect(line).not.toContain('saved:')
  })

  it('counts the logins already saved', async () => {
    expect(personLines(await startup([], ['example.com']))[0]).toContain('1 saved: npx octocrawl login list')
    await rm(root, { recursive: true, force: true })
    expect(personLines(await startup([], ['example.com', 'example.org']))[0]).toContain('2 saved: npx octocrawl login list')
  })

  it('says how many sites are read in the person\'s Chrome without asking again, and how to stop it; nothing when none', async () => {
    expect((await startup([])).join('\n')).not.toContain('without asking again')
    await rm(root, { recursive: true, force: true })
    const lines = await startup([], [], undefined, ['example.com', 'example.org:8443'])
    expect(lines.filter((line) => line.includes('without asking again'))).toEqual(['octocrawl: 2 sites you allowed are read in your Chrome without asking again (npx octocrawl login allowed; npx octocrawl login revoke <site> to stop)'])
    // Never on a server other machines reach, which does not read in the person's Chrome.
    await rm(root, { recursive: true, force: true })
    expect((await startup(['--host', '0.0.0.0', '--token', 'test-token'], [], undefined, ['example.com'])).join('\n')).not.toContain('without asking again')
  })

  it('starts all the same on a damaged logins file, without the count', async () => {
    for (const damaged of ['{"sessions":{}}', '{"sessions":[null]}', '{not json']) {
      const [line] = personLines(await startup([], [], damaged))
      expect(line).toContain('saved logins stay on this computer')
      expect(line).not.toContain('saved:')
      await rm(root, { recursive: true, force: true })
    }
    root = await mkdtemp(join(tmpdir(), 'w2l-serve-'))
  })

  it('on a server other machines reach, says logins are not read and offers neither route', async () => {
    const lines = await startup(['--host', '0.0.0.0', '--token', 'test-token'])
    expect(personLines(lines)).toEqual([])
    expect(lines.join('\n')).toContain('saved logins (mode authed) are not read')
  })

  it('says when the browser lane has no Chromium yet, with the command that installs it, and nothing when it has one', async () => {
    const missing = (await startup([], [], undefined, [], () => false)).filter((line) => line.includes('Chromium'))
    expect(missing).toEqual(['octocrawl: the browser lane has no Chromium yet, so a page that needs scripts to show its content comes back thin or failed; run npx playwright install chromium once'])
    await rm(root, { recursive: true, force: true })
    expect((await startup([])).filter((line) => line.includes('Chromium'))).toEqual([])
    await rm(root, { recursive: true, force: true })
    // A hosted server's Chromium is its image's, not the person's to install.
    expect((await startup(['--hosted', '--token', 'test-token'], [], undefined, [], () => false)).filter((line) => line.includes('Chromium'))).toEqual([])
  })

  it('on a hosted server, says nothing of it', async () => {
    const lines = await startup(['--hosted', '--token', 'test-token'])
    expect(personLines(lines)).toEqual([])
    expect(lines.join('\n')).not.toContain('my-browser')
  })
})
