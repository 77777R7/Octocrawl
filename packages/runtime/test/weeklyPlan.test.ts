import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// The weekly rerun's plan and record header (research/access/weekly.mjs), kept pure so they can be tested here.
import { IC16_BASELINE, baselineLine, chromeMajor, chromeOfRecord, isoWeek, rotationGroupOf, rotationGroups, summaryRows, weeklyHeaderLines, weeklySet } from '../../../research/access/weeklyPlan.mjs'
import type { ArmResult, Subsets, TaskFile } from '../../../research/access/weeklyPlan.mjs'

const taskFile: TaskFile = JSON.parse(readFileSync(new URL('../../../research/access/tasks.v1.json', import.meta.url), 'utf8'))
const subsets: Subsets = JSON.parse(readFileSync(new URL('../../../research/access/subsets.v1.json', import.meta.url), 'utf8'))
const utc = (s: string) => new Date(`${s}T12:00:00Z`)

describe('weekly rotation', () => {
  it('numbers ISO weeks with Monday first and the first Thursday in week 1', () => {
    expect(isoWeek(utc('2026-10-20'))).toEqual({ year: 2026, week: 43 })
    expect(isoWeek(utc('2026-01-01'))).toEqual({ year: 2026, week: 1 }) // a Thursday
    expect(isoWeek(utc('2027-01-01'))).toEqual({ year: 2026, week: 53 }) // a Friday: still 2026's last week
    expect(isoWeek(utc('2026-12-28'))).toEqual({ year: 2026, week: 53 })
    expect(isoWeek(utc('2024-12-30'))).toEqual({ year: 2025, week: 1 })
  })

  it('cuts the ids in order into groups of ten and a last group with the rest', () => {
    const ids = Array.from({ length: 36 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`)
    const groups = rotationGroups(ids)
    expect(groups.map((g) => g.length)).toEqual([10, 10, 10, 6])
    expect(groups[0][0]).toBe('T001')
    expect(groups[3]).toEqual(['T031', 'T032', 'T033', 'T034', 'T035', 'T036'])
    expect(groups.flat()).toEqual(ids)
  })

  it('picks the group from the ISO week alone, so consecutive weeks cycle through all four', () => {
    expect(rotationGroupOf(utc('2026-10-20'))).toBe(3) // week 43
    expect(rotationGroupOf(utc('2026-10-27'))).toBe(0)
    expect(rotationGroupOf(utc('2026-11-03'))).toBe(1)
    expect(rotationGroupOf(utc('2026-11-10'))).toBe(2)
    expect(rotationGroupOf(utc('2026-11-17'))).toBe(3)
    // Monday and Sunday of one ISO week agree.
    expect(rotationGroupOf(utc('2026-10-19'))).toBe(rotationGroupOf(utc('2026-10-25')))
    expect(rotationGroupOf(utc('2026-10-26'))).not.toBe(rotationGroupOf(utc('2026-10-25')))
  })
})

describe('weekly set', () => {
  it('is the 25 healthy tasks, the 16-task subset and the week\'s rotation group of the other frozen tasks', () => {
    const set = weeklySet(taskFile, subsets, utc('2026-10-27'))
    expect(set.healthy).toHaveLength(25)
    expect(set.healthy.every((id) => taskFile.tasks.find((t) => t.id === id)?.part === 'healthy')).toBe(true)
    expect(set.challenge).toEqual(['T001', 'T002', 'T005', 'T034', 'T038', 'T045', 'T046', 'T047', 'T048', 'T049', 'T053', 'T068', 'T071', 'T076', 'B001', 'B008'])
    expect(set.rotationPool).toBe(36)
    expect(set.group).toBe(0)
    expect(set.rotation).toHaveLength(10)
    expect(set.rotation[0]).toBe('T003')
    for (const id of set.rotation) {
      expect(taskFile.tasks.find((t) => t.id === id)?.part).toBe('frozen')
      expect(set.challenge).not.toContain(id)
    }
    expect(set.all).toHaveLength(51)
    expect(new Set(set.all).size).toBe(51)
    expect(set.all.some((id) => ['T008', 'T031', 'T073'].includes(id))).toBe(false) // the unstable tasks are never in it
  })

  it('has 47 tasks in the week whose group is the six-task one, and the four groups cover every frozen task outside the subset', () => {
    const weeks = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'].map((d) => weeklySet(taskFile, subsets, utc(d)))
    expect(weeks.map((w) => w.all.length)).toEqual([47, 51, 51, 51])
    const seen = new Set(weeks.flatMap((w) => w.rotation))
    const expected = taskFile.tasks.filter((t) => t.part === 'frozen' && !subsets.subsets.challenge16.tasks.includes(t.id)).map((t) => t.id)
    expect([...seen].sort()).toEqual([...expected].sort())
  })

  it('refuses a subset that names a task the task file does not have', () => {
    expect(() => weeklySet(taskFile, { subsets: { challenge16: { tasks: ['T001', 'T999'] } } }, utc('2026-10-20'))).toThrow('T999')
  })
})

describe('weekly record header', () => {
  const set = weeklySet(taskFile, subsets, utc('2026-10-20'))

  it('names the arm, the ISO week, the commit, the set and its rotation group, and the Chrome versions', () => {
    const lines = weeklyHeaderLines({ date: '2026-10-20', commit: 'abcdef12', arm: 'free', set, chrome: 'Google Chrome 155.0.8059.80', previousChrome: 'Google Chrome 154.0.7000.1', chromeRerun: true })
    expect(lines[0]).toContain('arm `free`')
    expect(lines[0]).toContain('week 2026-W43')
    expect(lines[1]).toBe('- Source commit: `abcdef12`')
    expect(lines[2]).toContain('47 tasks = healthy 25 + challenge16 16')
    expect(lines[2]).toContain('rotation 6 (group 3 of 0–3, ISO week 43 mod 4')
    expect(lines[3]).toBe('- Rotation tasks this week: T066, T069, T070, T075, T078, T081')
    expect(lines[4]).toContain('- Chrome: Google Chrome 155.0.8059.80 (previous weekly record: Google Chrome 154.0.7000.1; major version changed, the 16 tasks were run twice)')
    expect(chromeOfRecord(lines.join('\n'))).toBe('Google Chrome 155.0.8059.80')
  })

  it('reads the Chrome major from a version line and compares it', () => {
    expect(chromeMajor('Google Chrome 155.0.8059.80')).toBe(155)
    expect(chromeMajor('Google Chrome 156.0.8100.1 (the P0.1 baseline)')).toBe(156)
    expect(chromeMajor(null)).toBeNull()
    expect(chromeMajor('unknown')).toBeNull()
    expect(chromeOfRecord('- Chrome: unknown')).toBe('unknown')
    expect(chromeOfRecord('no such line')).toBeNull()
  })

  it('marks a week below the lower accepted run of the installed_chrome acceptance, and not one at or above it', () => {
    expect(IC16_BASELINE).toEqual({ final: [11, 7], probe: [12, 12], total: 16, floor: 7 })
    expect(baselineLine(6)).toContain('**below the lower accepted run (7); stop the default recommendation, retest pending**')
    expect(baselineLine(7)).toContain('at or above the lower accepted run (7), below the higher (11)')
    expect(baselineLine(7)).not.toContain('stop the default')
    expect(baselineLine(12)).toContain('at or above both accepted runs')
    expect(baselineLine(null)).toContain('not run')
    expect(baselineLine(12)).toContain('final runs 11 and 7 of 16, probe runs 12 and 12')
  })
})

describe('weekly summary', () => {
  const part = (planned: number, verified: number, falseSuccess = 0) => ({ planned, attempted: planned, verified, falseSuccess })
  const arm = (name: string, competitor: boolean, verified: [number, number, number, number] | null, cost = '$0'): ArmResult => ({
    arm: name,
    competitor,
    totals: verified === null ? null : { verified: verified[0], falseSuccess: 1, p50Ms: 1000, p95Ms: 9000 },
    reason: verified === null ? 'no key' : null,
    cost,
    parts: { all: part(51, verified?.[0] ?? 0), healthy: part(25, verified?.[1] ?? 0), challenge: part(16, verified?.[2] ?? 0), rotation: part(10, verified?.[3] ?? 0) },
  })

  it('gives each Octocrawl arm its gap to the best competitor arm, by part', () => {
    const rows = summaryRows([arm('free', false, [30, 24, 2, 4]), arm('steel', false, [35, 24, 6, 5]), arm('firecrawl', true, [40, 25, 10, 5]), arm('zenrows', true, [38, 25, 12, 1])])
    expect(rows[0].gap).toEqual({ all: 10, healthy: 1, challenge: 10, rotation: 1 })
    expect(rows[1].gap).toEqual({ all: 5, healthy: 1, challenge: 6, rotation: 0 })
    expect(rows[2].gap).toBeNull()
    expect(rows[0].status).toBe('run')
  })

  it('keeps a competitor arm that did not run as not_run and leaves the gap unknown rather than 0', () => {
    const rows = summaryRows([arm('free', false, [30, 24, 2, 4]), arm('firecrawl', true, null)])
    expect(rows[1].status).toBe('not_run (no key)')
    expect(rows[1].verified).toBeNull()
    expect(rows[0].gap).toEqual({ all: null, healthy: null, challenge: null, rotation: null })
  })
})
