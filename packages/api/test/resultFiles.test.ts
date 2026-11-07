import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resultFilesOf, writeResultFiles, type ResultPage } from '../src/resultFiles.js'

const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

async function* chunks(pages: readonly ResultPage[]): AsyncIterable<readonly ResultPage[]> { yield pages }

describe('writeResultFiles', () => {
  it('writes the Markdown of each page with content, and a second write replaces the first whole', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'w2l-result-files-'))
    dirs.push(dir)
    await writeResultFiles(dir, () => chunks([
      { url: 'https://example.com/a', status: 'success', markdown: '# A' },
      { url: 'https://example.com/gone', status: 'failed', markdown: '# Not Found' },
      { url: 'https://example.com/empty', status: 'empty_verified', markdown: '' },
    ]))
    expect(await readdir(join(dir, 'markdown'))).toEqual(['0001-example.com-a.md'])
    // Written again, as after a handoff read more pages: the old files go, nothing is left aside.
    const files = await writeResultFiles(dir, () => chunks([
      { url: 'https://example.com/a', status: 'success', markdown: '# A' },
      { url: 'https://example.com/b', status: 'partial', markdown: '# B, cut' },
    ]))
    expect(files).toEqual(resultFilesOf(dir))
    expect((await readdir(join(dir, 'markdown'))).sort()).toEqual(['0001-example.com-a.md', '0002-example.com-b.md'])
    expect(await readFile(join(dir, 'markdown', '0002-example.com-b.md'), 'utf8')).toBe('# B, cut')
    expect(existsSync(join(dir, 'markdown.tmp')) || existsSync(join(dir, 'markdown.old'))).toBe(false)
  })
})
