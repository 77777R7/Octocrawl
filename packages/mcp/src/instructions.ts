/**
 * The `instructions` a client reads at initialize, often before any tool definition (tool search loads definitions on
 * demand): what Octocrawl does, which tool a task starts with, how to read a result, and what this connection can
 * reach. Written from the tools the surface lists, so it names no tool the client cannot call, and kept to facts
 * (no links, no campaign tags) and under 2,000 characters (Claude Code cuts at 4,096). docs/mcp-client-ux-tasks.md W3.
 */

/** Where the server runs, and for hosted Octocrawl what the caller brought. */
export type InstructionsSurface =
  | { kind: 'local'; /** Started with --read-only: scrape does not act as the person (docs/mcp-client-ux-tasks.md W10.2). */ readOnly?: boolean }
  | { kind: 'hosted'; connection: 'keyless' | 'key' | 'oauth'; browser: boolean; /** A keyless caller from Claude's egress range, whose allowance every such connector shares. */ sharedPool?: boolean; /** A keyless caller's pages a day (the address's, or the shared pool's), said so the model knows the number before it is spent. */ allowance?: number }

/**
 * The rule behind browser_busy on a connection with the browser lane (the lease in hostedApi.ts): said here and, where
 * batch_scrape is listed, in scrape's description, since a client can load either one without the other.
 */
export function oneScrapeAtATime(listsBatch: boolean): string {
  return `One scrape at a time in the browser per key or sign-in: a parallel one that needs it gets browser_busy, so ${listsBatch ? 'send many URLs as one batch_scrape' : 'send them in turn'}.`
}

export function serverInstructions(toolNames: Iterable<string>, surface: InstructionsSurface): string {
  const tools = new Set(toolNames)
  const has = (...names: string[]) => names.every((name) => tools.has(name))
  const lines: string[] = [
    'Octocrawl reads web pages as Markdown, each with an Evidence Record (final URL, fetch time, HTTP status, robots.txt decision, content hashes). A blocked, empty or wrong page is a result whose status says so (failureReason, blockReason): evidence about the page, not an error, not an empty success.',
  ]

  const routes: string[] = []
  if (has('scrape')) routes.push('one known URL: scrape')
  if (has('map')) routes.push('the URLs of a site without reading each page: map')
  if (has('batch_scrape', 'wait_batch', 'get_batch_items')) routes.push('a known list of URLs: batch_scrape, then wait_batch, then get_batch_items')
  if (has('crawl', 'wait_crawl', 'get_crawl_pages')) routes.push('a section of a site, page by page: crawl, then wait_crawl, then get_crawl_pages')
  else if (has('crawl', 'get_crawl', 'get_crawl_pages')) routes.push('a section of a site, page by page: crawl, then get_crawl until it ends, then get_crawl_pages')
  if (has('scrape_product')) routes.push('an Amazon.sg product page as checked JSON: scrape_product')
  if (has('preview_monitor', 'create_monitor')) routes.push('a page to re-check on a schedule: preview_monitor, then create_monitor')
  if (routes.length > 0) lines.push(`Start with: ${routes.join('; ')}.`)
  // D2 (docs/launch/2026-11-05-batch-concurrency-plan.md): a directory's detail pages were read one scrape at a time on
  // 2026-11-04 (272 calls); the route is URLs first, then one batch.
  if (has('batch_scrape', 'get_batch_items')) {
    const urls = has('map') ? 'map where a sitemap lists them; else batch_scrape the listing pages with formats: ["links"] and keep the detail links' : 'batch_scrape the listing pages with formats: ["links"] and keep the detail links'
    lines.push(`A directory's detail pages: URLs first (${urls}), then one batch_scrape of them, not one scrape each.`)
  }

  if (has('scrape') || has('batch_scrape') || has('crawl')) {
    lines.push('Read a result in three parts: status is the fetch; verification.status is the verify contract (not_requested when none was sent); readiness says whether the needed part of the page had loaded. agentHints name the next step. An error answer is about the call, not the page.')
  }
  if (has('crawl') || has('batch_scrape')) {
    lines.push(`${has('crawl', 'batch_scrape') ? 'crawl and batch_scrape return' : has('crawl') ? 'crawl returns' : 'batch_scrape returns'} a taskId at once. A start that errored or timed out on the client may still have begun: send it again with the same idempotencyKey to get that task, not a second one.`)
  }

  if (surface.kind === 'local') {
    if (has('scrape')) {
      lines.push(surface.readOnly === true
        ? 'This server is read-only: its tools only read, and scrape takes no actions, lane, handoff or mode authed, so nothing runs as the person.'
        : 'lane my-browser, handoff and mode authed read pages in the person\'s own Chrome or with their saved login: ask the person first and name the site.')
      lines.push('fastMode: true reads over HTTP alone; waitFor above 0 starts in the browser, for a page known to need scripts.')
    }
    if (has('scrape', 'map')) lines.push('If this server\'s API is hosted Octocrawl (api.octocrawl.dev) rather than npx octocrawl serve on this computer, only scrape and map run there.')
  } else {
    if (surface.connection === 'keyless') {
      // The number, where the server knows it: a keyless caller otherwise learns the allowance only when it is used up.
      const pages = surface.allowance === undefined ? '' : ` of ${surface.allowance.toLocaleString('en-US')} pages`
      const allowance = surface.sharedPool ? `within a daily allowance${pages} that every Claude connector without a key shares` : `within a daily allowance${pages} per address`
      lines.push(`This connection has no key: pages are read over HTTP alone, ${allowance} (every call counts, whether or not a page came back; it resets at 00:00 UTC), so a page that fills itself in with scripts comes back as a shell (client_rendered_suspected). Signing in or a key adds the browser lane and spends the account's credits.`)
    } else {
      const spends = surface.connection === 'oauth'
        ? 'This connection spends the signed-in account\'s credits: 1 per HTTP page, 5 per browser page, 1 per map, 2 more when json modelFallback called the model.'
        : 'With a key, pages count against its daily allowance or an account\'s credits: 1 per HTTP page, 5 per browser page, 1 per map, 2 more when json modelFallback called the model.'
      const lane = surface.browser
        ? `A page that needs scripts goes to the browser lane; fastMode: true stays on HTTP, waitFor above 0 starts in the browser. ${oneScrapeAtATime(has('batch_scrape'))}`
        : 'This connection reads over HTTP alone: it has no browser lane.'
      lines.push(`${spends} ${lane}`)
    }
    lines.push(has('crawl', 'batch_scrape')
      ? 'Crawls and batches run here as jobs on the account, a slice at a time: at most 500 pages a crawl, 1,000 URLs a batch, each page priced as a scrape, results kept 7 days. Monitors and saved logins run on a server on the person\'s computer: npx octocrawl serve.'
      : 'Crawls, batches, Monitors and saved logins run on a server on the person\'s computer: npx octocrawl serve.')
  }
  return lines.join('\n\n')
}
