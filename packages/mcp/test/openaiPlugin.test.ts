import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MCP_OAUTH_RESOURCE, oauthTools } from '../src/hostedApi.js'
import { MCP_VERSION, SERVER_IDENTITY } from '../src/server.js'

// The OpenAI plugin (plugins/octocrawl-openai) for the ChatGPT and Codex plugin directory, in the portable Agent
// Plugins format. Limits are the public submission's (developers.openai.com/plugins/deploy/submission, 2026-10-18).
const root = new URL('../../../', import.meta.url)
const dir = new URL('plugins/octocrawl-openai/', root)
const json = (url: URL) => JSON.parse(readFileSync(url, 'utf8')) as Record<string, any>
const manifest = () => json(new URL('plugin.json', dir))
const openai = () => manifest().extensions['com.openai']

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(url: URL): [number, number] {
  const bytes = readFileSync(url)
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

describe('OpenAI plugin', () => {
  it('names the published version and the MCP server identity', () => {
    expect(manifest()).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: SERVER_IDENTITY.name, version: MCP_VERSION, description: SERVER_IDENTITY.description, license: 'AGPL-3.0-only',
      author: { name: 'Octocrawl' },
    })
  })

  it('has listing text within the submission limits, and four https listing URLs on octocrawl.dev', () => {
    const ui = openai().interface
    expect(ui.displayName.length).toBeLessThanOrEqual(30)
    expect(ui.shortDescription.length).toBeLessThanOrEqual(30)
    expect(ui.longDescription.length).toBeLessThanOrEqual(4000)
    expect(ui.developerName.length).toBeLessThanOrEqual(80)
    expect(typeof ui.category).toBe('string')
    expect(Array.isArray(ui.capabilities)).toBe(true)
    for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) expect(ui[key], key).toMatch(/^https:\/\/octocrawl\.dev\//)
    expect(ui.defaultPrompt.length).toBeLessThanOrEqual(3)
    for (const prompt of ui.defaultPrompt) expect(prompt.length, prompt).toBeLessThanOrEqual(128)
  })

  it('ships a square logo and composer icon of at least 48 pixels', () => {
    for (const key of ['logo', 'composerIcon']) {
      const path = openai().interface[key] as string
      expect(path, key).toMatch(/^\.\//)
      const [width, height] = pngSize(new URL(path, dir))
      expect(width, key).toBe(height)
      expect(width, key).toBeGreaterThanOrEqual(48)
    }
  })

  it('connects one server, the sign-in endpoint over streamable HTTP, by OAuth with a metadata document and no headers', () => {
    const { mcpServers } = json(new URL('mcp.json', dir))
    expect(Object.keys(mcpServers)).toEqual(['octocrawl'])
    expect(mcpServers.octocrawl).toEqual({ type: 'streamable-http', url: MCP_OAUTH_RESOURCE, extensions: { 'com.openai': { auth: { type: 'oauth', client: { mode: 'cimd' } } } } })
  })

  it('has exactly five positive cases naming tools /mcp-oauth lists, and three negative cases', () => {
    const { positive, negative } = openai().review.test_cases
    const listed = new Set<string>(oauthTools(true).map((tool) => tool.name))
    expect(positive).toHaveLength(5)
    for (const test of positive) {
      for (const key of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) expect(test[key], `${test.description} ${key}`).toEqual(expect.any(String))
      for (const tool of (test.tools_triggered as string).split(',').map((name) => name.trim())) expect(listed.has(tool), tool).toBe(true)
    }
    expect(negative).toHaveLength(3)
    for (const test of negative) for (const key of ['description', 'prompt']) expect(test[key], key).toEqual(expect.any(String))
    expect(openai().review.commerce).toBe(false)
  })

  it('onboards with a packaged skill, and holds no app mapping, hooks or linked files', () => {
    const skill = readFileSync(new URL(openai().onboardingSkill, dir), 'utf8')
    expect(skill).toMatch(/^---\nname: [a-z0-9-]+\ndescription: .+\n---\n/)
    expect(openai()).not.toHaveProperty('apps')
    expect(openai()).not.toHaveProperty('hooks')
    expect(existsSync(new URL('.app.json', dir))).toBe(false)
    const walk = (at: URL): string[] => readdirSync(at, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(new URL(`${entry.name}/`, at)) : [new URL(entry.name, at).pathname])
    for (const file of walk(dir)) expect(lstatSync(file).isSymbolicLink(), file).toBe(false)
  })

  it('is listed by the repository\'s Codex marketplace from its own folder', () => {
    // `codex plugin marketplace add 77777R7/Octocrawl` reads .agents/plugins/marketplace.json (developers.openai.com/plugins/build/plugins).
    const marketplace = json(new URL('.agents/plugins/marketplace.json', root))
    expect(marketplace.name).toBe('octocrawl')
    expect(marketplace.plugins).toEqual([{ name: 'octocrawl', source: { source: 'local', path: './plugins/octocrawl-openai' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: openai().interface.category }])
    expect(existsSync(new URL('plugins/octocrawl-openai/plugin.json', root))).toBe(true)
  })
})
