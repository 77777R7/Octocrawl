import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HOME_UPDATED, pages } from '../scripts/docsPages.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const git = (...args: string[]) => execFileSync('git', args, { cwd: appDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** Where this branch left main, or null without the history to tell (a shallow CI checkout, no origin/main). */
const base = (() => { try { return git('merge-base', 'HEAD', 'origin/main') } catch { return null } })()

/** Each page's content files and lastmod, now and as main had them at `base`. Days are compared as changed or not,
 * never against commit dates, so merges, rebases and time zones cannot trip the check. */
const PAGES_FILE = 'apps/public-web/scripts/docsPages.mjs'
const HOME_FILES = ['src/page.ts', 'src/featureSections.ts', 'src/waitlistMarkup.ts']
const current: Array<[string, string, string[]]> = [
  ['/', HOME_UPDATED, HOME_FILES],
  ...pages.map(page => [page.file, page.updated, [`content/${page.file}`]] as [string, string, string[]]),
]

describe('sitemap lastmod', () => {
  it('gives every page a real day, none after tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    for (const [page, updated] of current) {
      expect([page, /^\d{4}-\d{2}-\d{2}$/.test(updated) && !Number.isNaN(Date.parse(updated))]).toEqual([page, true])
      expect([page, updated <= tomorrow]).toEqual([page, true])
    }
  })

  // On a branch: a page whose content this branch changed must have a later day than main gave it, or today's (a
  // second change on the day of the first keeps its day). On main itself nothing has changed, so a commit that forgot
  // the day fails before it merges, never afterwards.
  it.skipIf(!base)('moves a page\'s day on whenever this branch changes its content', () => {
    let before: string
    try { before = git('show', `${base}:${PAGES_FILE}`) } catch { return } // the list is new on this branch
    const was = (page: string) => page === '/'
      ? before.match(/HOME_UPDATED = '([\d-]+)'/)?.[1]
      : before.match(new RegExp(`file: '${page.replace('.', '\\.')}'[^\\n]*updated: '([\\d-]+)'`))?.[1]
    const changed = new Set(git('diff', '--name-only', '--relative', base!).split('\n'))
    // Yesterday in UTC, so a day written in a time zone ahead of UTC still counts as today.
    const recent = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    for (const [page, updated, files] of current) {
      const previous = was(page)
      if (!previous || !files.some(file => changed.has(file))) continue
      expect([page, `${previous} → ${updated}`, updated > previous || updated >= recent]).toEqual([page, `${previous} → ${updated}`, true])
    }
  })
})
