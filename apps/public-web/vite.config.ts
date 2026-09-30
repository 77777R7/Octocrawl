import { defineConfig } from 'vite'
import { pageMarkup } from './src/page'

export default defineConfig({
  plugins: [{
    // Prerender: index.html ships with the page's markup, and main.ts only brings it to life.
    name: 'w2l-prerender-page',
    transformIndexHtml(html) {
      const slot = '<div id="app"></div>'
      if (!html.includes(slot)) throw new Error('index.html must contain an empty #app element')
      return html.replace(slot, `<div id="app">${pageMarkup()}</div>`)
    },
  }],
  build: {
    // The hero octopus chunk (three.js and the ASCII renderer) is about 500 kB, lazy and decorative: it loads only
    // on wide desktops with motion allowed, after the page works. The limit still flags anything that grows past it.
    chunkSizeWarningLimit: 560,
    // The stylesheet's vh lines are fallbacks for browsers without svh (Safari before 15.4, Chrome before 108,
    // Firefox before 101). The CSS minifier drops any declaration its targets never need, so the targets include
    // those browsers; without this it would ship svh alone.
    cssTarget: ['chrome100', 'edge100', 'firefox100', 'safari15', 'ios15'],
  },
})
