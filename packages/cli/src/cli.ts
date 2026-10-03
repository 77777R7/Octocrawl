#!/usr/bin/env node
import { runCli } from './run.js'

// SIGINT (Ctrl-C) stops a running command; a crawl or batch is left paused and resumable. A second one exits at once.
const controller = new AbortController()
process.on('SIGINT', () => {
  if (controller.signal.aborted) process.exit(130)
  controller.abort(new Error('SIGINT'))
})
process.on('SIGTERM', () => controller.abort(new Error('SIGTERM')))

runCli(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  signal: controller.signal,
}).then((code) => { process.exitCode = code }, (error: unknown) => {
  process.stderr.write(`w2l: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
