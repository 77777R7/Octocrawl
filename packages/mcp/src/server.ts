import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, CancelledNotificationSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { isApiErrorCode } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import type { PostCalls } from './inFlight.js'
import { callTool, TOOLS } from './tools.js'

export interface McpServerOptions {
  allowedTools?: ReadonlySet<string>
  authorizeCall?: (name: string, args: unknown) => void
  normalizeCall?: (name: string, args: unknown) => unknown
  /**
   * Over Streamable HTTP, where every POST gets a new server: the calls of this
   * POST, stopped by a notifications/cancelled from the same client in any
   * POST, or when the POST's client disconnects.
   */
  calls?: PostCalls
}

export function createMcpServer(client: W2L, options: McpServerOptions = {}): Server {
  const server = new Server({ name: 'w2l', version: '0.3.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.filter(tool => options.allowedTools === undefined || options.allowedTools.has(tool.name)) }))
  const calls = options.calls
  // Replaces the SDK's own handler, which reaches only the calls of this server, that is of this POST.
  if (calls) server.setNotificationHandler(CancelledNotificationSchema, notification => {
    if (notification.params.requestId !== undefined) calls.cancel(notification.params.requestId)
  })
  // The client cancelling a call (notifications/cancelled) aborts its signal: the API request it made, and a wait, stop.
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const call = calls?.begin(extra.requestId)
    try {
      if (options.allowedTools && !options.allowedTools.has(request.params.name)) throw new Error('tool not available in this deployment')
      options.authorizeCall?.(request.params.name,request.params.arguments ?? {})
      const args = options.normalizeCall?.(request.params.name, request.params.arguments ?? {}) ?? request.params.arguments ?? {}
      const signal = call === undefined ? extra.signal : AbortSignal.any([extra.signal, call.signal])
      let result: unknown
      try { result = await callTool(client, request.params.name, args, { signal }) }
      catch (error) { throw call?.signal.aborted ? requestCancelled() : withErrorCode(error) }
      if (call?.signal.aborted) throw requestCancelled()
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
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
