// Fixed-name files under public/ get a content hash as a query string wherever the page, the docs, their stylesheets or
// the home page's scripts reference them, so a new favicon, wordmark or artwork reaches browsers and Cloudflare at once,
// and the files can be cached for a year (packages/public-preview/src/server.ts) instead of four hours. Every reference
// to a listed file must carry the same version, or browsers download it twice: HTML goes through versionPublicAssets,
// and stylesheets and scripts through versionAssetReferences (vite.config.ts for src/, scripts/build-docs.mjs for the
// docs' stylesheets).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const VERSIONED_PUBLIC_FILES = [
  '/favicon.ico',
  '/assets/favicon-192.png',
  '/assets/apple-touch-icon.png',
  '/assets/octocrawl-wordmark.svg',
  '/assets/octopus-160.webp',
  '/assets/og-card.jpg',
  // The home page's first-screen artwork: its hero backdrop and, on narrow screens, its largest paint.
  '/assets/mountain-hero.webp',
  '/assets/octopus-original.webp',
  // The same octopus at 720 px for the faint copy behind the hero on narrow screens (src/styles.css .hero-octopus-static).
  '/assets/octopus-ghost.webp',
  // The client logos on Connect MCP.
  '/docs-assets/agent-clients/claude-code.svg',
  '/docs-assets/agent-clients/codex.svg',
  '/docs-assets/agent-clients/cursor.svg',
  '/docs-assets/agent-clients/opencode.svg',
  '/docs-assets/nav.css',
  '/docs-assets/nav.js',
]

export function publicAssetVersions(publicDir) {
  return Object.fromEntries(VERSIONED_PUBLIC_FILES.map(path => [
    path,
    createHash('sha256').update(readFileSync(join(publicDir, path))).digest('hex').slice(0, 12),
  ]))
}

/** Appends `?v=<hash>` to every src, href or content attribute that names a listed file without a query string. */
export function versionPublicAssets(html, publicDir) {
  const versions = publicAssetVersions(publicDir)
  return html.replace(/\b(src|href|content)="((?:__W2L_ORIGIN__)?)(\/[^"?]+)"/g, (match, attribute, origin, path) =>
    path in versions ? `${attribute}="${origin}${path}?v=${versions[path]}"` : match)
}

/** Appends `?v=<hash>` to every quoted or url() reference to a listed file in a stylesheet or a script, the same
 * version versionPublicAssets gives the pages. */
export function versionAssetReferences(text, publicDir) {
  const versions = publicAssetVersions(publicDir)
  return text.replace(/(['"`(])((?:__W2L_ORIGIN__)?)(\/[^'"`()?\s]+)(?=['"`)])/g, (match, open, origin, path) =>
    path in versions ? `${open}${origin}${path}?v=${versions[path]}` : match)
}
