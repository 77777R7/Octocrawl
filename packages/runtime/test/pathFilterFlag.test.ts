import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pathFilter = fileURLToPath(new URL('../src/pathFilter.ts', import.meta.url))
const verifyModule = fileURLToPath(new URL('../src/verify.ts', import.meta.url))

/**
 * In a process of its own: a path filter switches on V8's linear engine at run time, then the process goes on as a
 * server does (Web Streams that let go and pipe, a Request made from another and read, a regular-expression check). On Node
 * 26.8.1 the flag aborted such a process with exit code 133 at the first of them (2026-10-29).
 */
const SCRIPT = `
const { compilePathFilter } = await import(${JSON.stringify(pathFilter)})
if (compilePathFilter('^/a+$').test('/aaa') !== true) throw new Error('the path filter did not match')
const { verify } = await import(${JSON.stringify(verifyModule)})
new ReadableStream().getReader().releaseLock()
new WritableStream().getWriter().releaseLock()
await new ReadableStream({ start(c) { c.enqueue('x'); c.close() } }).pipeTo(new WritableStream())
for await (const _ of new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x')); c.close() } }).pipeThrough(new TextDecoderStream())) {}
await new Request(new Request('http://127.0.0.1/', { method: 'POST', body: 'x' })).text()
const verification = verify({ checks: [{ type: 'markdownCountMin', pattern: 'a', min: 3 }] }, { status: 'success', markdown: 'aaa' })
if (verification.status !== 'passed') throw new Error('the regular-expression check did not pass')
console.log('done')
`

describe('the linear engine switched on at run time (pathFilter.ts)', () => {
  it('leaves the process running through Web Streams, Requests and regular-expression checks', () => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', SCRIPT], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, HTTPS_PROXY: '', HTTP_PROXY: '' } })
    expect({ status: child.status, signal: child.signal, stderr: child.stderr.slice(0, 2_000) }).toEqual({ status: 0, signal: null, stderr: '' })
    expect(child.stdout.trim()).toBe('done')
  })
})
