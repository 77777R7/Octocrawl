import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blogPath, posts } from '../scripts/blogPosts.mjs'
import { pages } from '../scripts/docsPages.mjs'
import { SCENES, sceneName } from '../src/heroArtwork'
import { pageMarkup } from '../src/page'
import { TOOL_FAQ, TOOL_PATH, TOOL_TITLE, toolJsonLd, toolPageMarkup } from '../src/tools/urlToMarkdown'

// /tools/url-to-markdown/: the home page's hero with its own words, run by the home page's script (main.ts), and the
// task's sections below.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const markup = toolPageMarkup()
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!))

describe('the URL to Markdown page', () => {
  it('has every element the home page\'s script needs, so the same card, preview and results run on it', () => {
    const main = readFileSync(app('src/main.ts'), 'utf8')
    const required = [...main.matchAll(/document\.querySelector<[^>]+>\('#([a-z0-9-]+)'\)!/g)].map(([, id]) => id!)
    expect(required.length).toBeGreaterThan(30)
    const home = ids(pageMarkup())
    const tool = ids(markup)
    for (const id of required) expect([id, home.has(id) && tool.has(id)]).toEqual([id, true])
    // The page loads that script, from its own entry, which Vite builds.
    const entry = readFileSync(app('tools/url-to-markdown/index.html'), 'utf8')
    expect(entry).toContain('<script type="module" src="/src/main.ts"></script>')
    expect(entry).toContain(`<title>${TOOL_TITLE}</title>`)
    expect(readFileSync(app('vite.config.ts'), 'utf8')).toContain('./tools/url-to-markdown/index.html')
    expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain(`const TOOL_PATH = '${TOOL_PATH}'`)
  })

  it('shows the coast behind its hero, and the home page keeps the mountain', () => {
    expect(markup).toContain('<div class="hero" id="top" data-art="coast">')
    expect(pageMarkup()).toContain('<div class="hero" id="top">')
    expect([sceneName('coast'), sceneName(undefined), sceneName('elsewhere')]).toEqual(['coast', 'mountain', 'mountain'])
    // The backdrop, its preload and the glyph layer's fetch name one file (versioned alike at build time).
    const coast = '/assets/scene-coast.webp'
    expect(SCENES.coast.art.split('?')[0]).toBe(coast)
    expect(readFileSync(app('src/styles.css'), 'utf8')).toContain(`.hero[data-art='coast'] .hero-backdrop { background-image: url('${coast}');`)
    expect(readFileSync(app('tools/url-to-markdown/index.html'), 'utf8')).toContain(`<link rel="preload" as="image" href="${coast}" />`)
    for (const scene of Object.values(SCENES)) expect(existsSync(app(`public${scene.art.split('?')[0]}`))).toBe(true)
    // The glyph layer lights the cliffs' faces as land and the surf in front of them as sea.
    const { land } = SCENES.coast
    expect([land(1360, 520), land(1560, 600), land(1600, 900)].map(Math.round)).toEqual([1, 1, 1])
    expect([land(1380, 700), land(1200, 800), land(800, 300), land(1450, 360)].map(Math.round)).toEqual([0, 0, 0, 0])
  })

  it('names its task in the heading, and links only to places that exist', () => {
    expect(markup).toContain('<h1 id="hero-title">URL to <em>Markdown.</em></h1>')
    expect(markup).not.toContain('One link.')
    expect(markup).not.toContain('style=')
    expect(markup.match(/<details class="faq-item">/g)).toHaveLength(TOOL_FAQ.length)
    expect(JSON.parse(toolJsonLd().replace(/^<script[^>]*>|<\/script>$/g, ''))).toMatchObject({ '@type': 'SoftwareApplication', url: `__W2L_ORIGIN__${TOOL_PATH}`, offers: { price: '0' } })
    // The scroll cue and the section links land on this page's sections; the footer's go to the home page.
    const own = ids(markup)
    for (const [, hash] of markup.matchAll(/href="#([a-z-]+)"/g)) expect([hash, own.has(hash!)]).toEqual([hash, true])
    const docs = new Set(pages.map(page => (page.slug ? `/docs/${page.slug}/` : '/docs/')))
    const blog = new Set(posts.map(post => blogPath(post)))
    const sections = markup.slice(markup.indexOf('id="how"'), markup.indexOf('<footer'))
    for (const [, href] of sections.matchAll(/href="(\/[^"]*)"/g)) {
      const path = href!.split('#')[0]!
      expect([path, docs.has(path) || blog.has(path)]).toEqual([path, true])
    }
    expect(existsSync(app('tools/url-to-markdown/index.html'))).toBe(true)
  })
})
