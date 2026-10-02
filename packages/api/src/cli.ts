#!/usr/bin/env node
import { serve } from '@hono/node-server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DeliveryStore, DeliveryWorker } from '@w2l/runtime'
import { createApp, injectJobWebSockets } from './app.js'
import { createApiEngine } from './engine.js'
import { parseListen, parsePort } from './listen.js'

export { parseListen, parsePort }

async function main(): Promise<void> {
  const listen = parseListen(process.argv.slice(2), process.env)
  const taskRoot = process.env.W2L_TASK_ROOT ?? '.w2l/api'
  const engine = createApiEngine({
    taskRoot,
    networkPolicy: listen.networkPolicy,
    defaultMaxPages: listen.defaultMaxPages,
    allowRobotsOverride: listen.allowRobotsOverride,
    hosted: listen.mode === 'hosted',
    webhookPolicy: { allowHttpLoopback: listen.delivery.allowHttpLoopback },
  })
  const app = createApp(engine, { tokens: listen.tokens, exposeInternalErrors: listen.mode === 'local', jobStreams: listen.jobStreams, ...(listen.rateLimit === undefined ? {} : { rateLimit: listen.rateLimit }) })
  // Job webhooks are delivered by this process: the same control database and worker the MCP runtime runs, under the delivery policy (not the crawler's).
  const deliveryStore = DeliveryStore.open(join(taskRoot, 'section-b-control.sqlite'))
  const worker = new DeliveryWorker(deliveryStore, {
    networkPolicy: listen.delivery.networkPolicy,
    allowHttpLoopback: listen.delivery.allowHttpLoopback,
    ...(listen.delivery.proxyUrl === undefined ? {} : { proxyUrl: listen.delivery.proxyUrl }),
    ...(listen.delivery.caFile === undefined ? {} : { ca: readFileSync(listen.delivery.caFile) }),
  })
  const workerController = new AbortController()
  const workerLoop = worker.run(workerController.signal).catch((error) => { console.error(error); process.exitCode = 1 })
  const server = serve({ fetch: app.fetch, hostname: listen.host, port: listen.port })
  // The job stream WebSocket routes complete their upgrades on this server; a no-op when the stream routes are off.
  injectJobWebSockets(app, server)
  let stopping = false
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
    if (stopping) return
    stopping = true
    server.close()
    workerController.abort(new Error(`w2l-api received ${signal}`))
    void engine.close({cancelActive: true}).then(() => workerLoop).then(() => deliveryStore.close()).catch((error) => { console.error(error); process.exitCode = 1 })
  })
  for (const notice of listen.notices) console.log(`w2l-api: ${notice}`)
  console.log(`w2l-api: ${listen.delivery.notice}`)
  if (listen.rateLimit !== undefined) console.log(`w2l-api: rate limit ${listen.rateLimit.perMinute} requests per minute per caller on scrape, crawl and batch starts`)
  console.log(`w2l-api ${listen.mode} listening on http://${listen.host}:${listen.port}`)
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
