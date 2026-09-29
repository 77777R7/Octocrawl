import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isInitializeRequest, type RequestId } from '@modelcontextprotocol/sdk/types.js'

/** Calls a notifications/cancelled can reach at once; a call past this many is still stopped when its client disconnects. */
export const MAX_CANCELLABLE_CALLS = 10_000

/** One call: its signal, and `end` to call when it is over. */
export interface TrackedCall {
  signal: AbortSignal
  end(): void
}

/** The calls one POST makes. */
export interface PostCalls {
  begin(requestId: RequestId): TrackedCall
  /** A notifications/cancelled from this POST's client: stops that client's call with this id, in this POST or another. */
  cancel(requestId: RequestId): void
  /** The POST's client went away: stops every call the POST made. */
  abortAll(reason: unknown): void
}

/**
 * The tool calls in flight on a stateless Streamable HTTP service. Every POST
 * gets a new MCP server, so a notifications/cancelled, which comes in a later
 * POST, cannot reach its call through the MCP SDK; it comes here instead.
 * Request ids are chosen by clients and repeat across clients, so a call is
 * found by its client's scope and its id together, and a cancellation only
 * ever reaches a call of the same client. A call is registered while it runs
 * and removed when it ends.
 */
export class InFlightCalls {
  private readonly calls = new Map<string, Set<AbortController>>()
  private count = 0

  constructor(private readonly limit = MAX_CANCELLABLE_CALLS) {}

  /** The calls of one POST. `scope` identifies the POST's client; null means nothing does, and no notification can reach its calls. */
  open(scope: string | null): PostCalls {
    const own = new Map<AbortController, RequestId>()
    return {
      begin: (requestId) => {
        const controller = new AbortController()
        own.set(controller, requestId)
        const key = scope === null ? null : this.add(callKey(scope, requestId), controller)
        return {
          signal: controller.signal,
          end: () => { own.delete(controller); if (key !== null) this.remove(key, controller) },
        }
      },
      cancel: (requestId) => {
        const cause = new DOMException('the MCP client cancelled the call', 'AbortError')
        for (const [controller, id] of own) if (id === requestId) controller.abort(cause)
        if (scope !== null) for (const controller of this.calls.get(callKey(scope, requestId)) ?? []) controller.abort(cause)
      },
      abortAll: (reason) => { for (const controller of own.keys()) controller.abort(reason) },
    }
  }

  /** Calls a notification can reach now. */
  get size(): number { return this.count }

  private add(key: string, controller: AbortController): string | null {
    if (this.count >= this.limit) return null
    const set = this.calls.get(key) ?? new Set<AbortController>()
    set.add(controller)
    this.calls.set(key, set)
    this.count++
    return key
  }

  private remove(key: string, controller: AbortController): void {
    const set = this.calls.get(key)
    if (!set?.delete(controller)) return
    this.count--
    if (set.size === 0) this.calls.delete(key)
  }
}

/**
 * A client's scope, from what identifies it apart from its session (the
 * hosted service's bearer token; nothing on the local service) and its
 * session id. Null when neither exists. Only a hash is kept, never the token.
 */
export function clientScope(identity: readonly string[], session: string | null): string | null {
  if (identity.length === 0 && session === null) return null
  return createHash('sha256').update(JSON.stringify([identity, session])).digest('hex')
}

/**
 * Wires one POST of a stateless Streamable HTTP service to `calls`: an
 * initialize request gets a new session id (the service keeps no session;
 * the id only tells one client's calls from another's), and the calls are
 * stopped when the client disconnects before the answer, which no one could
 * then receive, as the service cannot resume a response.
 */
export function trackPost(calls: InFlightCalls, req: IncomingMessage, res: ServerResponse, body: unknown, identity: readonly string[]): PostCalls {
  const header = req.headers['mcp-session-id']
  const session = typeof header === 'string' && header.length > 0 ? header : null
  const post = calls.open(clientScope(identity, session))
  if ((Array.isArray(body) ? body : [body]).some(message => isInitializeRequest(message))) res.setHeader('mcp-session-id', randomUUID())
  res.once('close', () => { if (!res.writableFinished) post.abortAll(new DOMException('the MCP client disconnected before the result', 'AbortError')) })
  return post
}

function callKey(scope: string, requestId: RequestId): string {
  return `${scope}:${typeof requestId === 'number' ? 'n' : 's'}:${requestId}`
}
