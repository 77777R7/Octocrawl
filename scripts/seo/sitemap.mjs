// The sitemap reading that the SEO scripts share (check-sitemap.mjs, public-preview/indexnow.mjs). No network, no files.

const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** The `<url>` entries of a sitemap: `loc` and `lastmod` (null when absent). A sitemap index or another document is
 * refused, not read as an empty sitemap. */
export function parseSitemap(xml) {
  if (/<sitemapindex[\s>]/.test(xml)) throw new Error('the sitemap is a sitemap index; these scripts read a single urlset')
  if (!/<urlset[\s>]/.test(xml)) throw new Error('the sitemap has no <urlset>')
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].flatMap(match => {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(match[1])
    if (!loc) return []
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(match[1])
    return [{ loc: decode(loc[1]), lastmod: lastmod ? decode(lastmod[1]) : null }]
  })
}
