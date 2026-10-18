import { describe, expect, it } from 'vitest'
import { AGENT_MARKS, nextAgent, resample, swimSeconds } from '../src/product/agentOctopus'
import { BUILT_FOR } from '../src/product/scrapePage'

describe('the Built for agents figure', () => {
  it('draws the agents the MCP guide sets up, each named in its card', () => {
    expect(AGENT_MARKS.map((mark) => mark.name)).toEqual(['Claude Code', 'Codex', 'Cursor', 'OpenCode'])
    const card = BUILT_FOR.find((c) => c.icon === 'agents')!
    for (const mark of AGENT_MARKS) expect(card.text).toContain(mark.name)
  })

  it('goes to the agent the reader picked, or else to the next one round', () => {
    expect(nextAgent(0, null, 4)).toBe(1)
    expect(nextAgent(3, null, 4)).toBe(0)
    expect(nextAgent(0, 2, 4)).toBe(2)
    // Picking the agent it is on does not keep it there.
    expect(nextAgent(1, 1, 4)).toBe(2)
  })

  it('swims further for longer', () => {
    expect(swimSeconds(240)).toBeGreaterThan(swimSeconds(80))
    expect(swimSeconds(0)).toBeGreaterThan(0)
  })

  it('spaces an arm\'s points evenly from its root to its tip', () => {
    const points = resample([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }], 18)
    expect(points).toHaveLength(18)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[17]!.x).toBeCloseTo(30, 5)
    expect(points[17]!.y).toBeCloseTo(40, 5)
    const gaps = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y))
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 0)
  })
})
