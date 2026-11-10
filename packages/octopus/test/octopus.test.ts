import { describe, expect, it } from 'vitest'
import { ARMS, MANTLE, SPRITE_H, SPRITE_W, SQUASH, crawlCap, octopusFrame, octopusPose, stageLabel, stepsDone, type CrawlStage, stageText } from '../src/index.js'

const stages = (...names: CrawlStage[]) => new Set<CrawlStage>(names)
const text = (input: Parameters<typeof octopusPose>[0]) => octopusFrame(octopusPose(input)).map(row => row.map(cell => cell?.char ?? ' ').join(''))

describe('the octopus follows the run', () => {
  it('waits at the door, goes further with each stage reported, and reaches the foot only with the result', () => {
    expect(crawlCap(stages(), null, false)).toBe(0)
    expect(crawlCap(stages('started'), null, false)).toBe(0)
    expect(crawlCap(stages('started', 'robots'), true, false)).toBe(0.35)
    expect(crawlCap(stages('started', 'robots', 'page'), true, false)).toBe(0.9)
    expect(crawlCap(stages('started', 'robots', 'page'), true, true)).toBe(1)
  })

  it('does not move, and says why, when robots.txt refuses or could not be read', () => {
    expect(crawlCap(stages('started', 'robots'), false, false)).toBe(0)
    expect(stageLabel(stages('started', 'robots'), false)).toBe('robots.txt disallows this page')
    expect(stageLabel(stages('started', 'robots'), false, true)).toBe('robots.txt could not be read · not fetching')
  })

  it('counts a step only when it was reported', () => {
    expect(stepsDone(stages(), false)).toBe(0)
    expect(stepsDone(stages('started', 'page'), false)).toBe(2)
    expect(stepsDone(stages('started', 'robots', 'page'), true)).toBe(4)
  })
})

describe('the octopus frame', () => {
  it('keeps every row of a sprite the same width, so the cells stay on a grid', () => {
    for (const sprite of [MANTLE, ...ARMS, SQUASH]) expect(new Set(sprite.map(line => line.length)).size).toBe(1)
    expect(ARMS[0]![0]!.length).toBe(SPRITE_W)
    expect(ARMS[1]!.length).toBe(ARMS[0]!.length)
    expect(SPRITE_H).toBe(8)
  })

  it('stands with its eyes open, on one stride then the other', () => {
    expect(text({ now: 300 })).toEqual([
      '    ,=####=,    ',
      '  ,##########,  ',
      ' =###O####O###= ',
      ' =############= ',
      '  \\##########/  ',
      '  \\x\\ x||x /x/  ',
      '   \\ \\x||x/ /   ',
      '  :  + :: +  :  ',
    ])
    expect(text({ now: 500 }).slice(5)).toEqual([...ARMS[0]!])
    expect(octopusPose({ now: 300 })).toMatchObject({ rowOffset: 0, colOffset: 0, mantleRows: 5, eyes: 'open' })
  })

  it('blinks for a moment every 2.6 s, and tells the mantle from the arms and the eyes', () => {
    const frame = octopusFrame(octopusPose({ now: 2600 + 100 }))
    expect(frame[2]!.map(cell => cell?.char ?? ' ').join('')).toBe(' =###-####-###= ')
    expect(frame[2]![5]).toEqual({ char: '-', tone: 'eye' })
    expect(frame[0]![4]).toEqual({ char: ',', tone: 'mantle' })
    expect(frame[5]![2]?.tone).toBe('arm')
    expect(frame[0]![0]).toBeNull()
  })

  it('stretches a row taller late in its drop', () => {
    expect(octopusPose({ now: 300, drop: 0.6 }).lines).toHaveLength(SPRITE_H)
    const pose = octopusPose({ now: 300, drop: 0.61 })
    expect(pose).toMatchObject({ rowOffset: -1, mantleRows: 6 })
    expect(pose.lines).toHaveLength(SPRITE_H + 1)
    expect(pose.lines[4]).toBe(MANTLE[3])
  })

  it('lands squashed with its eyes screwed shut, hops, then stands with them shut a moment longer', () => {
    const landed = octopusPose({ now: 5000, sinceLanding: 0 })
    expect(text({ now: 5000, sinceLanding: 0 })).toEqual([
      '   ,=########=,   ',
      ' =####>####<####= ',
      '=################=',
      ' \\##############/ ',
      '/x/x/ x||||x \\x\\x\\',
    ])
    // Its feet stay on the ground: five rows where there were eight, one cell wider each side.
    expect(landed).toMatchObject({ rowOffset: 3, colOffset: -1, mantleRows: 5, eyes: 'squint' })
    expect(octopusPose({ now: 5250, sinceLanding: 250 })).toMatchObject({ rowOffset: -1, colOffset: 0, eyes: 'squint' })
    expect(octopusPose({ now: 5350, sinceLanding: 350 })).toMatchObject({ rowOffset: 0, eyes: 'squint' })
    expect(octopusPose({ now: 5450, sinceLanding: 450 }).eyes).toBe('open')
  })

  it('has not landed while the time since landing is unknown, negative or not yet a number', () => {
    for (const sinceLanding of [undefined, -1, Infinity]) expect(octopusPose({ now: 300, sinceLanding }).lines).toHaveLength(SPRITE_H)
  })

  it('walks slowly and blinks long when the run failed', () => {
    expect(text({ now: 300, failed: true }).slice(5)).toEqual([...ARMS[0]!])
    expect(text({ now: 600, failed: true }).slice(5)).toEqual([...ARMS[1]!])
    expect(octopusPose({ now: 100, failed: true }).eyes).toBe('blink')
    expect(octopusPose({ now: 800, failed: true }).eyes).toBe('open')
  })
})

describe('what one stage says', () => {
  it('says each stage a scrape tells in one line', () => {
    expect(stageText({ stage: 'robots', allowed: true })).toBe('robots.txt allows it · fetching the page')
    expect(stageText({ stage: 'robots', allowed: false })).toBe('robots.txt disallows this page')
    expect(stageText({ stage: 'robots', allowed: false, unreachable: true })).toBe('robots.txt could not be read · not fetching')
    expect(stageText({ stage: 'robots', allowed: true, overridden: true })).toBe('robots.txt disallows it · fetching it anyway (robots_overridden)')
    expect(stageText({ stage: 'robots', allowed: true, unreachable: true, overridden: true })).toBe('robots.txt could not be read · fetching it anyway (robots_overridden)')
    expect(stageText({ stage: 'page' })).toBe('Page received · checking it')
  })
})
