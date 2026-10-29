import { performance } from 'node:perf_hooks'

export interface StartupTimings {
  /** When the process started; Cloud Run's "Starting new instance" line before it is the platform's share. */
  processStartedAt: string
  /** Node's own boot. */
  nodeBootMs: number
  /** Loading the modules, until cli.ts's body ran. */
  importsMs: number
  /** Setting up the server until it listened. */
  setupMs: number
  /** All of it, from the process start. */
  readyMs: number
}

interface Clock { timeOrigin: number; now(): number; nodeTiming: { bootstrapComplete: number } }

/** How this process spent its start, for the start-up log line (cli.ts), so a slow cold start can be split between
 * Cloud Run, Node, the modules and the setup. `importsDoneMs` is performance.now() at the top of cli.ts's body. */
export function startupTimings(importsDoneMs: number, clock: Clock = performance): StartupTimings {
  const readyMs = clock.now()
  const boot = clock.nodeTiming.bootstrapComplete
  return {
    processStartedAt: new Date(Math.round(clock.timeOrigin)).toISOString(),
    nodeBootMs: Math.round(boot),
    importsMs: Math.round(importsDoneMs - boot),
    setupMs: Math.round(readyMs - importsDoneMs),
    readyMs: Math.round(readyMs),
  }
}
