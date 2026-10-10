// The blog's articles, newest first. Each is content/blog/<slug>.md, served at /blog/<slug>/ with its cover from
// public/blog-assets/<slug>/ (cover.webp 1672×941 for the article, card.webp 836×470 for the list, og.jpg 1200×630
// for link previews). The research behind each article is research/blog/<slug>/brief.md.
//
// - title: the page's <title>, card and headline; at most 60 characters, no brand suffix. The article's h1 is its
//   first line, `# ...`, and may say more.
// - description: 140 to 160 characters, unique on the site.
// - pubDate: the day the article first went live; it never changes. updatedDate: only when its facts, data or
//   structure changed, later than pubDate; null otherwise. The sitemap's lastmod is updatedDate ?? pubDate.
// - from: the docs address the article replaced, answered with a 301 (scripts/build-docs.mjs writes redirects.json).
// - related: the slugs listed under Keep reading, all published.
// Keep each entry on one line, with file before pubDate, as test/blogPosts.test.ts reads them.

export const BLOG_AUTHOR = 'Octocrawl team'

export const posts = [
  { slug: 'claude-code-web-scraping', file: 'blog/claude-code-web-scraping.md', title: 'Claude Code Web Scraping: Add a Web Tool With MCP', description: 'Give Claude Code a web scraping tool in one command: it can map a site, read pages as Markdown and cite the source URL and fetch time of every answer.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered lighthouse on a cliff at dusk, its beam sweeping across a dotted blue sky.', from: '/docs/guides/claude-code-web-access/', related: ['find-all-pages-on-a-website', 'web-scraping-for-rag', 'scrape-website-with-login'] },
  { slug: 'web-scraping-for-rag', file: 'blog/web-scraping-for-rag.md', title: 'Web Scraping for RAG: Markdown Chunks That Keep Sources', description: 'Scrape web pages into clean Markdown for RAG, split them into chunks that keep the source URL, fetch time and a text hash, and skip pages that did not change.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered high-speed train crossing a stone viaduct between mountains at sunset.', from: '/docs/guides/rag-markdown/', related: ['find-all-pages-on-a-website', 'scrape-list-of-urls', 'extract-structured-data-from-web-page'] },
  { slug: 'find-all-pages-on-a-website', file: 'blog/find-all-pages-on-a-website.md', title: 'How to Find All Pages on a Website, With Their Sources', description: 'List every page of a website from its sitemaps and links in seconds, see where each URL was found, and learn why some pages are left out of the list.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered Golden Gate Bridge at sunset, the city skyline behind it and fog over the bay.', from: '/docs/guides/map-site/', related: ['scrape-list-of-urls', 'web-scraping-for-rag', 'claude-code-web-scraping'] },
  { slug: 'scrape-website-with-login', file: 'blog/scrape-website-with-login.md', title: 'Scrape a Website With Login Without Sharing Your Password', description: 'Read pages that need your login in the Chrome you already use. Your password and cookies stay in your browser, and you pass any check yourself, not a bot.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered modern house with a lit window under two pine trees on a hill by the sea at dusk.', from: '/docs/guides/own-chrome/', related: ['claude-code-web-scraping', 'scrape-list-of-urls', 'extract-structured-data-from-web-page'] },
  { slug: 'extract-structured-data-from-web-page', file: 'blog/extract-structured-data-from-web-page.md', title: 'Extract Structured Data From a Web Page, Without AI', description: 'Pull fields like price and availability from a web page into JSON, each with the place on the page it was read from, and a reason when a field is missing.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered coastal road lined with palm trees, curving along the sea toward mountains at sunset.', from: '/docs/guides/extract-page/', related: ['web-scraping-for-rag', 'scrape-list-of-urls', 'find-all-pages-on-a-website'] },
  { slug: 'scrape-list-of-urls', file: 'blog/scrape-list-of-urls.md', title: 'How to Scrape a List of URLs and Keep Every Failure', description: 'Scrape a list of up to 1,000 URLs into Markdown files and a CSV, with one row per URL, the reason for every failure and the evidence behind each page.', pubDate: '2026-10-10', updatedDate: null, coverAlt: 'A pixel-dithered sailboat on a still mountain lake, pine trees on the shore and snowy peaks lit orange.', from: '/docs/guides/batch-results/', related: ['find-all-pages-on-a-website', 'web-scraping-for-rag', 'scrape-website-with-login'] },
]

/** The blog index's last change: the newest article's day. */
export const BLOG_UPDATED = posts.map(post => post.updatedDate ?? post.pubDate).sort().at(-1)

export const blogPath = post => `/blog/${post.slug}/`
