#!/usr/bin/env node
import { motionTerminal, stopMotion } from './motion.js'
import { runCli } from './run.js'

// SIGINT (Ctrl-C) stops a running command; a crawl or batch is left paused and resumable. A second one exits at once.
const controller = new AbortController()
process.on('SIGINT', () => {
  if (controller.signal.aborted) process.exit(130)
  controller.abort(new Error('SIGINT'))
})
process.on('SIGTERM', () => controller.abort(new Error('SIGTERM')))
// However the process leaves (a second Ctrl-C, an error nothing caught), the terminal gets its cursor back.
process.on('exit', stopMotion)

runCli(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  signal: controller.signal,
  tty: process.stdout.isTTY === true,
  ...(process.stderr.isTTY === true ? { motion: motionTerminal(process.stderr) } : {}),
}).then((code) => { process.exitCode = code }, (error: unknown) => {
  process.stderr.write(`octocrawl: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
