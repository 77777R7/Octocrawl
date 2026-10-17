import type { IncomingMessage, ServerResponse } from 'node:http'
import { createMcpHandler, isLegacyRequest, SUPPORTED_PROTOCOL_VERSIONS, type Server } from '@modelcontextprotocol/server'
import { NodeStreamableHTTPServerTransport, toNodeHandler, toWebRequest } from '@modelcontextprotocol/node'

/**
 * The MCP revisions every Octocrawl server serves: 2026-07-28, where each request
 * carries its own version, client and capabilities and there is no session, and
 * the 2025-era revisions a client opens with `initialize`.
 */
export const MODERN_PROTOCOL_VERSIONS: readonly string[] = ['2026-07-28']
export const PROTOCOL_VERSIONS: readonly string[] = [...MODERN_PROTOCOL_VERSIONS, ...SUPPORTED_PROTOCOL_VERSIONS]

/** Whether a request's MCP-Protocol-Version header, when it sent one, names a revision this server serves. */
export function servesProtocolVersion(header: string | string[] | undefined): boolean {
  return header === undefined || header === '' || (typeof header === 'string' && PROTOCOL_VERSIONS.includes(header))
}

/**
 * The answer to a request naming a revision this server does not serve: HTTP 400 with
 * the spec's UnsupportedProtocolVersionError (basic/versioning, 2026-07-28), listing both
 * eras' revisions, from which a client picks one and retries. It is sent before the
 * body is read, so the id is null.
 */
export function unsupportedProtocolVersion(header: string | string[] | undefined): object {
  const requested = Array.isArray(header) ? header.join(', ') : String(header)
  return { jsonrpc: '2.0', id: null, error: { code: -32022, message: `Unsupported protocol version: ${requested}`, data: { supported: [...PROTOCOL_VERSIONS], requested } } }
}

/**
 * Answers one POST whose body is already read. A 2026-07-28 request (its `_meta`
 * names the revision) is served on its own by the SDK's modern handler; any other
 * request is served as before, statelessly over a 2025-era transport answering
 * JSON. Each POST gets its own server from `server`, told whether it answers on the
 * 2025-era JSON path, which cannot carry a notification such as progress.
 */
export async function serveMcpPost(req: IncomingMessage, res: ServerResponse, body: unknown, server: (path: { legacy: boolean }) => Server): Promise<void> {
  if (await isLegacyRequest(await toWebRequest(req, body), body)) {
    const mcp = server({ legacy: true })
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    try { await mcp.connect(transport); await transport.handleRequest(req, res, body) }
    finally { await mcp.close() }
    return
  }
  const handler = createMcpHandler(() => server({ legacy: false }), { legacy: 'reject' })
  try { await toNodeHandler(handler)(req, res, body) }
  finally { await handler.close() }
}
