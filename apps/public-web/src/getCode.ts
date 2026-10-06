/** The same extraction on your own computer, for the hero's Get code panel: the local REST API (`npx octocrawl serve`)
 * and the MCP server (`npx -y @octocrawl/mcp`), with no daily limit. It follows the URL, the chosen view and the options. Pure functions,
 * so they are tested without a page. */

/** What the result panel shows: readable Markdown, the page's links, what the page declares about itself, the
 * fields asked for, or the whole result. */
export type OutputView = 'markdown' | 'links' | 'info' | 'fields' | 'json'
export type FieldType = 'string' | 'number' | 'boolean' | 'string[]'
export interface FieldRequest { name: string; type: FieldType }
export interface CodeRequest {
  url: string
  view: OutputView
  onlyMainContent: boolean
  fields: readonly FieldRequest[]
}

export const LOCAL_API = 'http://127.0.0.1:8787'
export const MCP_SERVER = 'npx -y @octocrawl/mcp'
export const API_SERVER = 'npx octocrawl serve'

/** A POSIX shell word: single-quoted, with each quote closed, escaped and reopened. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Amazon.sg /dp/{ASIN}: it has its own checked product tool and takes no options. */
export function isAmazonProduct(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (parsed.hostname === 'amazon.sg' || parsed.hostname === 'www.amazon.sg') && /^\/dp\/[A-Z0-9]{10}\/?$/i.test(parsed.pathname)
  } catch { return false }
}

/** The JSON Schema for the fields asked for: a flat object, every field nullable, since a field the page does not
 * state comes back null with a reason rather than invented. */
export function fieldsSchema(fields: readonly FieldRequest[]): Record<string, unknown> | null {
  if (!fields.length) return null
  const properties: Record<string, unknown> = {}
  for (const field of fields) {
    properties[field.name] = field.type === 'string[]'
      ? { type: ['array', 'null'], items: { type: 'string' } }
      : { type: [field.type, 'null'] }
  }
  return { type: 'object', properties, required: fields.map(field => field.name), additionalProperties: false }
}

/** The local API's formats for a view: the page's metadata comes with every result. */
function localFormats(request: CodeRequest): unknown[] {
  const schema = fieldsSchema(request.fields)
  const base = request.view === 'links' ? ['links'] : request.view === 'json' ? ['markdown', 'links'] : ['markdown']
  return schema === null ? base : [...base, { type: 'json', schema }]
}

/** The body for local `POST /v1/scrape`. */
export function restBody(request: CodeRequest): Record<string, unknown> {
  if (isAmazonProduct(request.url)) return { url: request.url, formats: ['markdown', 'json'] }
  return { url: request.url, formats: localFormats(request), ...(request.onlyMainContent ? {} : { onlyMainContent: false }) }
}

export function restSnippet(request: CodeRequest): string {
  return [
    '# Start the local API first: npx octocrawl serve',
    `curl -sS -X POST ${LOCAL_API}/v1/scrape \\`,
    `  -H 'content-type: application/json' \\`,
    `  -d ${shellQuote(JSON.stringify(restBody(request)))}`,
  ].join('\n')
}

/** The local MCP tool call: `scrape_product` for an Amazon.sg product, `scrape` for any other page. */
export function mcpCall(request: CodeRequest): { tool: string; arguments: Record<string, unknown> } {
  if (isAmazonProduct(request.url)) return { tool: 'scrape_product', arguments: { url: request.url } }
  return { tool: 'scrape', arguments: restBody(request) }
}

/** The call as JSON, its arguments on one line so a short call stays short. */
export function mcpSnippet(request: CodeRequest): string {
  const call = mcpCall(request)
  return `{\n  "tool": ${JSON.stringify(call.tool)},\n  "arguments": ${JSON.stringify(call.arguments)}\n}`
}

/** What to ask an MCP client with the Octocrawl server added. */
export function mcpPrompt(request: CodeRequest): string {
  if (isAmazonProduct(request.url)) return `Use Octocrawl's scrape_product tool on ${request.url} and show the checked product fields.`
  const wanted = request.fields.length ? `these fields: ${request.fields.map(field => field.name).join(', ')}`
    : request.view === 'links' ? 'its links'
      : request.view === 'info' ? 'its page metadata'
        : request.view === 'json' ? 'the full result'
          : 'its readable Markdown'
  return `Use Octocrawl's scrape tool on ${request.url}${request.onlyMainContent ? '' : ' (the whole page, not only the main content)'} and return ${wanted}.`
}
