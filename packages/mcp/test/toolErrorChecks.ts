import { expect } from 'vitest'

/** A tool call that did not run answers as an isError result whose text says why (docs/mcp-client-ux-tasks.md W5). */
export function expectIsError(result: unknown, text: string | RegExp): void {
  const answer = result as { isError?: boolean; content?: { text?: string }[] }
  expect(answer.isError).toBe(true)
  const said = answer.content?.[0]?.text ?? ''
  if (typeof text === 'string') expect(said).toContain(text)
  else expect(said).toMatch(text)
}
