import { afterEach, expect, it } from 'vitest'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from '@modelcontextprotocol/client'
import { evaluateHostname } from '@w2l/contracts'
import { createLocalService, localConfigFromEnv } from '../src/localHost.js'

let close:(()=>Promise<void>)|undefined
let root:string|undefined
afterEach(async()=>{await close?.();close=undefined;if(root)await rm(root,{recursive:true,force:true});root=undefined})

it('only opts the local delivery worker into loopback egress explicitly',()=>{
  expect(localConfigFromEnv({}).deliveryNetworkPolicy).toBeUndefined()
  const policy=localConfigFromEnv({W2L_LOCAL_DELIVERY_LOOPBACK:'1'}).deliveryNetworkPolicy!
  expect(evaluateHostname('127.0.0.1',policy)?.allowed).toBe(true)
  expect(evaluateHostname('192.168.1.5',policy)?.allowed).toBe(false)
  expect(evaluateHostname('169.254.169.254',policy)?.allowed).toBe(false)
})

it('routes local capture through the environment proxy the service starts with',()=>{
  expect(localConfigFromEnv({}).networkPolicy).toBeUndefined()
  expect(localConfigFromEnv({HTTPS_PROXY:'http://127.0.0.1:7890'}).networkPolicy?.egressProxy?.https?.endpoint).toBe('127.0.0.1:7890')
  expect(localConfigFromEnv({HTTPS_PROXY:'http://127.0.0.1:7890',W2L_PROXY:'off'}).networkPolicy).toBeUndefined()
})

it('declares the operator contact the service starts with',()=>{
  expect(localConfigFromEnv({W2L_CONTACT:'Jane Doe jane@example.org'}).networkPolicy?.contact).toBe('Jane Doe jane@example.org')
  expect(()=>localConfigFromEnv({W2L_CONTACT:'Jane (lab)'})).toThrow(/W2L_CONTACT/)
})

it('serves all tools on loopback and preserves Monitor state across MCP connections',async()=>{
  const probe=createServer()
  probe.listen(0,'127.0.0.1');await once(probe,'listening')
  const port=(probe.address() as AddressInfo).port
  await new Promise<void>(done=>probe.close(()=>done()))
  root=await mkdtemp(join(tmpdir(),'w2l-local-host-'))
  const service=createLocalService({taskRoot:root,port})
  close=service.close
  if(!service.server.listening)await once(service.server,'listening')
  // The keep-alive idle timeout goes through closeIdleOnlyWhenUnread (packages/api/test/keepAlive.test.ts tests it).
  expect(service.server.listenerCount('timeout')).toBe(1)
  const base=`http://127.0.0.1:${port}`
  expect((await fetch(`${base}/healthz`)).status).toBe(200)
  expect((await fetch(`${base}/mcp`,{method:'GET'})).status).toBe(405)
  expect((await fetch(`${base}/healthz`,{headers:{origin:'https://evil.example'}})).status).toBe(403)
  const wrongHost=await new Promise<number>((done,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path:'/healthz',headers:{host:'evil.example'}},res=>{res.resume();done(res.statusCode??0)})
    req.once('error',reject);req.end()
  })
  expect(wrongHost).toBe(403)
  const connect=async()=>{
    const client=new Client({name:'w2l-local-test',version:'1.0.0'})
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
    return client
  }
  const first=await connect()
  try {
    const tools=await first.listTools()
    expect(tools.tools.map(tool=>tool.name)).toContain('scrape')
    expect(tools.tools.map(tool=>tool.name)).toContain('create_monitor')
    expect(tools.tools.map(tool=>tool.name)).toContain('list_deliveries')
    const created=await first.callTool({name:'create_monitor',arguments:{preset:'firecrawl-introduction'}})
    expect(created.isError).not.toBe(true)
  } finally {await first.close()}
  const second=await connect()
  try {
    const view=await second.callTool({name:'get_monitor',arguments:{id:'firecrawl-introduction'}})
    const item=(view.content as CallToolResult['content']|undefined)?.find(entry=>entry.type==='text')
    expect(item?.type).toBe('text')
    if(item?.type==='text')expect(JSON.parse(item.text)).toMatchObject({enabled:false})
  } finally {await second.close()}
})

it('serves MCP 2026-07-28 without a session, still answers a 2025-11-25 initialize, and refuses other versions as the spec says',async()=>{
  const probe=createServer()
  probe.listen(0,'127.0.0.1');await once(probe,'listening')
  const port=(probe.address() as AddressInfo).port
  await new Promise<void>(done=>probe.close(()=>done()))
  root=await mkdtemp(join(tmpdir(),'w2l-local-host-'))
  const service=createLocalService({taskRoot:root,port})
  close=service.close
  if(!service.server.listening)await once(service.server,'listening')
  const url=`http://127.0.0.1:${port}/mcp`
  const post=(body:unknown,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...headers},body:JSON.stringify(body)})
  const refused=await post({jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{'mcp-protocol-version':'1999-01-01'})
  expect(refused.status).toBe(400)
  const error=((await refused.json()) as {error:{code:number;data:{supported:string[];requested:string}}}).error
  expect(error).toMatchObject({code:-32022,data:{requested:'1999-01-01'}})
  expect(error.data.supported).toEqual(expect.arrayContaining(['2026-07-28','2025-11-25']))
  const initialize=await post({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'t',version:'1'}}})
  expect(initialize.status).toBe(200)
  expect(((await initialize.json()) as {result:{protocolVersion:string}}).result.protocolVersion).toBe('2025-11-25')
  const client=new ModernClient({name:'w2l-local-modern-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}})
  try {
    await client.connect(new ModernTransport(new URL(url)))
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28')
    expect((await client.listTools()).tools.map(tool=>tool.name)).toContain('create_monitor')
    const listed=await client.callTool({name:'list_monitors',arguments:{}})
    expect(listed.isError).not.toBe(true)
  } finally {await client.close()}
})
