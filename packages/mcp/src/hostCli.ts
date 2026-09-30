#!/usr/bin/env node
import { hostedProxyNotice } from '@w2l/contracts'
import { createHostedService, hostedConfigFromEnv } from './host.js'

const config=hostedConfigFromEnv()
const proxyNotice=hostedProxyNotice(process.env)
if(proxyNotice)console.log(`w2l-hosted-mcp: ${proxyNotice}`)
const service=createHostedService(config)
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{
  void service.close().catch(error=>{console.error(error);process.exitCode=1})
})
console.log(JSON.stringify({service:'w2l-hosted-mcp',url:config.mcpUrl,port:config.port}))
