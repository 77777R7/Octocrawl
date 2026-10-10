import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BLOG_CATEGORIES, BLOG_UPDATED, blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'

const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const git = (...args: string[]) => execFileSync('git', args, { cwd: app(''), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const base = (() => { try { return git('merge-base', 'HEAD', 'origin/main') } catch { return null } })()
const POSTS_FILE = 'apps/public-web/scripts/blogPosts.mjs'
const day = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const docsPath = (page: { slug: string }) => (page.slug ? `/docs/${page.slug}/` : '/docs/')

describe('Blog articles', () => {
  it('have a title and description search results can show whole, unique on the site', () => {
    const descriptions = [...posts.map(post => post.description), ...pages.map(page => page.description)]
    for (const post of posts) {
      expect([post.slug, post.title.length <= 60]).toEqual([post.slug, true])
      expect([post.slug, post.description.length >= 140 && post.description.length <= 160]).toEqual([post.slug, true])
      expect([post.slug, descriptions.filter(text => text === post.description)]).toEqual([post.slug, [post.description]])
    }
    expect(new Set(posts.map(post => post.slug)).size).toBe(posts.length)
  })

  it('each have their article, a cover, a card and a link preview image', () => {
    for (const post of posts) {
      expect(post.file).toBe(`blog/${post.slug}.md`)
      expect(readFileSync(app(`content/${post.file}`), 'utf8')).toMatch(/^# \S/)
      for (const name of ['cover.webp', 'cover-1254.webp', 'card.webp', 'og.jpg']) expect([post.slug, name, existsSync(app(`public/blog-assets/${post.slug}/${name}`))]).toEqual([post.slug, name, true])
      expect(post.coverAlt.length).toBeGreaterThan(20)
    }
  })

  it('link only to images, docs pages and articles that exist', () => {
    for (const post of posts) {
      const text = readFileSync(app(`content/${post.file}`), 'utf8')
      for (const [, src] of text.matchAll(/!\[[^\]]*\]\(([^ )]+)/g)) expect([post.slug, src, src!.startsWith('/') && existsSync(app(`public${src}`))]).toEqual([post.slug, src, true])
      for (const [, href] of text.matchAll(/\]\((\/(?:docs|blog)\/[^)#?]*)/g)) {
        const found = href!.startsWith('/blog/') ? posts.some(other => blogPath(other) === href) : pages.some(page => docsPath(page) === href)
        expect([post.slug, href, found]).toEqual([post.slug, href, true])
      }
    }
  })

  it('each sit in one of the index\'s categories', () => {
    expect(new Set(BLOG_CATEGORIES.map(category => category.slug)).size).toBe(BLOG_CATEGORIES.length)
    for (const category of BLOG_CATEGORIES) expect(category.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const post of posts) expect([post.slug, BLOG_CATEGORIES.some(category => category.slug === post.category)]).toEqual([post.slug, true])
  })

  it('point Keep reading at three other articles, and answer the docs address they replaced', () => {
    for (const post of posts) {
      expect(post.related).toHaveLength(3)
      expect(new Set(post.related).size).toBe(3)
      for (const slug of post.related) expect([post.slug, slug, slug !== post.slug && posts.some(other => other.slug === slug)]).toEqual([post.slug, slug, true])
      if (post.from !== null) {
        expect(post.from).toMatch(/^\/docs\/.+\/$/)
        expect(pages.some(page => docsPath(page) === post.from)).toBe(false)
      }
    }
  })

  it('give real days: published no later than tomorrow, updated only after that', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    for (const post of posts) {
      expect([post.slug, day(post.pubDate) && post.pubDate <= tomorrow]).toEqual([post.slug, true])
      if (post.updatedDate !== null) expect([post.slug, day(post.updatedDate) && post.updatedDate > post.pubDate && post.updatedDate <= tomorrow]).toEqual([post.slug, true])
    }
    expect(BLOG_UPDATED).toBe(posts.map(post => post.updatedDate ?? post.pubDate).sort().at(-1))
  })

  // As in docsPages.test.ts: an article this branch changed must keep main's pubDate and move its updatedDate on.
  it.skipIf(!base)('moves an article\'s updatedDate on whenever this branch changes it', () => {
    let before: string
    try { before = git('show', `${base}:${POSTS_FILE}`) } catch { return } // the list is new on this branch
    const changed = new Set(git('diff', '--name-only', '--relative', base!).split('\n'))
    const recent = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    for (const post of posts) {
      const line = before.split('\n').find(entry => entry.includes(`file: '${post.file}'`))
      if (!line || !changed.has(`content/${post.file}`)) continue
      const [pubDate, updatedDate] = [line.match(/pubDate: '([\d-]+)'/)?.[1], line.match(/updatedDate: '([\d-]+)'/)?.[1] ?? null]
      expect([post.slug, post.pubDate]).toEqual([post.slug, pubDate])
      const now = post.updatedDate
      expect([post.slug, now !== null && (updatedDate === null || now > updatedDate || now >= recent)]).toEqual([post.slug, true])
    }
  })
})
