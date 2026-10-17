import { expect } from 'vitest'
import { TOOL_NAMES } from '../src/tools.js'

/** The tool names a text mentions, as whole words (scrape is not counted inside scrape_product). */
export function mentionedTools(text: string): string[] {
  return TOOL_NAMES.filter((name) => new RegExp(`(?<![A-Za-z0-9_])${name}(?![A-Za-z0-9_])`).test(text))
}

/** The checks every surface's instructions meet (docs/mcp-client-ux-tasks.md W3). */
export function expectUsableInstructions(instructions: string | undefined, listed: readonly string[]): void {
  expect(instructions).toBeTypeOf('string')
  const text = instructions!
  // Claude Code cuts instructions at 4,096 characters; the target is under 2,000.
  expect(text.length).toBeGreaterThan(400)
  expect(text.length).toBeLessThanOrEqual(2_000)
  // Every tool it names is one this surface lists, so the text holds for this tool set.
  expect(mentionedTools(text).filter((name) => !listed.includes(name))).toEqual([])
  // Facts only: no links, no campaign tags.
  expect(text).not.toMatch(/https?:\/\//)
  expect(text).not.toContain('utm_')
}
