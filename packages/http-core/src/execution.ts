/** One absolute wall-clock budget shared by every operation in an execution. */
export interface ExecutionBudget {
  signal?: AbortSignal
  deadlineAt?: number
  /** The deadline a held scope's deadline may not move past when it is released (the task's), when one is set. */
  deadlineCeilingAt?: number
  /** A parent scope's hold (ExecutionScope.holdDeadline), when this context is one: a scope made from it holds both. */
  holdDeadline?: () => () => number | undefined
  onRetryAfter?: (url: string, retryAt: number) => void
}

/** A scope: the context's fields, its own signal, and its deadline, which a wait that is not the page's own may hold. */
export type ExecutionScope<C extends ExecutionBudget> = C & {
  signal: AbortSignal
  dispose(): void
  /**
   * Stop the deadline's clock until the release is called, and then move the deadline on by the time held, no further than
   * `deadlineCeilingAt`: a page waiting its turn for a browser slot does not spend its own timeout waiting. The parent
   * signal still stops the scope meanwhile. Without a deadline, or once the scope is stopped, this does nothing. The release
   * answers the deadline the scope now has (undefined when it has none or did not move), so a copy of the scope that
   * holds its own `deadlineAt` (an object spread) can take it over.
   */
  holdDeadline(): () => number | undefined
}

export function throwIfExecutionStopped(context: ExecutionBudget): void {
  context.signal?.throwIfAborted()
  if (context.deadlineAt !== undefined && Date.now() >= context.deadlineAt) {
    throw new DOMException('Execution deadline exceeded', 'TimeoutError')
  }
}

/** The context's own fields are kept on the scope (a task's cookie session, for one), with its signal and deadline. */
export function createExecutionScope<C extends ExecutionBudget>(context: C = {} as C): ExecutionScope<C> {
  const controller = new AbortController()
  const abort = () => controller.abort(context.signal?.reason ?? new DOMException('Execution aborted', 'AbortError'))
  context.signal?.addEventListener('abort', abort, { once: true })
  if (context.signal?.aborted) abort()
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadlineAt = context.deadlineAt
  const checkDeadline = () => {
    const remaining = deadlineAt! - Date.now()
    if (remaining <= 0) controller.abort(new DOMException('Execution deadline exceeded', 'TimeoutError'))
    else timer = setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647))
  }
  if (deadlineAt !== undefined) checkDeadline()
  const scope: ExecutionScope<C> = {
    ...context,
    signal: controller.signal,
    dispose() { if (timer !== undefined) clearTimeout(timer); context.signal?.removeEventListener('abort', abort) },
    holdDeadline() {
      // A scope made from another scope holds its parent's deadline too: the parent's clock would stop this one otherwise.
      const releaseParent = context.holdDeadline?.()
      if (deadlineAt === undefined || controller.signal.aborted) return () => { releaseParent?.(); return undefined }
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      const heldFrom = Date.now()
      let released = false
      return () => {
        if (released) return deadlineAt
        released = true
        releaseParent?.()
        if (deadlineAt === undefined || controller.signal.aborted) return undefined
        deadlineAt = Math.min(deadlineAt + (Date.now() - heldFrom), context.deadlineCeilingAt ?? Number.POSITIVE_INFINITY)
        scope.deadlineAt = deadlineAt
        checkDeadline()
        return deadlineAt
      }
    },
  }
  return scope
}

export function raceWithSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) { void operation.catch(() => {}); return Promise.reject(signal.reason) }
  return new Promise<T>((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

/** Cancellation clears the timer rather than leaving a detached wait alive. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const until = Date.now() + Math.max(0, ms)
    let timer: ReturnType<typeof setTimeout>
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason) }
    const finish = () => {
      const remaining = until - Date.now()
      if (remaining > 0) { timer = setTimeout(finish, Math.min(remaining, 2_147_483_647)); return }
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    timer = setTimeout(finish, Math.min(Math.max(0, ms), 2_147_483_647))
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export function remainingTimeout(context: ExecutionBudget, capMs: number): number {
  throwIfExecutionStopped(context)
  return context.deadlineAt === undefined ? capMs : Math.max(1, Math.min(capMs, context.deadlineAt - Date.now()))
}
