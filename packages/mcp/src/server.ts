import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
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
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (options.allowedTools && !options.allowedTools.has(request.params.name)) throw new Error('tool not available in this deployment')
    options.authorizeCall?.(request.params.name,request.params.arguments ?? {})
    const args = options.normalizeCall?.(request.params.name, request.params.arguments ?? {}) ?? request.params.arguments ?? {}
    // A cancelled MCP request cancels the REST call behind it, so a client
    // that gives up does not leave a scrape running to completion.
    const result = await callTool(client, request.params.name, args, { signal: extra.signal })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })
  return server
}
