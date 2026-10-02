import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IDEMPOTENCY_FILENAME, IdempotencyStore, requestFingerprint } from '../src/index.js'

const HOUR_MS = 60 * 60 * 1000

describe('IdempotencyStore', () => {
  const cleanup: Array<() => Promise<void>> = []
  afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

  async function open(options: ConstructorParameters<typeof IdempotencyStore>[1] = {}) {
    const root = await mkdtemp(join(tmpdir(), 'w2l-idempotency-'))
    const store = IdempotencyStore.open(root, options)
    cleanup.push(async () => { store.close(); await rm(root, { recursive: true, force: true }) })
    return { root, store }
  }

  it('answers fresh, replays the same request under its key and refuses another request under it', async () => {
    const { root, store } = await open({ taskExists: () => true })
    const fingerprint = requestFingerprint({ urls: ['https://a.test/', 'https://b.test/'], formats: ['markdown'] })
    expect(store.claim('nightly-1', fingerprint)).toEqual({ kind: 'fresh' })
    store.record('nightly-1', fingerprint, 'task-1', { taskId: 'task-1' })
    expect(store.claim('nightly-1', fingerprint)).toEqual({ kind: 'replay', taskId: 'task-1', response: { taskId: 'task-1' } })
    // The URLs in another order ask for another job.
    expect(store.claim('nightly-1', requestFingerprint({ urls: ['https://b.test/', 'https://a.test/'], formats: ['markdown'] }))).toEqual({ kind: 'conflict' })
    expect(store.claim('nightly-2', fingerprint)).toEqual({ kind: 'fresh' })
    // A submission that did not go through frees its key again.
    store.record('nightly-2', fingerprint, 'task-2', { taskId: 'task-2' })
    store.forget('nightly-2')
    expect(store.claim('nightly-2', fingerprint)).toEqual({ kind: 'fresh' })
    // The index sits at the task root, owner-only, and a reopened store sees the rows.
    expect((await stat(join(root, IDEMPOTENCY_FILENAME))).mode & 0o777).toBe(0o600)
    store.close()
    const reopened = IdempotencyStore.open(root, { taskExists: () => true })
    try { expect(reopened.claim('nightly-1', fingerprint)).toMatchObject({ kind: 'replay', taskId: 'task-1' }) } finally { reopened.close() }
    cleanup.pop()
    await rm(root, { recursive: true, force: true })
  })

  it('fingerprints a request by its content: key order and absent fields do not matter, URL order and appendToId do', () => {
    const base = requestFingerprint({ urls: ['https://a.test/'], formats: ['markdown'], mode: undefined })
    expect(requestFingerprint({ formats: ['markdown'], urls: ['https://a.test/'] })).toBe(base)
    expect(requestFingerprint({ urls: ['https://a.test/'], formats: ['markdown'], appendToId: 'batch-1' })).not.toBe(base)
    expect(requestFingerprint({ urls: ['https://a.test/'], formats: ['links'] })).not.toBe(base)
    expect(requestFingerprint({ urls: ['https://a.test/'], formats: [{ type: 'json', schema: { type: 'object', properties: { a: { type: 'string' } } } }] }))
      .toBe(requestFingerprint({ urls: ['https://a.test/'], formats: [{ schema: { properties: { a: { type: 'string' } }, type: 'object' }, type: 'json' }] }))
    expect(base).toMatch(/^[0-9a-f]{64}$/)
  })

  it('frees a key after 24 hours, and as soon as the task it named is gone', async () => {
    let now = Date.parse('2026-10-02T00:00:00.000Z')
    const tasks = new Set(['task-1', 'task-2'])
    const { store } = await open({ now: () => now, taskExists: (taskId) => tasks.has(taskId) })
    const fingerprint = requestFingerprint({ urls: ['https://a.test/'] })
    store.record('k', fingerprint, 'task-1', { taskId: 'task-1' })
    now += 24 * HOUR_MS - 1
    expect(store.claim('k', fingerprint)).toMatchObject({ kind: 'replay', taskId: 'task-1' })
    now += 1
    expect(store.claim('k', fingerprint)).toEqual({ kind: 'fresh' })
    // The expired row is gone: the key binds to the new submission, dated now.
    store.record('k', fingerprint, 'task-2', { taskId: 'task-2' })
    now += HOUR_MS
    expect(store.claim('k', fingerprint)).toMatchObject({ kind: 'replay', taskId: 'task-2' })
    tasks.delete('task-2')
    expect(store.claim('k', 'another fingerprint')).toEqual({ kind: 'fresh' })
  })

  it('by default a task exists while its directory is under the task root', async () => {
    const { root, store } = await open()
    const fingerprint = requestFingerprint({ urls: ['https://a.test/'] })
    await mkdir(join(root, 'task-1'))
    store.record('k', fingerprint, 'task-1', { taskId: 'task-1' })
    expect(store.claim('k', fingerprint)).toMatchObject({ kind: 'replay', taskId: 'task-1' })
    await rm(join(root, 'task-1'), { recursive: true })
    expect(store.claim('k', fingerprint)).toEqual({ kind: 'fresh' })
  })
})
