import { describe, expect, it } from 'vitest'
import { createExecutionScope } from '../src/execution.js'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('an execution scope\'s deadline on hold', () => {
  it('does not run while held, and runs on from where it was once released', async () => {
    const scope = createExecutionScope({ deadlineAt: Date.now() + 120 })
    const release = scope.holdDeadline()
    await sleep(200)
    expect(scope.signal.aborted).toBe(false)
    release()
    // The time held is given back: about 120 ms remain.
    expect(scope.deadlineAt! - Date.now()).toBeGreaterThan(60)
    await sleep(60)
    expect(scope.signal.aborted).toBe(false)
    await sleep(120)
    expect(scope.signal.aborted).toBe(true)
    expect((scope.signal.reason as DOMException).name).toBe('TimeoutError')
    scope.dispose()
  })

  it('never moves the deadline past the ceiling it was given, and holds nothing without a deadline', async () => {
    const ceiling = Date.now() + 150
    const scope = createExecutionScope({ deadlineAt: Date.now() + 100, deadlineCeilingAt: ceiling })
    const release = scope.holdDeadline()
    await sleep(120)
    release()
    expect(scope.deadlineAt).toBeLessThanOrEqual(ceiling)
    await sleep(80)
    expect(scope.signal.aborted).toBe(true)
    scope.dispose()
    const open = createExecutionScope({ deadlineAt: undefined })
    const nothing = open.holdDeadline()
    nothing()
    expect(open.deadlineAt).toBeUndefined()
    expect(open.signal.aborted).toBe(false)
    open.dispose()
  })

  it('still stops with its parent while held, and a second release changes nothing', async () => {
    const parent = new AbortController()
    const scope = createExecutionScope({ signal: parent.signal, deadlineAt: Date.now() + 10_000 })
    const release = scope.holdDeadline()
    parent.abort(new DOMException('slice over', 'AbortError'))
    expect(scope.signal.aborted).toBe(true)
    const before = scope.deadlineAt
    release(); release()
    expect(scope.deadlineAt).toBe(before)
    scope.dispose()
  })

  it('a scope made from a held scope holds both, so the parent\'s clock does not stop the child', async () => {
    const parent = createExecutionScope({ deadlineAt: Date.now() + 100 })
    const child = createExecutionScope({ ...parent })
    const release = child.holdDeadline()
    await sleep(160)
    expect(parent.signal.aborted).toBe(false)
    expect(child.signal.aborted).toBe(false)
    release()
    await sleep(160)
    expect(child.signal.aborted).toBe(true)
    child.dispose(); parent.dispose()
  })
})
