import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSIONED_PUBLIC_FILES, versionPublicAssets } from '../scripts/publicAssetVersions.mjs'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const hashOf = (path: string) => createHash('sha256').update(readFileSync(`${publicDir}${path}`)).digest('hex').slice(0, 12)

describe('versionPublicAssets', () => {
  it('appends the content hash of each listed brand file, with or without the origin token', () => {
    const html = '<link rel="icon" href="/favicon.ico" /><img src="/assets/octocrawl-wordmark.svg" alt="" /><meta property="og:image" content="__W2L_ORIGIN__/assets/og-card.jpg" />'
    expect(versionPublicAssets(html, publicDir)).toBe(
      `<link rel="icon" href="/favicon.ico?v=${hashOf('/favicon.ico')}" /><img src="/assets/octocrawl-wordmark.svg?v=${hashOf('/assets/octocrawl-wordmark.svg')}" alt="" /><meta property="og:image" content="__W2L_ORIGIN__/assets/og-card.jpg?v=${hashOf('/assets/og-card.jpg')}" />`,
    )
  })

  it('leaves artwork, pages, links with a query string and unlisted files alone', () => {
    const html = '<link rel="preload" as="image" href="/assets/mountain-hero.webp" /><a href="/docs/">Docs</a><img src="/assets/octopus-160.webp?v=abc" /><a href="https://octocrawl.dev/assets/og-card.jpg">card</a>'
    expect(versionPublicAssets(html, publicDir)).toBe(html)
  })

  it('lists only files that exist, so a renamed icon fails the build instead of shipping a dead link', () => {
    for (const path of VERSIONED_PUBLIC_FILES) expect(() => readFileSync(`${publicDir}${path}`)).not.toThrow()
  })
})
