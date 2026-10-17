import { CLIENT_INFO_META_KEY, Server, type Implementation, type Tool } from '@modelcontextprotocol/server'
import { isApiErrorCode } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import type { PostCalls } from './inFlight.js'
import { callTool, TOOLS } from './tools.js'

export interface McpServerOptions {
  allowedTools?: ReadonlySet<string>
  /** The definitions tools/list answers with, when a deployment offers its own copies (hosted Octocrawl's are read-only). */
  tools?: readonly object[]
  authorizeCall?: (name: string, args: unknown) => void
  normalizeCall?: (name: string, args: unknown) => unknown
  /**
   * Over Streamable HTTP, where every POST gets a new server: the calls of this
   * POST, stopped by a notifications/cancelled from the same client in any
   * POST, or when the POST's client disconnects.
   */
  calls?: PostCalls
}

/** This server's own version: the `origin` of a call whose client declared no name and version. */
export const MCP_VERSION = '0.5.0'

/**
 * The `origin` W2L records for this client's calls: `mcp-<client name>@<client
 * version>` from the client's `initialize`, with anything that is not
 * printable ASCII without spaces written as `_` and cut to the 100 characters
 * the API takes; `mcp@<version>` when the client declared none.
 */
export function mcpOrigin(client: { name: string; version: string } | undefined): string {
  if (client === undefined) return `mcp@${MCP_VERSION}`
  return `mcp-${client.name}@${client.version}`.replace(/[^\x21-\x7e]/g, '_').slice(0, 100)
}

export function createMcpServer(client: W2L, options: McpServerOptions = {}): Server {
  const server = new Server({ name: 'octocrawl', version: MCP_VERSION }, { capabilities: { tools: {} } })

  server.setRequestHandler('tools/list', async () => ({ tools: [...(options.tools ?? TOOLS.filter(tool => options.allowedTools === undefined || options.allowedTools.has(tool.name)))] as unknown as Tool[] }))
  const calls = options.calls
  // Replaces the SDK's own handler, which reaches only the calls of this server, that is of this POST.
  if (calls) server.setNotificationHandler('notifications/cancelled', notification => {
    if (notification.params.requestId !== undefined) calls.cancel(notification.params.requestId)
  })
  // The client cancelling a call (notifications/cancelled) aborts its signal: the API request it made, and a wait, stop.
  server.setRequestHandler('tools/call', async (request, ctx) => {
    const call = calls?.begin(ctx.mcpReq.id)
    try {
      if (options.allowedTools && !options.allowedTools.has(request.params.name)) throw new Error('tool not available in this deployment')
      options.authorizeCall?.(request.params.name,request.params.arguments ?? {})
      const args = options.normalizeCall?.(request.params.name, request.params.arguments ?? {}) ?? request.params.arguments ?? {}
      const signal = call === undefined ? ctx.mcpReq.signal : AbortSignal.any([ctx.mcpReq.signal, call.signal])
      let result: unknown
      // Every call is recorded under this client's name and version; the tools take no origin of their own.
      // A 2026-07-28 request names its client itself; a 2025-era one named it in initialize.
      const named = (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_INFO_META_KEY] as Implementation | undefined
      try { result = await callTool(client, request.params.name, args, { signal, origin: mcpOrigin(named ?? server.getClientVersion()) }) }
      catch (error) { throw call?.signal.aborted ? requestCancelled() : withErrorCode(error) }
      if (call?.signal.aborted) throw requestCancelled()
      // A tool that declares an outputSchema answers its result as structuredContent too.
      const declared = TOOLS.find(tool => tool.name === request.params.name)
      const structured = declared !== undefined && 'outputSchema' in declared
      return { content: [{ type: 'text', text: JSON.stringify(result) }], ...(structured ? { structuredContent: result as Record<string, unknown> } : {}) }
    } finally { call?.end() }
  })
  return server
}

/**
 * The answer to a call cancelled over HTTP. The POST that carried the call
 * still needs one; the client ignores it. Code 0 and this message are what the
 * MCP Python SDK sends for a cancelled request.
 */
function requestCancelled(): Error {
  return Object.assign(new Error('Request cancelled'), { code: 0 })
}

/** A failure with an API error code (W2LError, RequestError) reads "<code>: <message>"; the JSON-RPC error data carries { code, status }. */
function withErrorCode(error: unknown): unknown {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown }
  if (!(error instanceof Error) || !isApiErrorCode(code)) return error
  return Object.assign(new Error(`${code}: ${error.message}`, { cause: error }), { data: { code, status } })
}
