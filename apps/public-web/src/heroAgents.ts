/** The agents beside the home hero's Connect your agent (page.ts heroMarkup): each mark drawn small and white on a
 * disc of its own colour, the same marks the /scrape/ page's Built for card draws in characters (agentOctopus.ts). */
import { AGENT_MARKS } from './product/agentOctopus'

/** Each agent's disc: Claude Code's terracotta, Codex's blue, Cursor's and OpenCode's near-black. */
const DISCS = ['#d97757', '#5b6cff', '#1a1814', '#211e1e']

export function drawHeroAgents(root: ParentNode): void {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>('canvas.hero-agent')) {
    const mark = AGENT_MARKS[Number(canvas.dataset.agent)]
    const g = canvas.getContext('2d')
    if (!mark || !g) continue
    const size = canvas.clientWidth || 28
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(size * ratio)
    canvas.height = Math.round(size * ratio)
    g.scale(ratio, ratio)
    g.fillStyle = DISCS[Number(canvas.dataset.agent)] ?? '#1a1814'
    g.beginPath()
    g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    g.fill()
    // The mark in white, fitted to the middle 58% of the disc; its cut-outs show through to the page.
    const box = size * 0.58
    const k = Math.min(box / mark.vw, box / mark.vh)
    g.translate((size - mark.vw * k) / 2, (size - mark.vh * k) / 2)
    g.scale(k, k)
    g.fillStyle = '#fff'
    g.strokeStyle = '#fff'
    mark.draw(g)
  }
}
