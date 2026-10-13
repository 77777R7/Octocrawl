// Renders the article's four figures from figs.html at 2x, 760 px wide; cwebp -q 90 then makes the .webp files.
// Run with node from the repository root (it resolves playwright from node_modules): node <this file> <this folder>
import { chromium } from 'playwright'
const dir = process.argv[2]
const b = await chromium.launch(); const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: 800, height: 1000 } })
await p.goto('file://' + dir + '/figs.html')
for (const id of ['robots', 'site', 'gsc', 'check']) await p.locator('#' + id).screenshot({ path: `${dir}/${id}.png`, omitBackground: false })
await b.close()
