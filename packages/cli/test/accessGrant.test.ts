import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LOCAL_GRANT_STATEMENT, parseListen } from '@w2l/api'
import { runCli } from '../src/run.js'
import { usage } from '../src/flags.js'

describe('octocrawl access-grant', () => {
  let root: string
  let env: NodeJS.ProcessEnv
  const out: string[] = []
  const err: string[] = []
  const asked: string[] = []
  /** A person at a terminal who types these answers in turn; null is the input closing (Ctrl-D). */
  const person = (...answers: (string | null)[]) => ({
    env,
    stdout: (text: string) => out.push(text),
    stderr: (text: string) => err.push(text),
    ask: async (question: string) => { asked.push(question); return answers.shift() ?? null },
  })
  /** No terminal to type in: an agent's shell, a pipe, a script. */
  const noTerminal = () => ({ env, stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-cli-grant-'))
    env = { W2L_SESSIONS_FILE: join(root, 'home', 'sessions.json') }
    out.length = 0
    err.length = 0
    asked.length = 0
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('shows the statement, and writes a grant the server accepts once the person types "I accept"', async () => {
    const code = await runCli(['access-grant'], person('  Ada Example ', 'I accept'))
    expect(code).toBe(0)
    const file = join(root, 'home', 'access-grant.json')
    // The statement is shown word for word before anything is asked, and it is the one written.
    expect(out[0]).toContain(LOCAL_GRANT_STATEMENT)
    expect(asked).toHaveLength(2)
    const text = await readFile(file, 'utf8')
    expect(JSON.parse(text)).toMatchObject({
      tier: 'enhanced',
      capabilities: ['installed_chrome', 'compatible_transport'],
      attestation: { principal: 'Ada Example', statement: LOCAL_GRANT_STATEMENT },
    })
    expect(Date.parse(JSON.parse(text).attestation.at)).toBeGreaterThan(Date.now() - 60_000)
    // Readable by the person alone, like the saved logins beside it.
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    // The server's own loader takes it, by flag and by W2L_ACCESS_GRANT.
    const grant = parseListen(['--access-grant', file], {}).accessGrant
    expect(grant).toMatchObject({ tier: 'enhanced', capabilities: ['installed_chrome', 'compatible_transport'] })
    expect(parseListen([], { W2L_ACCESS_GRANT: file }).accessGrant?.sha256).toBe(grant?.sha256)
    // And it says how to start with it, and that the request still asks for it.
    const said = out.join('\n')
    expect(said).toContain(`octocrawl serve --access-grant ${file}`)
    expect(said).toContain(`W2L_ACCESS_GRANT=${file}`)
    expect(said).toContain('--access enhanced')
    expect(said).toContain(grant!.sha256!)
  })

  it('--out names the file', async () => {
    const file = join(root, 'elsewhere', 'grant.json')
    expect(await runCli(['access-grant', '--out', file], person('ada@example.com', 'i accept'))).toBe(0)
    expect(parseListen(['--access-grant', file], {}).accessGrant?.attestation?.principal).toBe('ada@example.com')
    // A path a shell would split is printed as one quoted word.
    const spaced = join(root, "my folder", "it's.json")
    expect(await runCli(['access-grant', '--out', spaced], person('Ada', 'I accept'))).toBe(0)
    expect(out.join('\n')).toContain(`octocrawl serve --access-grant '${join(root, 'my folder')}/it'\\''s.json'`)
  })

  it('writes nothing where nobody can type the answer: it is the person who runs it', async () => {
    expect(await runCli(['access-grant'], noTerminal())).toBe(1)
    expect(err.join('\n')).toMatch(/run it yourself/)
    expect(err.join('\n')).toMatch(/nothing was written/i)
    await expect(stat(join(root, 'home', 'access-grant.json'))).rejects.toThrow()
  })

  it('writes nothing without a name, or on any answer but "I accept"', async () => {
    for (const answers of [['', 'I accept'], [null], ['Ada', 'yes'], ['Ada', 'y'], ['Ada', ''], ['Ada', null]] as (string | null)[][]) {
      expect(await runCli(['access-grant'], person(...answers)), JSON.stringify(answers)).toBe(1)
      await expect(stat(join(root, 'home', 'access-grant.json'))).rejects.toThrow()
    }
    expect(err.at(-1)).toMatch(/nothing was written/i)
  })

  it('leaves a file that is already there as it is', async () => {
    const file = join(root, 'grant.json')
    await writeFile(file, 'mine')
    expect(await runCli(['access-grant', '--out', file], person('Ada', 'I accept'))).toBe(1)
    expect(await readFile(file, 'utf8')).toBe('mine')
    expect(asked).toHaveLength(0)
    expect(err.at(-1)).toContain(file)
  })

  it('refuses a bad command line with 2, has no flag that answers for the person, and is listed in the help', async () => {
    expect(await runCli(['access-grant', '--out'], person())).toBe(2)
    expect(await runCli(['access-grant', '--yes'], person('Ada', 'I accept'))).toBe(2)
    expect(await runCli(['access-grant', 'extra'], person())).toBe(2)
    expect(await runCli(['access-grant', '--help'], noTerminal())).toBe(0)
    expect(out.at(-1)).toContain('usage: octocrawl access-grant')
    expect(usage(null)).toContain('access-grant')
  })
})
