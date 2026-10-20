import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CrawlReport } from '@w2l/contracts'
import { SqliteTaskStore } from '../src/sqliteStore.js'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** Runs paid-crawl-process.ts once; resolves with how it exited and what it printed. */
function run(env: Record<string, string>): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', resolve('packages/runtime/test/fixtures/paid-crawl-process.ts')], {
    cwd: resolve('.'),
    env: { ...process.env, ...env, TSX_TSCONFIG_PATH: resolve('packages/runtime/test/fixtures/tsconfig.json') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  return new Promise((done) => child.once('exit', (code, signal) => done({ code, signal, stdout, stderr })))
}

function calls(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : []
}

describe('a paid call survives a hard crash (PA E1)', () => {
  for (const kill of ['before_put_step', 'before_put_attempt']) {
    it(`does not pay again on resume after a SIGKILL ${kill.replaceAll('_', ' ')}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'w2l-paid-recovery-'))
      dirs.push(dir)
      const taskDir = join(dir, 'task')
      const callsFile = join(dir, 'calls.txt')
      const first = await run({ PAID_TEST_DIR: taskDir, PAID_TEST_CALLS: callsFile, PAID_TEST_KILL: kill })
      expect(first.signal, first.stderr).toBe('SIGKILL')
      expect(calls(callsFile)).toHaveLength(1)

      const store = SqliteTaskStore.open(taskDir)
      const [task] = await store.listTasks()
      await store.close()
      expect(task).toBeDefined()

      // The budget is $1 and the first run's call was charged its $1 ceiling: the resume has no room for another.
      const resumed = await run({ PAID_TEST_DIR: taskDir, PAID_TEST_CALLS: callsFile, PAID_TEST_RESUME: task!.id })
      expect(resumed.code, resumed.stderr).toBe(0)
      expect(calls(callsFile)).toHaveLength(1)
      const report = JSON.parse(resumed.stdout) as CrawlReport
      expect(report.taskId).toBe(task!.id)
      expect(report.budgetExceeded).toBe('cost')
    }, 30_000)
  }
})
