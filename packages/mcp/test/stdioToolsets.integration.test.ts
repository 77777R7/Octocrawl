import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { TOOLSET_NAMES } from '../src/toolsets.js'

// docs/mcp-client-ux-tasks.md W10.3: the bin stops at once, and says why, on a toolset it does not know.
it('the stdio bin exits non-zero on an unknown toolset and names the valid ones', () => {
  const tsx = fileURLToPath(new URL('../../../node_modules/.bin/tsx', import.meta.url))
  const stdio = fileURLToPath(new URL('../src/stdio.ts', import.meta.url))
  for (const [args, env] of [[['--toolsets=core,crawls'], {}], [[], { W2L_MCP_TOOLSETS: 'everything' }]] as const) {
    const run = spawnSync(tsx, [stdio, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30_000, input: '' })
    expect(run.status, run.stderr).not.toBe(0)
    expect(run.stderr).toContain(`the toolsets are ${[...TOOLSET_NAMES, 'all'].join(', ')}`)
  }
}, 60_000)
