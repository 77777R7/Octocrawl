import { describe, expect, it } from 'vitest'
import { TOOLS, TOOL_NAMES } from '../src/tools.js'
import { hostedTools, oauthTools } from '../src/hostedApi.js'

/**
 * Every tool's title and hints (docs/mcp-client-ux-tasks.md W4). A client treats a tool without hints as one that
 * writes and destroys (the spec's defaults), so Codex in auto mode and VS Code ask the person before each call; with
 * honest hints a read runs without asking and a cancel still asks.
 */
const READ_ONLY = [
  'map', 'scrape_product', 'get_scrape',
  'get_crawl', 'get_crawl_pages', 'get_crawl_errors', 'list_active_crawls',
  'get_batch', 'get_batch_items', 'wait_batch', 'get_batch_errors',
  'list_logins',
  'preview_monitor', 'list_monitors', 'get_monitor', 'get_monitor_run',
  'list_delivery_destinations', 'list_deliveries', 'get_delivery',
]
/** Cancelling a crawl, batch or run, forgetting or replacing a saved login, and pausing a Monitor (which cancels its running execution). */
const DESTRUCTIVE = ['cancel_crawl', 'cancel_batch', 'cancel_monitor_run', 'remove_login', 'import_login', 'pause_monitor']
/** Reads that reach pages on the web, and writes that fetch pages or send webhooks; the rest touch Octocrawl's own records. */
const OPEN_WORLD_READS = ['map', 'scrape_product', 'preview_monitor']

type Annotated = { name: string; title?: string; annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }; _meta?: Record<string, unknown> }
const surfaces: Record<string, readonly Annotated[]> = {
  local: TOOLS as readonly Annotated[],
  'hosted-keyless': hostedTools(false) as readonly Annotated[],
  'hosted-key': hostedTools(true) as readonly Annotated[],
  'oauth-browser': oauthTools(true) as readonly Annotated[],
}

describe('tool titles and hints', () => {
  it('gives every tool on every surface a plain title, the same in annotations, and all four hints as booleans, never read-only and destructive at once', () => {
    for (const [surface, tools] of Object.entries(surfaces)) {
      for (const tool of tools) {
        const a = tool.annotations ?? {}
        expect([surface, tool.name, typeof tool.title, tool.title === a.title]).toEqual([surface, tool.name, 'string', true])
        expect([surface, tool.name, typeof a.readOnlyHint, typeof a.destructiveHint, typeof a.idempotentHint, typeof a.openWorldHint]).toEqual([surface, tool.name, 'boolean', 'boolean', 'boolean', 'boolean'])
        expect([surface, tool.name, a.readOnlyHint === true && a.destructiveHint === true]).toEqual([surface, tool.name, false])
      }
    }
  })

  it('marks as read-only exactly the reads, as destructive exactly the cancels and removals, and the web-facing reads as open-world', () => {
    const local = TOOLS as readonly Annotated[]
    expect(local.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name).sort()).toEqual([...READ_ONLY].sort())
    expect(local.filter((tool) => tool.annotations?.destructiveHint).map((tool) => tool.name).sort()).toEqual([...DESTRUCTIVE].sort())
    for (const name of READ_ONLY) expect([name, local.find((tool) => tool.name === name)?.annotations?.openWorldHint]).toEqual([name, OPEN_WORLD_READS.includes(name)])
    // The local scrape can click, type and read signed in as the person (actions, mode authed, my-browser), so it is not
    // read-only; hosted Octocrawl refuses all of those, so its copy is.
    expect(local.find((tool) => tool.name === 'scrape')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true })
    for (const surface of ['hosted-keyless', 'hosted-key', 'oauth-browser']) {
      for (const tool of surfaces[surface]!) expect([surface, tool.name, tool.annotations?.readOnlyHint]).toEqual([surface, tool.name, true])
    }
  })

  it('lists the general tools first, in the order TOOL_NAMES gives', () => {
    expect(TOOL_NAMES[0]).toBe('scrape')
    expect(TOOLS.map((tool) => tool.name)).toEqual([...TOOL_NAMES])
    expect(TOOL_NAMES.slice(0, 3)).toEqual(['scrape', 'map', 'get_scrape'])
    expect(hostedTools(true).map((tool) => tool.name)).toEqual(['scrape', 'map', 'scrape_product'])
  })

  it('asks the person on every import_login, and gives the hosted tools short status lines; /mcp-oauth keeps them beside its securitySchemes', () => {
    expect((TOOLS as readonly Annotated[]).find((tool) => tool.name === 'import_login')?._meta).toMatchObject({ 'anthropic/requiresUserInteraction': true })
    for (const tool of hostedTools(true) as readonly Annotated[]) {
      const invoking = tool._meta?.['openai/toolInvocation/invoking']
      const invoked = tool._meta?.['openai/toolInvocation/invoked']
      expect([tool.name, typeof invoking, typeof invoked]).toEqual([tool.name, 'string', 'string'])
      expect([tool.name, (invoking as string).length <= 64, (invoked as string).length <= 64]).toEqual([tool.name, true, true])
    }
    for (const tool of oauthTools(true) as readonly Annotated[]) {
      // scrape and map also stay loaded in Claude Code's tool search (W7.5).
      const always = tool.name === 'scrape' || tool.name === 'map' ? ['anthropic/alwaysLoad'] : []
      expect(Object.keys(tool._meta ?? {}).sort(), tool.name).toEqual([...always, 'openai/toolInvocation/invoked', 'openai/toolInvocation/invoking', 'securitySchemes'].sort())
    }
  })
})
