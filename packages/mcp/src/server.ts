import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { isApiErrorCode } from '@w2l/contracts'
import { W2L } from '@w2l/sdk'
import { callTool, TOOLS } from './tools.js'

export interface McpServerOptions {
  allowedTools?: ReadonlySet<string>
  authorizeCall?: (name: string, args: unknown) => void
  normalizeCall?: (name: string, args: unknown) => unknown
}

export function createMcpServer(client: W2L, options: McpServerOptions = {}): Server {
  const server = new Server({ name: 'w2l', version: '0.3.0' }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.filter(tool => options.allowedTools === undefined || options.allowedTools.has(tool.name)) }))
  // The client cancelling a call (notifications/cancelled) aborts extra.signal: the API request it made, and a wait, stop.
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (options.allowedTools && !options.allowedTools.has(request.params.name)) throw new Error('tool not available in this deployment')
    options.authorizeCall?.(request.params.name,request.params.arguments ?? {})
    const args = options.normalizeCall?.(request.params.name, request.params.arguments ?? {}) ?? request.params.arguments ?? {}
    let result: unknown
    try { result = await callTool(client, request.params.name, args, { signal: extra.signal }) }
    catch (error) { throw withErrorCode(error) }
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })
  return server
}

/** A failure with an API error code (W2LError, RequestError) reads "<code>: <message>"; the JSON-RPC error data carries { code, status }. */
function withErrorCode(error: unknown): unknown {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown }
  if (!(error instanceof Error) || !isApiErrorCode(code)) return error
  return Object.assign(new Error(`${code}: ${error.message}`, { cause: error }), { data: { code, status } })
}
