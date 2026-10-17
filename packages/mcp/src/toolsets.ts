import { RequestError } from '@w2l/contracts'
import type { McpServerOptions } from './server.js'
import { TOOL_NAMES, TOOLS, type ToolName } from './tools.js'

/**
 * The groups a local stdio server can be started with (docs/mcp-client-ux-tasks.md W10): `--toolsets=core,crawl`
 * lists those groups' tools alone, for clients that cap how many tools they take. Every tool is in exactly one group.
 */
export const TOOLSETS = {
  core: ['scrape', 'get_scrape', 'map'],
  crawl: ['crawl', 'get_crawl', 'wait_crawl', 'get_crawl_pages', 'get_crawl_errors', 'cancel_crawl', 'resume_crawl', 'list_active_crawls'],
  batch: ['batch_scrape', 'get_batch', 'get_batch_items', 'wait_batch', 'cancel_batch', 'get_batch_errors', 'hand_off_batch'],
  products: ['scrape_product', 'batch_products'],
  logins: ['import_login', 'list_logins', 'remove_login'],
  monitor: ['preview_monitor', 'create_monitor', 'list_monitors', 'get_monitor', 'run_monitor', 'get_monitor_run', 'pause_monitor', 'resume_monitor', 'cancel_monitor_run'],
  delivery: ['create_delivery_destination', 'list_delivery_destinations', 'pause_delivery_destination', 'resume_delivery_destination', 'list_deliveries', 'get_delivery', 'retry_dead_letter'],
} as const satisfies Record<string, readonly ToolName[]>
export type ToolsetName = keyof typeof TOOLSETS
export const TOOLSET_NAMES = Object.keys(TOOLSETS) as ToolsetName[]

export function toolsetOf(tool: string): ToolsetName | undefined {
  return TOOLSET_NAMES.find((set) => (TOOLSETS[set] as readonly string[]).includes(tool))
}

/** What a stdio server lists: the toolsets asked for (undefined: all of them) and whether it is read-only. */
export interface ToolSelection { toolsets?: readonly ToolsetName[]; readOnly?: boolean }

/** `--toolsets=a,b` or `--toolsets a,b`, else W2L_MCP_TOOLSETS; `all` or nothing lists every group. An unknown name is an error naming the valid ones. */
export function parseToolSelection(argv: readonly string[], env: NodeJS.ProcessEnv): ToolSelection {
  const flag = argv.find((arg) => arg.startsWith('--toolsets='))
  const index = argv.indexOf('--toolsets')
  const raw = flag !== undefined ? flag.slice('--toolsets='.length) : index >= 0 ? argv[index + 1] : env['W2L_MCP_TOOLSETS']
  const readOnly = argv.includes('--read-only') || ['1', 'true'].includes((env['W2L_MCP_READ_ONLY'] ?? '').toLowerCase())
  if (raw === undefined || raw.trim() === '') return { readOnly }
  const names = raw.split(',').map((name) => name.trim()).filter((name) => name !== '')
  const unknown = names.filter((name) => name !== 'all' && !(TOOLSET_NAMES as string[]).includes(name))
  if (unknown.length > 0 || names.length === 0) throw new Error(`unknown toolset${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ') || raw}; the toolsets are ${[...TOOLSET_NAMES, 'all'].join(', ')}`)
  if (names.includes('all')) return { readOnly }
  return { toolsets: TOOLSET_NAMES.filter((name) => names.includes(name)), readOnly }
}

/** The scrape options that act as the person or wait for them, which a read-only server leaves out (W10.2). */
const ACTS_AS_PERSON = ['actions', 'lane', 'handoff'] as const

/**
 * A copy of scrape's input schema keeping only the properties `keep` accepts, with `mode` limited to standard and
 * research and the given description. Hosted Octocrawl's schema (hostedApi.ts) and the read-only one are built with it.
 */
export function scrapeSchemaWithout(schema: unknown, keep: (key: string) => boolean, modeDescription: string): { properties: Record<string, Record<string, unknown>> } {
  const copy = structuredClone(schema) as { properties: Record<string, Record<string, unknown>> }
  for (const key of Object.keys(copy.properties)) if (!keep(key)) delete copy.properties[key]
  copy.properties.mode = { type: 'string', enum: ['standard', 'research'], description: modeDescription }
  return copy
}

/** The read-only server's scrape: nothing that acts as the person, so a client can run it without asking. */
function readOnlyScrape(tool: (typeof TOOLS)[number]) {
  const inputSchema = scrapeSchemaWithout(tool.inputSchema, (key) => !(ACTS_AS_PERSON as readonly string[]).includes(key), 'The declared identity the page is read under: standard (default) or research. A read-only server reads no saved login.')
  inputSchema.properties.access = { ...inputSchema.properties.access, enum: ['standard', 'enhanced'], description: 'standard (default): no third-party cost; enhanced: also operator-approved paid providers.' }
  return { ...tool, inputSchema, annotations: { ...tool.annotations, readOnlyHint: true } }
}

/** Refuses on a read-only server the scrape arguments its schema leaves out, as a client may send them anyway. */
function refuseActingAsPerson(name: string, args: unknown): void {
  if (name !== 'scrape' || args === null || typeof args !== 'object') return
  const rec = args as Record<string, unknown>
  const used = [
    ...ACTS_AS_PERSON.filter((key) => rec[key] !== undefined),
    ...(rec.mode === 'authed' ? ['mode authed'] : []),
    ...(rec.access === 'my-browser' ? ['access my-browser'] : []),
  ]
  if (used.length > 0) throw new RequestError(`${used.join(', ')} act as the person and this server is read-only (--read-only); start it without that flag to use them`, 'unsupported_parameter')
}

/** The McpServerOptions that list `selection` and say how to reach a tool it leaves out. Undefined for every tool, read-write. */
export function selectionOptions(selection: ToolSelection): Pick<McpServerOptions, 'allowedTools' | 'tools' | 'unavailableHint' | 'authorizeCall'> {
  const inSets = selection.toolsets === undefined ? TOOL_NAMES : TOOL_NAMES.filter((name) => (selection.toolsets as readonly string[]).includes(toolsetOf(name)!))
  if (selection.toolsets === undefined && selection.readOnly !== true) return {}
  const listed = TOOLS
    .filter((tool) => (inSets as readonly string[]).includes(tool.name))
    .filter((tool) => selection.readOnly !== true || tool.annotations.readOnlyHint || tool.name === 'scrape')
    .map((tool) => (selection.readOnly === true && tool.name === 'scrape' ? readOnlyScrape(tool) : tool))
  return {
    allowedTools: new Set(listed.map((tool) => tool.name)),
    tools: listed,
    unavailableHint: (name: string) => {
      const set = toolsetOf(name)
      if (set !== undefined && !(inSets as readonly string[]).includes(name)) return `Enable it with --toolsets=${set} (or W2L_MCP_TOOLSETS).`
      if (selection.readOnly === true) return 'It is left out by --read-only, as it changes something or acts as the person.'
      return undefined
    },
    ...(selection.readOnly === true ? { authorizeCall: refuseActingAsPerson } : {}),
  }
}
