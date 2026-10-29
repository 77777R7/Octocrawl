import { spawn } from 'node:child_process'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The hosted CLIs as their tests start them (hostedChromeCli.test.ts, hostedRegexCli.perf.test.ts).
const SRC = fileURLToPath(new URL('../src/', import.meta.url))

/** Runs a CLI until it prints its startup line or exits; answers what it printed and its exit code (null: it was serving). */
export async function runHostedCli(cli: string, env: Record<string, string>): Promise<{ out: string; code: number | null }> {
  // The hosted API takes no port 0: a free one, as its tests pick.
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = String((probe.address() as AddressInfo).port)
  await new Promise<void>((resolve) => probe.close(() => resolve()))
  return new Promise((resolve) => {
    const base = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('W2L_') && !/^https?_proxy$/i.test(key)))
    const child = spawn(process.execPath, ['--import', 'tsx', join(SRC, cli)], { env: { ...base, PORT: port, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
    const onOutput = (chunk: Buffer) => {
      out += chunk.toString()
      if (/"service":"octocrawl-hosted-api"|"event":"hosted_chrome_started"/.test(out)) { clearTimeout(timer); child.kill('SIGTERM'); resolve({ out, code: null }) }
    }
    child.stdout.on('data', onOutput)
    child.stderr.on('data', onOutput)
    child.on('exit', (code) => { clearTimeout(timer); resolve({ out, code }) })
  })
}
