import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { forgetSites, listRememberedSites, rememberSites, siteHost } from '../src/rememberedSites.js'

describe('the sites remembered for the my-browser lane', () => {
  let root: string | undefined
  afterEach(async () => { if (root !== undefined) await rm(root, { recursive: true, force: true }) })

  it('names a site by its host, with a port that is not the default', () => {
    expect(siteHost('Example.com')).toBe('example.com')
    expect(siteHost('example.com:8443')).toBe('example.com:8443')
    expect(siteHost('https://example.com:443/a?b=1')).toBe('example.com')
    expect(siteHost('http://example.com:8080/')).toBe('example.com:8080')
    expect(() => siteHost('not a site')).toThrow()
  })

  it('keeps a revoke made by another process while a site is being remembered', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-remembered-'))
    const file = join(root, 'allowed-sites.json')
    // Two copies of the module, each with its own in-process queue: two processes sharing the file.
    // A specifier of its own (a query vite loads anew), held in a variable so the type checker does not resolve it.
    const copy = '../src/rememberedSites.js?copy=other'
    const other = await import(copy) as typeof import('../src/rememberedSites.js')
    for (let run = 0; run < 40; run++) {
      await rememberSites(file, ['a.test'], '2026-11-08T00:00:00.000Z')
      const [, forgotten] = await Promise.all([rememberSites(file, ['b.test'], '2026-11-08T00:00:01.000Z'), other.forgetSites(file, ['a.test'])])
      expect(forgotten).toEqual(['a.test'])
      expect((await listRememberedSites(file)).map((site) => site.host)).toEqual(['b.test'])
      await forgetSites(file, ['b.test'])
    }
    // No lock left behind.
    await expect(stat(`${file}.lock`)).rejects.toMatchObject({ code: 'ENOENT' })
  }, 30_000)

  it('takes over a lock left by a process that died holding it', async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-remembered-'))
    const file = join(root, 'allowed-sites.json')
    await writeFile(`${file}.lock`, '')
    const old = new Date(Date.now() - 60_000)
    await utimes(`${file}.lock`, old, old)
    await rememberSites(file, ['a.test'], '2026-11-08T00:00:00.000Z')
    expect(await listRememberedSites(file)).toEqual([{ host: 'a.test', allowedAt: '2026-11-08T00:00:00.000Z' }])
  })
})
