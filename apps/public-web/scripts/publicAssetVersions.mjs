// Fixed-name files under public/ get a content hash as a query string wherever the page or the docs reference them,
// so a new favicon or wordmark reaches browsers and Cloudflare at once instead of after their four-hour cache.
// Only brand and icon files and the shared navigation's stylesheet and script are listed: the artwork is referenced from the stylesheet and the scripts too, and
// versioning one of those references but not the others would make browsers download the same image twice.
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
