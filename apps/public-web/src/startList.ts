/** The home page's last band before the footer: where to use Octocrawl after trying it here. It replaced the hosted
 * early-access form, which nobody sent once signing in gave credits and keys (0 entries by 2026-11-03). Each row is one
 * link; a click is a link_click like any other (analytics.ts). */
const ROWS: ReadonlyArray<{ head: string; text: string; action: string; href: string }> = [
  { head: 'In your agent', text: 'Add the MCP server to Claude Code, Cursor or Codex, and your agent reads pages as Markdown itself.', action: 'Connect MCP', href: '/docs/connect-mcp/' },
  { head: 'In the Playground', text: 'Scrape a page or map a site in your browser, on your account’s credits, with a browser for pages that need one.', action: 'Open the Playground', href: '/dashboard/scrape/' },
  { head: 'From your code', text: 'Call the REST API or the Node and Python SDKs, or run the same scrape on your own computer with the CLI.', action: 'First call', href: '/docs/scrape/' },
  { head: 'Need more, or a team', text: 'Higher limits, a team, or something Octocrawl does not do yet: tell us what you would collect.', action: 'hello@octocrawl.dev', href: 'mailto:hello@octocrawl.dev' },
]

export function startListMarkup(): string {
  const rows = ROWS.map(row => `<li><a class="start-row" href="${row.href}"><span class="start-row-text"><strong>${row.head}</strong><span>${row.text}</span></span><span class="start-row-action">${row.action}<span aria-hidden="true">→</span></span></a></li>`).join('')
  return `<div class="band band-dark start-list-band" role="region" aria-labelledby="start-list-title">
        <div class="frame start-list">
          <div class="start-list-copy">
            <p class="section-kicker"><span class="kicker-square" aria-hidden="true"></span>HOSTED OCTOCRAWL</p>
            <h2 id="start-list-title">Free to start. Pick where it runs.</h2>
            <p>Without a key, hosted Octocrawl reads 20 pages a day per address. <a href="/signin/">Signing in</a> adds 1,000 credits a month and API keys.</p>
          </div>
          <ul class="start-list-rows" role="list">${rows}</ul>
        </div>
      </div>`
}
