import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/app.js'
import { createApiEngine, type ApiEngine } from '../src/engine.js'

/** A job id names a directory under the task root: one that is not a job id the server issued names nothing, inside the root or out. */
describe('job ids', () => {
  let root: string
  let engine: ApiEngine
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'w2l-task-ids-'))
    await mkdir(join(root, 'tasks'))
    engine = createApiEngine({ taskRoot: join(root, 'tasks') })
  })
  afterEach(async () => { await engine.close(); await rm(root, { recursive: true, force: true }) })

  it('answers 404 for an id that climbs out of the task root, and creates nothing there', async () => {
    const app = createApp(engine)
    await mkdir(join(root, 'victim'))
    const climbs = ['..%2Fvictim', '..%2F..%2Fetc', '%2E%2E%2Fvictim']
    for (const id of climbs) {
      for (const [method, path] of [['POST', `/v1/crawl/${id}/cancel`], ['POST', `/v1/crawl/${id}/resume`], ['GET', `/v1/crawl/${id}`], ['GET', `/v1/batches/${id}`], ['GET', `/v1/batches/${id}/errors`], ['GET', `/v1/batches/${id}/items`], ['GET', `/v1/crawl/${id}/errors`], ['POST', `/v1/batches/${id}/handoff`]] as const) {
        const res = await app.request(path, { method, headers: { 'content-type': 'application/json' } })
        expect(res.status, `${method} ${path}`).toBe(404)
      }
    }
    expect(existsSync(join(root, 'victim', 'checkpoint.sqlite'))).toBe(false)
    expect(await engine.cancelCrawl('../victim')).toBeNull()
    expect(await engine.resumeCrawl('../victim')).toBeNull()
    expect(await engine.getBatch('../victim')).toBeNull()
    expect(existsSync(join(root, 'victim', 'checkpoint.sqlite'))).toBe(false)
  })
})

describe('the task root', () => {
  it('is created readable by the person alone, with a .gitignore; one that exists is left as it is', async () => {
    const root = await mkdtemp(join(tmpdir(), 'w2l-task-root-'))
    try {
      const fresh = join(root, '.w2l', 'cli')
      const engine = createApiEngine({ taskRoot: fresh })
      await engine.close()
      if (process.platform !== 'win32') expect(statSync(fresh).mode & 0o777).toBe(0o700)
      expect(await readFile(join(fresh, '.gitignore'), 'utf8')).toBe('*\n')
      const mine = join(root, 'mine')
      await mkdir(mine)
      const other = createApiEngine({ taskRoot: mine })
      await other.close()
      expect(existsSync(join(mine, '.gitignore'))).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
