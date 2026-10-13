import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NAV_TOOLS } from '../scripts/siteNav.mjs'
import { pageMarkup } from '../src/page'
import { HUB_FAQ, HUB_TITLE, hubJsonLd, hubPageMarkup } from '../src/tools/toolsHub'
import { TOOLS, TOOLS_PATH, toolPath } from '../src/tools/toolSections'

// /tools/: the free tools under a banner of the coast. A live tool's card links to its page; the next ones link nowhere.
const app = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url))
const markup = hubPageMarkup()

describe('the free tools hub', () => {
  it('is built, listed in the sitemap, and reached from the Product menu and the footer', () => {
    const entry = readFileSync(app('tools/index.html'), 'utf8')
    expect(entry).toContain('<script type="module" src="/src/tools/hubMain.ts"></script>')
    expect(entry).toContain(`<title>${HUB_TITLE}</title>`)
    expect(entry).toContain('<link rel="preload" as="image" href="/assets/scene-coast.webp" />')
    expect(readFileSync(app('vite.config.ts'), 'utf8')).toContain('./tools/index.html')
    expect(readFileSync(app('scripts/build-docs.mjs'), 'utf8')).toContain(`const TOOLS_HUB_PATH = '${TOOLS_PATH}'`)
    expect(NAV_TOOLS[0]).toMatchObject({ title: 'All free tools', href: TOOLS_PATH })
    expect(pageMarkup()).toContain(`<li><a href="${TOOLS_PATH}">Free tools</a></li>`)
  })

  it('links each live tool to its built page and lists the others as coming next', () => {
    for (const tool of TOOLS) {
      const link = `<a class="hub-link" href="${toolPath(tool)}">`
      if (tool.live) {
        expect([tool.slug, markup.includes(link), existsSync(app(`${toolPath(tool).slice(1)}index.html`))]).toEqual([tool.slug, true, true])
      } else {
        expect([tool.slug, markup.includes(link), markup.includes(`aria-label="${tool.name}, coming next"`)]).toEqual([tool.slug, false, true])
      }
    }
    const data = JSON.parse(hubJsonLd().replace(/^<script[^>]*>|<\/script>$/g, ''))
    expect(data).toMatchObject({ '@type': 'CollectionPage', url: `__W2L_ORIGIN__${TOOLS_PATH}` })
    expect(data.hasPart).toHaveLength(TOOLS.filter(tool => tool.live).length)
  })

  it('has no inline styles, unique ids and its FAQ', () => {
    expect(markup).not.toContain('style=')
    const all = [...markup.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id!)
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([])
    expect(markup.match(/<details class="faq-item">/g)).toHaveLength(HUB_FAQ.length)
    expect(markup).toContain('<h1 id="hub-title">')
  })
})
