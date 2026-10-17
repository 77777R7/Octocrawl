#!/usr/bin/env node
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio'
import type { Transport } from '@modelcontextprotocol/server'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { W2L } from '@w2l/sdk'
import { createMcpServer } from './server.js'

export function parseBaseUrl(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const flag = argv.find((arg) => arg.startsWith('--base-url='))
  if (flag !== undefined) return flag.slice('--base-url='.length)
  const idx = argv.indexOf('--base-url')
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1]!
  return env['W2L_API_URL'] ?? 'http://127.0.0.1:8787'
}

export function parseToken(argv: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  const flag = argv.find((arg) => arg.startsWith('--token='))
  if (flag !== undefined) return flag.slice('--token='.length)
  const idx = argv.indexOf('--token')
  if (idx >= 0 && argv[idx + 1] !== undefined) return argv[idx + 1]
  const envToken = env['W2L_API_TOKEN']
  return envToken !== undefined && envToken.length > 0 ? envToken : undefined
}

/**
 * Serves MCP over stdio (or `transport`): a client opening with server/discover is
 * served on 2026-07-28, one opening with initialize on its 2025-era revision.
 */
export function serveMcpStdio(client: W2L, transport?: Transport): StdioServerHandle {
  return serveStdio(() => createMcpServer(client), transport === undefined ? {} : { transport })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const baseUrl = parseBaseUrl(argv, process.env)
  const token = parseToken(argv, process.env)
  serveMcpStdio(new W2L({ baseUrl, token }))
}

// Run as the bin: through node_modules/.bin the entry is a symlink, so its real path is compared.
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
