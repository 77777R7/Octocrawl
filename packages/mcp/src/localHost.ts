import { createServer, type Server as HttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hostedNetworkPolicy, localNetworkPolicy, withEnvironmentProxy, withOperatorContact, type NetworkPolicy } from '@w2l/contracts'
import { closeIdleOnlyWhenUnread, defaultSessionsFile, loadEngineConfig, tunedPolicy, type EngineConfig } from '@w2l/api'
import { createManagedRuntime } from './managedRuntime.js'
import { createMcpServer } from './server.js'
import { validateAmazonPublicState } from './amazonState.js'
import { InFlightCalls, trackPost } from './inFlight.js'
import { serveMcpPost, servesProtocolVersion, unsupportedProtocolVersion } from './serveHttp.js'

export interface LocalConfig {
  taskRoot: string
  port: number
  monitorPollMs?: number
  deliveryPollMs?: number
  networkPolicy?: NetworkPolicy
  deliveryNetworkPolicy?: NetworkPolicy
  amazonPublicState?: string
  /** The engine options from the environment (loadEngineConfig): the access grant and what it turns on, the worker count. Absent: none, as before a grant. */
  engine?: EngineConfig
  /** Startup lines about the configuration, printed once by the service's command. */
  notices?: string[]
}

export function localConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LocalConfig {
  const port = Number(env.W2L_LOCAL_MCP_PORT ?? 8791)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('W2L_LOCAL_MCP_PORT must be 1..65535')
  const monitorPollMs=Number(env.W2L_LOCAL_MONITOR_POLL_MS ?? 1000)
  const deliveryPollMs=Number(env.W2L_LOCAL_DELIVERY_POLL_MS ?? 500)
  if (!Number.isSafeInteger(monitorPollMs) || monitorPollMs<10 || monitorPollMs>300_000) throw new Error('W2L_LOCAL_MONITOR_POLL_MS must be 10..300000')
  if (!Number.isSafeInteger(deliveryPollMs) || deliveryPollMs<10 || deliveryPollMs>300_000) throw new Error('W2L_LOCAL_DELIVERY_POLL_MS must be 10..300000')
  if(env.W2L_LOCAL_DELIVERY_LOOPBACK!==undefined && env.W2L_LOCAL_DELIVERY_LOOPBACK!=='1')throw new Error('W2L_LOCAL_DELIVERY_LOOPBACK must be 1 when set')
  const deliveryNetworkPolicy=env.W2L_LOCAL_DELIVERY_LOOPBACK==='1'
    ? {...hostedNetworkPolicy(),privateAllowlist:['127.0.0.1/32','::1/128']}
    : undefined
  const amazonPublicState=env.W2L_AMAZON_PUBLIC_STATE_FILE ? readFileSync(env.W2L_AMAZON_PUBLIC_STATE_FILE,'utf8') : undefined
  if (amazonPublicState !== undefined) validateAmazonPublicState(amazonPublicState)
  // The same engine options the API server and the octocrawl command read (W2L_ACCESS_GRANT, W2L_BROWSER_*, W2L_COMPAT_HOSTS, W2L_EGRESS_*, W2L_WORKER_COUNT).
  const engine=loadEngineConfig(env,{hosted:false})
  // The Amazon.sg state limits the public browser to Amazon's hosts, which leaves no installed_chrome rung (buildChannels).
  // The CAPTCHA solver (ADR 0005 third_party_captcha_solver) is started by the API server and the octocrawl command; this host does not run it yet.
  const notices=[...engine.notices,...(engine.captchaSolver!==null ? ['captcha solver: not used by the local MCP host yet; run octocrawl serve (the API server) to solve under this grant'] : []),...(amazonPublicState!==undefined && (engine.accessGrant?.capabilities ?? []).includes('installed_chrome') ? ['installed_chrome: no rung while W2L_AMAZON_PUBLIC_STATE_FILE is set: that state keeps the browser to Amazon.sg\'s hosts, and the person\'s Chrome is not limited that way (ADR 0005)'] : [])]
  // Capture follows the operator's HTTPS_PROXY/HTTP_PROXY/NO_PROXY, the W2L_PER_HOST_* pacing and declares W2L_CONTACT; delivery keeps its own explicit proxy setting.
  const tuned=env.W2L_PER_HOST_CONCURRENCY!==undefined || env.W2L_PER_HOST_MIN_DELAY_MS!==undefined
  const networkPolicy=withOperatorContact(withEnvironmentProxy(tunedPolicy(localNetworkPolicy(),env),env),env)
  return {taskRoot:resolve(env.W2L_TASK_ROOT ?? '.w2l/api'),port,monitorPollMs,deliveryPollMs,deliveryNetworkPolicy,amazonPublicState,engine,notices,...(networkPolicy.egressProxy||networkPolicy.contact||tuned?{networkPolicy}:{})}
}

/** Single-user local service. It never binds a public interface or exposes REST. */
export function createLocalService(config: LocalConfig): {server: HttpServer; close: () => Promise<void>} {
  if (!Number.isSafeInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('port must be 0..65535')
  const runtime=createManagedRuntime({taskRoot:config.taskRoot,networkPolicy:config.networkPolicy ?? localNetworkPolicy(),deliveryNetworkPolicy:config.deliveryNetworkPolicy,monitorPollMs:config.monitorPollMs,deliveryPollMs:config.deliveryPollMs,exposeInternalErrors:true,sessionsFile:defaultSessionsFile(),userChrome:{},
    ...(config.engine === undefined ? {} : {accessGrant:config.engine.accessGrant,browserEngine:config.engine.browserEngine,browserIdentity:config.engine.browserIdentity,compatHosts:config.engine.compatHosts,egressProxies:config.engine.egressProxies,egressEchoUrl:config.engine.egressEchoUrl,workerCount:config.engine.workerCount}),
    ...(config.amazonPublicState === undefined ? {} : {publicPreferenceState:config.amazonPublicState,
      browserAllowedHosts:['www.amazon.sg','m.media-amazon.com','images-na.ssl-images-amazon.com','images-eu.ssl-images-amazon.com'],
      channelPolicy:(url:string)=>new URL(url).hostname === 'www.amazon.sg' ? 'browser_only' as const : ['docs.firecrawl.dev','modelcontextprotocol.io'].includes(new URL(url).hostname) ? 'http_only' as const : 'ladder' as const})})
  let closing:Promise<void>|null=null
  const calls=new InFlightCalls()
  const sendJson=(res:import('node:http').ServerResponse,status:number,body:unknown)=>{
    res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(body))
  }
  const server=createServer(async(req,res)=>{
    try {
      const address=server.address()
      const port=typeof address==='object' && address ? address.port : config.port
      const origin=`http://127.0.0.1:${port}`
      const pathname=new URL(req.url ?? '/',origin).pathname
      // Host and Origin checks prevent DNS rebinding and browser-origin access.
      if (req.headers.host!==`127.0.0.1:${port}` || (req.headers.origin && req.headers.origin!==origin)) {sendJson(res,403,{error:'invalid local origin'});return}
      if (pathname==='/healthz' && req.method==='GET') {
        const health=runtime.health()
        try {runtime.engine.listMonitors()} catch {sendJson(res,503,{ok:false});return}
        sendJson(res,health.ok?200:503,health);return
      }
      if (pathname!=='/mcp') {sendJson(res,404,{error:'not found'});return}
      if (req.method==='GET' || req.method==='DELETE') {sendJson(res,405,{error:'stream and session management unavailable'});return}
      if (req.method!=='POST') {sendJson(res,405,{error:'method not allowed'});return}
      const version=req.headers['mcp-protocol-version']
      if (!servesProtocolVersion(version)) {sendJson(res,400,unsupportedProtocolVersion(version));return}
      const size=Number(req.headers['content-length'] ?? 0)
      if (size>262_144) {sendJson(res,413,{error:'request too large'});return}
      const chunks:Buffer[]=[]
      let bodyBytes=0
      for await (const chunk of req) {
        const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)
        bodyBytes+=bytes.byteLength
        if (bodyBytes>262_144) {sendJson(res,413,{error:'request too large'});return}
        chunks.push(bytes)
      }
      let body:unknown
      try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
      catch {sendJson(res,400,{error:'invalid JSON'});return}
      // One user, no token: a cancellation reaches only a call of the same MCP session.
      const post=trackPost(calls,req,res,body,[])
      // Progress reaches the client on the 2026-07-28 path, not on the 2025-era JSON one (docs/mcp-client-ux-tasks.md D16).
      await serveMcpPost(req,res,body,({legacy})=>createMcpServer(runtime.client,{calls:post,progress:!legacy}))
    } catch(error) {
      if (!res.headersSent) sendJson(res,500,{error:error instanceof Error?error.message:'internal error'})
      else res.end()
    }
  })
  server.requestTimeout=120_000
  // A crawl's extraction runs in this process and can stall it past the keep-alive timeout: a request sent meanwhile is answered, not reset.
  closeIdleOnlyWhenUnread(server)
  server.listen(config.port,'127.0.0.1')
  return {server,close:()=>{
    if(closing)return closing
    closing=(async()=>{
      // A handoff is a request that waits on the person: end it first, or the server's close would wait for it.
      await runtime.engine.endHandoffs()
      await new Promise<void>(done=>server.close(()=>done()))
      await runtime.close()
    })()
    return closing
  }}
}
