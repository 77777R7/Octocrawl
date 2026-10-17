import { CLIENT_INFO_META_KEY, Server, type Implementation, type Tool } from '@modelcontextprotocol/server'
import { isApiErrorCode } from '@w2l/contracts'
import { W2L, W2LError } from '@w2l/sdk'
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
  /** Said after "this server offers ..." when a client calls a tool this deployment leaves out: where the tool does run. */
  unavailableHint?: string
  /** The API this server calls, named when it cannot be reached (a local server's base URL). */
  apiUrl?: string
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
    // Over stdio a notifications/cancelled reaches the request's own signal; over HTTP, the POST's calls too.
    const signal = call === undefined ? ctx.mcpReq.signal : AbortSignal.any([ctx.mcpReq.signal, call.signal])
    try {
      // A tool this deployment leaves out stays a protocol error, as the spec has an unknown tool, but says what is offered.
      if (options.allowedTools && !options.allowedTools.has(request.params.name)) {
        throw new Error(`tool not available in this deployment: ${request.params.name}; this server offers ${[...options.allowedTools].join(', ')}.${options.unavailableHint === undefined ? '' : ` ${options.unavailableHint}`}`)
      }
      let result: unknown
      try {
        options.authorizeCall?.(request.params.name,request.params.arguments ?? {})
        const args = options.normalizeCall?.(request.params.name, request.params.arguments ?? {}) ?? request.params.arguments ?? {}
        // Every call is recorded under this client's name and version; the tools take no origin of their own.
        // A 2026-07-28 request names its client itself; a 2025-era one named it in initialize.
        const named = (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[CLIENT_INFO_META_KEY] as Implementation | undefined
        result = await callTool(client, request.params.name, args, { signal, origin: mcpOrigin(named ?? server.getClientVersion()) })
      } catch (error) {
        if (signal.aborted) throw requestCancelled()
        if (error instanceof Error && error.message.startsWith('unknown tool: ')) throw withErrorCode(error)
        // A call that did not run is a tool result the client hands the model (docs/mcp-client-ux-tasks.md W5).
        return toolErrorResult(error, request.params.name, options.apiUrl)
      }
      if (signal.aborted) throw requestCancelled()
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

/** The tools that read or act on a crawl or batch by its id: an unknown id there means the job is gone or never was. */
const JOB_ID_TOOL = /^(get_crawl|get_crawl_pages|get_crawl_errors|cancel_crawl|resume_crawl|get_batch|get_batch_items|get_batch_errors|wait_batch|cancel_batch|hand_off_batch)$/
/** The longest error text: Claude Code keeps the first and last 5,000 characters of a longer one. */
const ERROR_TEXT_MAX = 4_000

/** The links in a text without their utm_* parameters, which a model has no use for (REST keeps them); prose is left alone. */
export function withoutCampaign(text: string): string {
  return text.replace(/https?:\/\/[^\s)]+/g, (link) => {
    let url: URL
    try { url = new URL(link) } catch { return link }
    const tags = [...url.searchParams.keys()].filter((key) => key.startsWith('utm_'))
    if (tags.length === 0) return link
    for (const key of tags) url.searchParams.delete(key)
    return url.toString()
  })
}

/**
 * A failed call as the tool result the model reads: `<code>: <what happened>`, then `Retry after N s` when the
 * server said how long, then one `Next: ...` line per agentHint; `_meta['octocrawl/error']` keeps { code, status }
 * for code. A W2LError carries the API's code, message, hints and Retry-After; a RequestError the local parser's.
 */
export function toolErrorResult(error: unknown, tool: string, apiUrl?: string): { isError: true; content: [{ type: 'text'; text: string }]; _meta: Record<string, unknown> } {
  const failure = error instanceof Error && error.cause instanceof W2LError ? error.cause : error
  let code = 'error'
  let status: number | null = null
  let message = failure instanceof Error ? failure.message : String(failure)
  let hints: readonly string[] = []
  let retryAfterSeconds: number | null = null
  if (failure instanceof W2LError) {
    const body = (failure.body !== null && typeof failure.body === 'object' ? failure.body : {}) as { code?: unknown; error?: unknown; retryAfterSeconds?: unknown }
    code = failure.code ?? (typeof body.code === 'string' && /^[a-z_]+$/.test(body.code) ? body.code : `http_${failure.status}`)
    status = failure.status
    if (typeof body.error === 'string' && body.error.length > 0) message = body.error
    hints = failure.agentHints
    retryAfterSeconds = typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : failure.retryAfterMs === null ? null : Math.max(1, Math.ceil(failure.retryAfterMs / 1000))
  } else if (failure instanceof Error && isApiErrorCode((failure as { code?: unknown }).code)) {
    const coded = failure as unknown as { code: string; status?: unknown; agentHints?: readonly string[] }
    code = coded.code
    status = typeof coded.status === 'number' ? coded.status : null
    hints = coded.agentHints ?? []
  } else if (unreachable(failure)) {
    code = 'api_unreachable'
    message = `no Octocrawl API answered${apiUrl === undefined ? '' : ` at ${apiUrl}`}; start it with npx octocrawl serve, or set W2L_API_URL`
  }
  const next = [...hints]
  if (code === 'not_found' && JOB_ID_TOOL.test(tool)) next.push('the id is unknown, or its job was removed; start a new crawl or batch')
  const lines = [`${code}: ${message.split('\n')[0]}`]
  if (retryAfterSeconds !== null) lines.push(`Retry after ${retryAfterSeconds} s`)
  for (const hint of next) lines.push(`Next: ${hint}`)
  let text = withoutCampaign(lines.join('\n'))
  if (text.length > ERROR_TEXT_MAX) text = `${text.slice(0, ERROR_TEXT_MAX - 1)}…`
  return { isError: true, content: [{ type: 'text', text }], _meta: { 'octocrawl/error': { code, status } } }
}

/** Whether the API could not be reached at all: a refused or failed connection, not an answer. */
function unreachable(error: unknown): boolean {
  for (let current = error, depth = 0; current instanceof Error && depth < 4; current = current.cause, depth++) {
    const code = (current as { code?: unknown }).code
    // A connection the host refused or a name that did not resolve; a TLS failure is not "start the API".
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return true
  }
  return false
}
