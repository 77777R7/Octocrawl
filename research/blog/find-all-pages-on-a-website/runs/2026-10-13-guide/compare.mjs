import { readFileSync, writeFileSync } from 'node:fs'
const D = process.argv[2]
const norm = u => { try { const x = new URL(u.trim()); if (x.hostname !== 'modelcontextprotocol.io') return null; let p = decodeURIComponent(x.pathname).replace(/\/+$/, '') || '/'; if (!/^[\w\-\/.]+$/.test(p)) return null; return 'https://modelcontextprotocol.io' + p } catch { return null } }
const set = a => new Set(a.map(norm).filter(Boolean))
const sitemap = set([...readFileSync(`${D}/mcp-sitemap.xml`, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]))
const root = JSON.parse(readFileSync(`${D}/hosted-map-mcp-root.json`, 'utf8')).links
const links = set(root.filter(l => l.via.includes('link') || l.via.includes('start')).map(l => l.url))
const map = set(root.map(l => l.url))
const wb = set(readFileSync(`${D}/wayback-cdx-mcp.txt`, 'utf8').trim().split('\n').map(l => l.split(' ')[0]))
const cc = set(readFileSync(`${D}/commoncrawl-mcp.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l).url))
const minus = (a, ...b) => [...a].filter(x => !b.some(s => s.has(x))).sort()
const out = {
  counts: { sitemap: sitemap.size, startPageLinks: links.size, map: map.size, wayback: wb.size, commonCrawl: cc.size },
  linksNotInSitemap: minus(links, sitemap),
  sitemapNotInWayback: minus(sitemap, wb).length,
  waybackNotInMap: minus(wb, map),
  commonCrawlNotInMap: minus(cc, map),
  archivesNotInMap: minus(new Set([...wb, ...cc]), map),
}
writeFileSync(`${D}/compare-mcp.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out.counts), 'linksNotInSitemap', out.linksNotInSitemap, 'sitemapNotInWayback', out.sitemapNotInWayback, 'wbNotInMap', out.waybackNotInMap.length, 'ccNotInMap', out.commonCrawlNotInMap.length, 'archivesNotInMap', out.archivesNotInMap.length)
console.log(out.archivesNotInMap.slice(0, 15))
