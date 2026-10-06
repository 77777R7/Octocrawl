#!/usr/bin/env node
import { serve } from '@hono/node-server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DeliveryStore, DeliveryWorker } from '@w2l/runtime'
import { loadImpit, loadPatchrightEngine } from '@w2l/bench'
import { createApp, injectJobWebSockets, isLoopbackAuthority } from './app.js'
import { createApiEngine, defaultSessionsFile } from './engine.js'
import { parseListen, parsePort } from './listen.js'

export { parseListen, parsePort }

/**
 * The local or hosted API server: the engine on `W2L_TASK_ROOT` (default
 * `.w2l/api`), the routes, the job webhooks' delivery worker and the
 * listener, stopped on SIGINT or SIGTERM. `argv` takes the listen flags
 * (`--port`, `--host`, `--hosted`, `--token`, ...); `w2l-api` and `octocrawl serve`
 * both run it. Resolves once it listens, with the URL it listens on and a
 * `close` that stops it as SIGINT does; `signals: false` leaves the process
 * signals to the caller (tests).
 */
export async function runApiServer(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, options: { signals?: boolean; log?: (line: string) => void } = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const log = options.log ?? ((line: string) => console.log(line))
  const listen = parseListen([...argv], env)
  // Patchright is an optional install: a server asked for it checks it loads before it listens, not on the first browser page.
  if (listen.browserEngine === 'patchright') {
    const engine = await loadPatchrightEngine()
    log(`w2l-api: patchright ${engine.version ?? '(version unknown)'} loaded`)
  }
  // impit is a native module: a server asked for the compatible transport checks it loads before it listens.
  if (listen.compatHosts.length > 0) await loadImpit()
  const taskRoot = env.W2L_TASK_ROOT ?? '.w2l/api'
  // The user's saved logins are read by a local server that listens on loopback alone, and it then answers loopback requests only.
  const servesLogins = listen.mode === 'local' && isLoopbackAuthority(listen.host.includes(':') && !listen.host.startsWith('[') ? `[${listen.host}]` : listen.host, false)
  if (listen.mode === 'local' && !servesLogins) log(`saved logins (mode authed) are not read: this server listens on ${listen.host}, reachable from other machines; listen on 127.0.0.1 to use them`)
  const engine = createApiEngine({
    taskRoot,
    networkPolicy: listen.networkPolicy,
    defaultMaxPages: listen.defaultMaxPages,
    mapMaxLimit: listen.mapMaxLimit,
    mapMaxTimeoutMs: listen.mapMaxTimeoutMs,
    allowRobotsOverride: listen.allowRobotsOverride,
    hosted: listen.mode === 'hosted',
    sessionsFile: servesLogins ? defaultSessionsFile(env) : null,
    // A page a check stopped is handed to the person in their own Chrome by a server that answers them alone.
    userChrome: servesLogins ? {} : null,
    webhookPolicy: { allowHttpLoopback: listen.delivery.allowHttpLoopback },
    workerCount: listen.workerCount,
    accessGrant: listen.accessGrant,
    browserEngine: listen.browserEngine,
    compatHosts: listen.compatHosts,
  })
  const app = createApp(engine, { loopbackOnly: servesLogins, tokens: listen.tokens, exposeInternalErrors: listen.mode === 'local', jobStreams: listen.jobStreams, ...(listen.rateLimit === undefined ? {} : { rateLimit: listen.rateLimit }) })
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
  let stopping: Promise<void> | null = null
  const close = (reason = 'close'): Promise<void> => {
    stopping ??= (async () => {
      server.close()
      workerController.abort(new Error(`w2l-api received ${reason}`))
      await engine.close({cancelActive: true})
      await workerLoop
      deliveryStore.close()
    })()
    return stopping
  }
  if (options.signals !== false) for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
    close(signal).catch((error) => { console.error(error); process.exitCode = 1 })
  })
  for (const notice of listen.notices) log(`w2l-api: ${notice}`)
  log(`w2l-api: ${listen.delivery.notice}`)
  if (listen.rateLimit !== undefined) log(`w2l-api: rate limit ${listen.rateLimit.perMinute} requests per minute per caller on scrape, map, crawl and batch starts`)
  // With port 0 the system picks one: the address says which.
  await new Promise<void>((resolve) => server.listening ? resolve() : server.once('listening', () => resolve()))
  const address = server.address()
  const port = address !== null && typeof address === 'object' ? address.port : listen.port
  const url = `http://${listen.host}:${port}`
  log(`w2l-api ${listen.mode} listening on ${url}`)
  return { url, close }
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  runApiServer(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
