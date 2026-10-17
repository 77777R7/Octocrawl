import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MCP_OAUTH_RESOURCE } from '../src/hostedApi.js'
import { MCP_VERSION, SERVER_IDENTITY } from '../src/server.js'

// The Claude Code plugin (plugins/octocrawl) and the marketplace that lists it (.claude-plugin/marketplace.json):
// what `claude plugin marketplace add 77777R7/Octocrawl` installs, and what the Claude directory reviews.
const root = new URL('../../../', import.meta.url)
const pluginDir = new URL('plugins/octocrawl/', root)
const json = (url: URL) => JSON.parse(readFileSync(url, 'utf8')) as Record<string, any>

describe('Claude Code plugin', () => {
  it('names the published version and the MCP server identity', () => {
    const manifest = json(new URL('.claude-plugin/plugin.json', pluginDir))
    expect(manifest).toMatchObject({ name: SERVER_IDENTITY.name, version: MCP_VERSION, description: SERVER_IDENTITY.description, license: 'AGPL-3.0-only' })
    expect(manifest.author.name).toBe('Octocrawl')
    for (const key of ['homepage', 'privacyPolicyUrl', 'termsOfServiceUrl', 'supportUrl', 'documentationUrl', 'icon']) {
      expect(manifest[key], key).toMatch(/^https:\/\/(octocrawl\.dev|github\.com\/77777R7\/Octocrawl)\//)
    }
  })

  it('connects to the sign-in endpoint over HTTP, with no header or key', () => {
    const { mcpServers } = json(new URL('.mcp.json', pluginDir))
    expect(mcpServers).toEqual({ octocrawl: { type: 'http', url: MCP_OAUTH_RESOURCE } })
  })

  it('keeps its README and no linked files inside the plugin folder', () => {
    const readme = readFileSync(new URL('README.md', pluginDir), 'utf8')
    const prose = readme.replace(/```[\s\S]*?```/g, '').split(/\s+/).filter((word) => /[A-Za-z]/.test(word))
    expect(prose.length).toBeGreaterThanOrEqual(40)
    expect(readme).toContain(MCP_OAUTH_RESOURCE)
    const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
      return entry.isDirectory() ? walk(url) : [url.pathname]
    })
    for (const file of walk(pluginDir)) expect(lstatSync(file).isSymbolicLink(), file).toBe(false)
  })

  it('is listed by the repository marketplace from its own folder', () => {
    const marketplace = json(new URL('.claude-plugin/marketplace.json', root))
    expect(marketplace.owner.name).toBe('Octocrawl')
    expect(marketplace.plugins).toEqual([expect.objectContaining({ name: SERVER_IDENTITY.name, source: './plugins/octocrawl' })])
    expect(existsSync(new URL('.claude-plugin/plugin.json', pluginDir))).toBe(true)
  })
})
