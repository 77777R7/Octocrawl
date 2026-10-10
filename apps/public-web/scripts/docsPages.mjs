// The docs pages, in sidebar order. `updated` is the day a page's content last changed: it is each page's lastmod in
// the sitemap, so move it on with any change a reader would notice (test/docsPages.test.ts fails a branch that
// changes a page's content and not its day).
// `title` names the page in the sidebar, the navigation and its breadcrumb. `seoTitle`, when set, is its <title> and
// link-preview title instead of "<title> | Octocrawl Docs": at most 60 characters, worded as people search for it.
// `description` is its meta description, 140 to 160 characters (test/docsPages.test.ts).
export const pages = [
  { slug: '', file: 'introduction.md', title: 'Introduction', seoTitle: 'Octocrawl Docs: Web Scraping for AI Agents and Pipelines', description: 'Start with Octocrawl: turn a public web page into Markdown, with checked fields on supported pages, then connect an AI agent over MCP or run it with npx.', updated: '2026-10-10', group: 'Get started' },
  { slug: 'connect-mcp', file: 'connect-mcp.md', title: 'Connect MCP', seoTitle: 'Connect Octocrawl MCP to Claude Code, Cursor and Codex', description: 'Add hosted Octocrawl MCP to Claude Code, Cursor, OpenCode or Codex with one URL and no key to scrape and map public pages, or run every tool locally with npx.', updated: '2026-10-10', group: 'Get started' },
  { slug: 'guides/amazon-product', file: 'amazon-product.md', title: 'Amazon.sg product JSON', seoTitle: 'Amazon.sg Product Data as Checked JSON | Octocrawl', description: 'Turn an Amazon.sg /dp/ page into product JSON with Octocrawl (Beta): ASIN, title, price, currency, seller and delivery region, each checked or marked missing.', updated: '2026-10-02', group: 'Guides' },
  { slug: 'guides/monitor-webhook', file: 'monitor-webhook.md', title: 'Monitor to HTTPS Webhook', seoTitle: 'Monitor a Web Page and Send Changes to a Webhook | Octocrawl', description: 'Watch a public documentation page with a local Octocrawl Monitor, keep its baseline and run history, and deliver each change as an event to an HTTPS webhook.', updated: '2026-10-06', group: 'Guides' },
  { slug: 'limits', file: 'limits.md', title: 'Limits and result states', seoTitle: 'Octocrawl Limits, Quotas and Result States', description: 'Hosted Octocrawl\'s daily limits with and without a key, the sites it supports, and what each result means: success, blocked, failed, timeout or incomplete.', updated: '2026-10-06', group: 'Reference' },
  { slug: 'reference', file: 'reference.md', title: 'Advanced reference', seoTitle: 'Octocrawl API Reference: REST, SDK, JSON and Evidence', description: 'Reference for Octocrawl\'s REST API, TypeScript SDK and Python client: scrape, map, batch and crawl routes, JSON extraction, error codes and the Evidence Record.', updated: '2026-10-10', group: 'Reference' },
  { slug: 'privacy', file: 'privacy.md', title: 'Privacy', description: 'What the Octocrawl page and its preview service record about a visit and a preview, what they never record, how long each record is kept, and who sees it.', updated: '2026-10-10', group: 'Project' },
  { slug: 'terms', file: 'terms.md', title: 'Terms of use', description: 'The terms for the free public Octocrawl preview: what it is and is not, its daily limits, results provided as they are, who runs it and how to reach them.', updated: '2026-10-08', group: 'Project' },
  { slug: 'acceptable-use', file: 'acceptable-use.md', title: 'Acceptable use', description: 'What the hosted Octocrawl preview, API and MCP may not be used for, such as private pages or getting around logins and CAPTCHAs, and how to report misuse.', updated: '2026-10-08', group: 'Project' },
  { slug: 'contact', file: 'contact.md', title: 'Contact', description: 'How to reach the Octocrawl operator: public GitHub issues for questions, bugs and ideas, private email for privacy, security, site owners and misuse reports.', updated: '2026-10-08', group: 'Project' },
]

// The home page's last content change (src/page.ts, src/featureSections.ts, src/waitlistMarkup.ts), its lastmod.
export const HOME_UPDATED = '2026-10-10'
