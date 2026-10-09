// The docs pages, in sidebar order. `updated` is the day a page's content last changed: it is each page's lastmod in
// the sitemap, so move it on with any change a reader would notice (test/docsPages.test.ts fails a branch that
// changes a page's content and not its day).
export const pages = [
  { slug: '', file: 'introduction.md', title: 'Introduction', description: 'Try Octocrawl with one public URL and learn what a verified result looks like.', updated: '2026-10-09', group: 'Get started' },
  { slug: 'connect-mcp', file: 'connect-mcp.md', title: 'Connect MCP', description: 'Connect Claude Code, Cursor, OpenCode or Codex to hosted Octocrawl with one URL, no key to start; or run it on your computer with npx.', updated: '2026-10-09', group: 'Get started' },
  { slug: 'guides/claude-code-web-access', file: 'claude-code-web-access.md', title: 'Give Claude Code web access', description: 'Add Octocrawl to Claude Code in one command, so it can map a site and read pages with their source, no account needed.', updated: '2026-10-09', group: 'Guides' },
  { slug: 'guides/extract-page', file: 'extract-page.md', title: 'Extract a public page', description: 'Get readable Markdown, a final URL, status, and elapsed time from a public web page.', updated: '2026-10-08', group: 'Guides' },
  { slug: 'guides/map-site', file: 'map-site.md', title: 'Map a site', description: "List a site's URLs from its links and sitemaps in seconds, each with where it was found, without reading every page.", updated: '2026-10-09', group: 'Guides' },
  { slug: 'guides/own-chrome', file: 'own-chrome.md', title: 'Use your own Chrome', description: 'Read pages signed in as you in the Chrome you already use, get through a check yourself, or save a login, on your own computer.', updated: '2026-10-09', group: 'Guides' },
  { slug: 'guides/amazon-product', file: 'amazon-product.md', title: 'Amazon.sg product JSON', description: 'Check a product ASIN, Singapore delivery region, currency, and missing fields.', updated: '2026-10-02', group: 'Guides' },
  { slug: 'guides/monitor-webhook', file: 'monitor-webhook.md', title: 'Monitor to HTTPS Webhook', description: 'Create a document Monitor and verify durable delivery by eventId.', updated: '2026-10-06', group: 'Guides' },
  { slug: 'guides/batch-results', file: 'batch-results.md', title: 'Page through batch results', description: 'Queue a durable URL batch and inspect every result through pagination.', updated: '2026-10-08', group: 'Guides' },
  { slug: 'limits', file: 'limits.md', title: 'Limits and result states', description: 'Understand preview quotas, supported sites, incomplete fields, blocks, and timeouts.', updated: '2026-10-06', group: 'Reference' },
  { slug: 'reference', file: 'reference.md', title: 'Advanced reference', description: 'Find REST, SDK, and self-hosted entry points after your first Octocrawl result.', updated: '2026-10-09', group: 'Reference' },
  { slug: 'privacy', file: 'privacy.md', title: 'Privacy', description: 'What the public Octocrawl page records about a visit and a preview, what it never records, and how long it keeps it.', updated: '2026-10-08', group: 'Project' },
  { slug: 'terms', file: 'terms.md', title: 'Terms of use', description: 'The terms for the free public Octocrawl preview: what it is, its limits, results as they are, and who runs it.', updated: '2026-10-08', group: 'Project' },
  { slug: 'acceptable-use', file: 'acceptable-use.md', title: 'Acceptable use', description: 'What the public Octocrawl preview may not be used for, and how to report misuse.', updated: '2026-10-08', group: 'Project' },
  { slug: 'contact', file: 'contact.md', title: 'Contact', description: 'How to reach the Octocrawl operator about questions, privacy, security, site owners and misuse.', updated: '2026-10-08', group: 'Project' },
]

// The home page's last content change (src/page.ts, src/featureSections.ts, src/waitlistMarkup.ts), its lastmod.
export const HOME_UPDATED = '2026-10-09'
