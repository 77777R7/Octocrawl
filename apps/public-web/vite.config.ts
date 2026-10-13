import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { faqJsonLd, pageMarkup } from './src/page'
import { toolJsonLd, toolPageMarkup } from './src/tools/urlToMarkdown'
import { hubJsonLd, hubPageMarkup } from './src/tools/toolsHub'
import { scrapeJsonLd, scrapePageMarkup } from './src/product/scrapePage'
import { versionAssetReferences, versionPublicAssets } from './scripts/publicAssetVersions.mjs'

const publicDir = fileURLToPath(new URL('./public', import.meta.url))
const srcDir = fileURLToPath(new URL('./src/', import.meta.url))

export default defineConfig({
  plugins: [{
    // Prerender: index.html ships with the page's markup, and main.ts only brings it to life.
    name: 'w2l-prerender-page',
    transformIndexHtml(html, context) {
      const slot = '<div id="app"></div>'
      if (!html.includes(slot)) throw new Error('index.html must contain an empty #app element')
      // A free tool page (tools/url-to-markdown/index.html) carries its own markup and its structured data.
      // The free tools' hub (tools/index.html) carries its own markup and its structured data.
      if (context.path === '/tools/index.html' || context.path === '/tools/') {
        return versionPublicAssets(html.replace('</head>', `  ${hubJsonLd()}\n  </head>`).replace(slot, `<div id="app">${hubPageMarkup()}</div>`), publicDir)
      }
      // A product page (scrape/index.html) carries its own markup and its FAQ's structured data.
      if (context.path.startsWith('/scrape/')) {
        return versionPublicAssets(html.replace('</head>', `  ${scrapeJsonLd()}\n  </head>`).replace(slot, `<div id="app">${scrapePageMarkup()}</div>`), publicDir)
      }
      if (context.path.startsWith('/tools/url-to-markdown/')) {
        return versionPublicAssets(html.replace('</head>', `  ${toolJsonLd()}\n  </head>`).replace(slot, `<div id="app">${toolPageMarkup()}</div>`), publicDir)
      }
      // The FAQ's structured data goes in the head, from the same list the FAQ section shows.
      const withFaq = html.replace('</head>', `  ${faqJsonLd()}\n  </head>`)
      return versionPublicAssets(withFaq.replace(slot, `<div id="app">${pageMarkup()}</div>`), publicDir)
    },
  }, {
    // The stylesheet's and the scripts' references to the versioned public files (the hero artwork among them) carry
    // the same ?v= as the page's, so a file is fetched once and cached for a year.
    name: 'w2l-version-public-assets',
    // Before Vite's own CSS handling, so the stylesheet's url() references are seen as written.
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]!
      if (!file.startsWith(srcDir) || !/\.(?:[jt]sx?|css)$/.test(file)) return null
      const versioned = versionAssetReferences(code, publicDir)
      return versioned === code ? null : { code: versioned, map: null }
    },
  }],
  build: {
    // The home page and each free tool page: the same hero and script (src/page.ts heroMarkup, src/main.ts).
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), toolsHub: fileURLToPath(new URL('./tools/index.html', import.meta.url)), urlToMarkdown: fileURLToPath(new URL('./tools/url-to-markdown/index.html', import.meta.url)), scrape: fileURLToPath(new URL('./scrape/index.html', import.meta.url)) } },
    // The hero octopus chunk (three.js and the ASCII renderer) is about 500 kB, lazy and decorative: it loads only
    // on wide desktops with motion allowed, after the page works. The limit still flags anything that grows past it.
    chunkSizeWarningLimit: 560,
    // The stylesheet's vh lines are fallbacks for browsers without svh (Safari before 15.4, Chrome before 108,
    // Firefox before 101). The CSS minifier drops any declaration its targets never need, so the targets include
    // those browsers; without this it would ship svh alone.
    cssTarget: ['chrome100', 'edge100', 'firefox100', 'safari15', 'ios15'],
  },
})
