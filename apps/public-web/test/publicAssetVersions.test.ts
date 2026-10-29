import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ROOT_ICONS, VERSIONED_PUBLIC_FILES, copyRootIcons, versionAssetReferences, versionPublicAssets } from '../scripts/publicAssetVersions.mjs'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const hashOf = (path: string) => createHash('sha256').update(readFileSync(`${publicDir}${path}`)).digest('hex').slice(0, 12)

describe('versionPublicAssets', () => {
  it('appends the content hash of each listed brand file, with or without the origin token', () => {
    const html = '<link rel="icon" href="/favicon.ico" /><img src="/assets/octocrawl-wordmark.svg" alt="" /><meta property="og:image" content="__W2L_ORIGIN__/assets/og-card.jpg" />'
    expect(versionPublicAssets(html, publicDir)).toBe(
      `<link rel="icon" href="/favicon.ico?v=${hashOf('/favicon.ico')}" /><img src="/assets/octocrawl-wordmark.svg?v=${hashOf('/assets/octocrawl-wordmark.svg')}" alt="" /><meta property="og:image" content="__W2L_ORIGIN__/assets/og-card.jpg?v=${hashOf('/assets/og-card.jpg')}" />`,
    )
  })

  it('leaves unlisted artwork, pages, links with a query string and other origins alone', () => {
    const html = '<img src="/assets/scene-earth.webp" alt="" /><a href="/docs/">Docs</a><img src="/assets/octopus-160.webp?v=abc" /><a href="https://octocrawl.dev/assets/og-card.jpg">card</a>'
    expect(versionPublicAssets(html, publicDir)).toBe(html)
  })

  it('lists only files that exist, so a renamed icon fails the build instead of shipping a dead link', () => {
    for (const path of VERSIONED_PUBLIC_FILES) expect(() => readFileSync(`${publicDir}${path}`)).not.toThrow()
  })
})

describe('copyRootIcons', () => {
  it('puts the icons browsers and crawlers ask for at the root, each the same bytes as the icon the pages link', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'w2l-root-icons-'))
    try {
      await copyRootIcons(publicDir, dist)
      const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]
      for (const [address, file] of Object.entries(ROOT_ICONS)) {
        expect([address, VERSIONED_PUBLIC_FILES.includes(file)]).toEqual([address, true])
        expect([address, readFileSync(join(dist, address)).equals(readFileSync(`${publicDir}${file}`))]).toEqual([address, true])
      }
      expect(size(readFileSync(join(dist, 'apple-touch-icon.png')))).toEqual([180, 180])
      expect(size(readFileSync(join(dist, 'favicon.png')))).toEqual([192, 192])
    } finally {
      await rm(dist, { recursive: true, force: true })
    }
  })
})

describe('versionAssetReferences', () => {
  it('gives a stylesheet or a script the same version the pages give, so the hero artwork is fetched once', () => {
    const v = (path: string) => `${path}?v=${hashOf(path)}`
    const css = ".a{background:url('/assets/mountain-hero.webp')}.b{background:url(/assets/octopus-original.webp)}.c{background:url(\"/assets/mountain-hero.webp\")}"
    expect(versionAssetReferences(css, publicDir)).toBe(`.a{background:url('${v('/assets/mountain-hero.webp')}')}.b{background:url(${v('/assets/octopus-original.webp')})}.c{background:url("${v('/assets/mountain-hero.webp')}")}`)
    const ts = "export const ART = '/assets/mountain-hero.webp'\nconst page = `<img src=\"/assets/octopus-160.webp\">`\nfetch(`/assets/octopus-original.webp`)"
    expect(versionAssetReferences(ts, publicDir)).toBe(`export const ART = '${v('/assets/mountain-hero.webp')}'\nconst page = \`<img src="${v('/assets/octopus-160.webp')}">\`\nfetch(\`${v('/assets/octopus-original.webp')}\`)`)
    expect(versionPublicAssets('<link rel="preload" as="image" href="/assets/mountain-hero.webp" />', publicDir)).toBe(`<link rel="preload" as="image" href="${v('/assets/mountain-hero.webp')}" />`)
  })

  it('leaves unlisted files, versioned references and other text alone', () => {
    const text = "url('/assets/scene-earth.webp') '/assets/mountain-hero.webp?v=abc' 'see /assets/mountain-hero.webp in the docs' '/docs/'"
    expect(versionAssetReferences(text, publicDir)).toBe(text)
  })
})
