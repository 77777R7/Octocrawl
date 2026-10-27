import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void

/**
 * Runs the garbage collector until what nothing reaches is gone, weakly held objects included: a test that needs a
 * collection to happen at one point, as CI's busy workers sometimes do, rather than hoping for one.
 */
export async function collectGarbage(): Promise<void> {
  // A WeakRef's target is kept to the end of the current job, so each collection runs after a turn of the event loop.
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    gc()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}
