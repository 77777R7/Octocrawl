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
export function serveMcpStdio(client: W2L, transport?: Transport, apiUrl?: string): StdioServerHandle {
  return serveStdio(() => createMcpServer(client, apiUrl === undefined ? {} : { apiUrl }), transport === undefined ? {} : { transport })
}

/**
 * Says once on stderr, which the client logs, when nothing answers at the API's base URL: the first tool call would
 * fail the same way (as api_unreachable). Any HTTP answer counts as reachable. Never blocks the server's start.
 */
export async function warnIfUnreachable(baseUrl: string, log: (line: string) => void = (line) => console.error(line), fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    await fetchImpl(baseUrl, { method: 'GET', signal: AbortSignal.timeout(2_000) })
    return true
  } catch {
    log(`octocrawl-mcp: no Octocrawl API answered at ${baseUrl}; start it with npx octocrawl serve, or set W2L_API_URL`)
    return false
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const baseUrl = parseBaseUrl(argv, process.env)
  const token = parseToken(argv, process.env)
  serveMcpStdio(new W2L({ baseUrl, token }), undefined, baseUrl)
  void warnIfUnreachable(baseUrl)
}

// Run as the bin: through node_modules/.bin the entry is a symlink, so its real path is compared.
const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}
