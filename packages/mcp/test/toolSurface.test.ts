import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020Module from 'ajv/dist/2020.js'
import { TOOLS } from '../src/tools.js'
import { selectionOptions } from '../src/toolsets.js'
import { hostedTools, oauthTools } from '../src/hostedApi.js'

/**
 * What every MCP client is handed, surface by surface (docs/mcp-client-ux-tasks.md W2): the size of each tool's
 * definition, and whether its schemas are ones a strict client accepts. The local list is the one stdio and the
 * 8791 host serve; host.ts (the WorkOS pilot, never deployed) has its own REMOTE_TOOLS and is left out on purpose.
 *
 * Input schema bytes and description characters are a ratchet: a change may lower them, and then lowers the budget
 * in toolSurface.budget.json with it; it may not raise them. W2L_TOOL_BUDGET_WRITE=1 rewrites the file from the
 * current definitions, and W2L_TOOL_SURFACE_REPORT=1 prints every column.
 */

type Tool = { name: string; title?: unknown; description: string; inputSchema: Record<string, unknown>; outputSchema?: unknown; annotations?: unknown; _meta?: Record<string, unknown> }

const SURFACES: Record<string, readonly Tool[]> = {
  local: TOOLS as readonly Tool[],
  'hosted-keyless': hostedTools(false) as readonly Tool[],
  'hosted-key': hostedTools(true) as readonly Tool[],
  'oauth-http': oauthTools(false) as readonly Tool[],
  'oauth-browser': oauthTools(true) as readonly Tool[],
  // A stdio server started with --toolsets=core, or with --read-only (docs/mcp-client-ux-tasks.md W10.6).
  'local-core': selectionOptions({ toolsets: ['core'] }).tools as readonly Tool[],
  'local-read-only': selectionOptions({ readOnly: true }).tools as readonly Tool[],
}

const BUDGET_FILE = fileURLToPath(new URL('./toolSurface.budget.json', import.meta.url))
type Budget = Record<string, Record<string, { inputBytes: number; descriptionChars: number }>>

const bytes = (value: unknown) => value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value))
/** A schema with every description string removed: what is left when a client (Codex past 5,000 bytes) strips them. */
function structure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structure)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => !(key === 'description' && typeof entry === 'string')).map(([key, entry]) => [key, structure(entry)]))
}
/** Every description string inside a schema, at any depth. */
function descriptionsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(descriptionsOf)
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, entry]) => key === 'description' && typeof entry === 'string' ? [entry] : descriptionsOf(entry))
}
function measure(tool: Tool) {
  return {
    inputBytes: bytes(tool.inputSchema),
    structureBytes: bytes(structure(tool.inputSchema)),
    descriptionChars: tool.description.length,
    metaBytes: bytes({ title: tool.title, annotations: tool.annotations, _meta: tool._meta }),
    outputBytes: bytes(tool.outputSchema),
  }
}

describe('MCP tool surfaces', () => {
  if (process.env.W2L_TOOL_BUDGET_WRITE === '1') {
    const budget: Budget = Object.fromEntries(Object.entries(SURFACES).map(([surface, tools]) => [surface, Object.fromEntries(tools.map((tool) => {
      const { inputBytes, descriptionChars } = measure(tool)
      return [tool.name, { inputBytes, descriptionChars }]
    }))]))
    writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`)
  }
  if (process.env.W2L_TOOL_SURFACE_REPORT === '1') {
    for (const [surface, tools] of Object.entries(SURFACES)) {
      console.info(`${surface}: ${tools.length} tools, tools/list ${JSON.stringify(tools).length} chars`)
      console.table(Object.fromEntries(tools.map((tool) => [tool.name, measure(tool)])))
    }
  }

  it('matches each tool\'s input schema bytes and description characters to the budget, so a rise fails and a cut lowers the budget with it', () => {
    const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as Budget
    expect(Object.keys(budget).sort()).toEqual(Object.keys(SURFACES).sort())
    for (const [surface, tools] of Object.entries(SURFACES)) {
      // A tool added or removed changes the budget file in the same change.
      expect([surface, tools.map((tool) => tool.name).sort()]).toEqual([surface, Object.keys(budget[surface]!).sort()])
      for (const tool of tools) {
        const { inputBytes, descriptionChars } = measure(tool)
        expect({ surface, tool: tool.name, inputBytes, descriptionChars }).toEqual({ surface, tool: tool.name, ...budget[surface]![tool.name]! })
      }
    }
  })

  it('gives every input and output schema one a draft 2020-12 validator accepts, with plain property names and no combinator at the root', () => {
    const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as new (options: object) => { validateSchema(schema: unknown): boolean; errors?: unknown }
    const ajv = new Ajv2020({ strict: false })
    for (const [surface, tools] of Object.entries(SURFACES)) {
      for (const tool of tools) {
        for (const [kind, schema] of [['inputSchema', tool.inputSchema], ['outputSchema', tool.outputSchema]] as const) {
          if (schema === undefined) continue
          const record = schema as Record<string, unknown>
          expect([surface, tool.name, kind, ajv.validateSchema(schema) ? null : ajv.errors]).toEqual([surface, tool.name, kind, null])
          expect([surface, tool.name, kind, record.type]).toEqual([surface, tool.name, kind, 'object'])
          // Claude Code leaves out a tool whose top-level property names fall outside this pattern.
          const names = Object.keys((record.properties ?? {}) as object).filter((name) => !/^[A-Za-z0-9_.-]{1,64}$/.test(name))
          const combinators = ['anyOf', 'oneOf', 'allOf'].filter((key) => key in record)
          expect([surface, tool.name, kind, names, combinators]).toEqual([surface, tool.name, kind, [], []])
        }
      }
    }
  })

  it('keeps on the hosted and OAuth copies every _meta key the local definition carries', () => {
    const local = new Map((TOOLS as readonly Tool[]).map((tool) => [tool.name, tool]))
    for (const [surface, tools] of Object.entries(SURFACES)) {
      if (surface === 'local') continue
      for (const tool of tools) {
        const missing = Object.keys(local.get(tool.name)?._meta ?? {}).filter((key) => !(key in (tool._meta ?? {})))
        expect([surface, tool.name, missing]).toEqual([surface, tool.name, []])
      }
    }
  })

  // docs/mcp-client-ux-tasks.md W7: a client keeps a schema whole under about 5,000 bytes (Codex strips the property
  // descriptions of a larger one), and every client that does not defer tool definitions pays for the whole list.
  it('keeps each local tool small enough for clients to keep its descriptions, and the whole list compact', () => {
    const ceiling = (name: string) => name === 'scrape' ? 10_000 : name === 'crawl' || name === 'batch_scrape' ? 5_500 : 5_000
    for (const tool of SURFACES.local!) expect([tool.name, measure(tool).inputBytes <= ceiling(tool.name)]).toEqual([tool.name, true])
    expect(JSON.stringify(SURFACES.local).length).toBeLessThanOrEqual(50_000)
    for (const surface of ['hosted-keyless', 'oauth-http']) {
      const scrape = SURFACES[surface]!.find((tool) => tool.name === 'scrape')!
      expect([surface, measure(scrape).inputBytes <= 6_000]).toEqual([surface, true])
    }
  })

  it('opens every description with one plain sentence of its own, and sends the agent nowhere but its tools', () => {
    for (const [surface, tools] of Object.entries(SURFACES)) {
      const firsts = new Set<string>()
      for (const tool of tools) {
        const first = tool.description.split(/(?<=\.)\s/)[0]!
        expect([surface, tool.name, first.length <= 200, firsts.has(first)]).toEqual([surface, tool.name, true, false])
        firsts.add(first)
        // Facts only: no links, campaign tags, or directions to the REST API or an SDK instead of the tools.
        const texts = [tool.description, ...descriptionsOf(tool.inputSchema), ...descriptionsOf(tool.outputSchema)]
        for (const text of texts) expect([surface, tool.name, /https?:\/\/|utm_|see the REST|use the SDK|REST API|client\.watcher/i.test(text)]).toEqual([surface, tool.name, false])
      }
    }
  })

  it.todo('stdio pointed at https://api.octocrawl.dev lists all 39 local tools, though that host serves scrape and map alone (W3, W10)')
})
