#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { runCli } from './run.js'

// SIGINT (Ctrl-C) stops a running command; a crawl or batch is left paused and resumable. A second one exits at once.
const controller = new AbortController()
process.on('SIGINT', () => {
  if (controller.signal.aborted) process.exit(130)
  controller.abort(new Error('SIGINT'))
})
process.on('SIGTERM', () => controller.abort(new Error('SIGTERM')))

/** One question to the person at the terminal; null when they closed the input (Ctrl-D) or pressed Ctrl-C. */
const ask = (question: string): Promise<string | null> => new Promise((resolve) => {
  const lines = createInterface({ input: process.stdin, output: process.stdout })
  let answered = false
  lines.on('SIGINT', () => lines.close())
  lines.on('close', () => { if (!answered) { process.stdout.write('\n'); resolve(null) } })
  lines.question(question, (answer) => { answered = true; lines.close(); resolve(answer) })
})

runCli(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  signal: controller.signal,
  tty: process.stdout.isTTY === true,
  // Only a person typing at a terminal can answer: a pipe, a script or an agent's shell gets no `ask`.
  ...(process.stdin.isTTY === true && process.stdout.isTTY === true ? { ask } : {}),
}).then((code) => { process.exitCode = code }, (error: unknown) => {
  process.stderr.write(`octocrawl: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
