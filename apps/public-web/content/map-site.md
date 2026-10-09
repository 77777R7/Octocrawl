# Map a site

Use `map` to list a site's URLs before you read any of them: the links on the start page and the entries of the sitemaps the site declares, each with where it was found. A map reads one page body at most, so it answers in seconds. You then choose which URLs to [extract](/docs/guides/extract-page/) or [batch](/docs/guides/batch-results/).

## Try it without an account

Hosted Octocrawl maps a site with no key. A map counts as one page of the [daily allowance](/docs/limits/#hosted-api-and-mcp), 20 a day per address.

```bash
curl -s https://api.octocrawl.dev/v1/map \
  -H 'content-type: application/json' \
  -d '{"url": "https://modelcontextprotocol.io", "search": "transports"}'
```

From an agent connected to `https://mcp.octocrawl.dev/mcp` (see [Connect MCP](/docs/connect-mcp/)), ask:

```text
Use Octocrawl map on https://modelcontextprotocol.io with search "streamable http" and list the URLs it found.
```

On your own computer, with no daily limit and nothing to sign up for:

```bash
npx octocrawl map https://modelcontextprotocol.io --search transports --limit 3
```

The SDKs call the same route: `new W2L({ baseUrl }).map(url, options)` in TypeScript (`@octocrawl/sdk`) and `W2L(...).map(url, **options)` in Python (`octocrawl-client`, options in snake_case such as `include_subdomains`).

## Expected output

On 2026-10-09 at 12:06 UTC the curl command above returned 11 URLs in 1.2 seconds (hosted revision `h2card`, source `ff6a5a5`). Here it is cut to its first two links, with `id`, `url`, `sources.startPage`, the sitemap's `files`, `identity`, `warnings`, the refusal counts that were 0 and the refusal samples left out:

```json
{
  "status": "completed",
  "stoppedBy": null,
  "links": [
    {
      "url": "https://modelcontextprotocol.io/community/working-groups/transports",
      "via": ["sitemap"],
      "sitemapFile": "https://modelcontextprotocol.io/sitemap.xml",
      "lastmod": "2026-08-26T03:23:04.413Z",
      "robots": "allowed"
    },
    {
      "url": "https://modelcontextprotocol.io/specification/2024-11-05/basic/transports",
      "via": ["sitemap"],
      "sitemapFile": "https://modelcontextprotocol.io/sitemap.xml",
      "lastmod": "2026-10-08T12:58:40.318Z",
      "robots": "allowed"
    }
  ],
  "sources": {
    "sitemap": {
      "mode": "include",
      "sources": ["robots"],
      "listed": 356,
      "accepted": 11,
      "truncated": null,
      "error": null
    }
  },
  "refused": { "duplicate": 18, "hostDenied": 8, "searchFiltered": 347 },
  "elapsedMs": 1200
}
```

The site's own pages may change, so a later run can return other URLs.

- **`links`** come in a fixed order: the start URL, then the start page's links as the page lists them, then sitemap entries not already found.
- **`via`** says where a URL was found: `start`, `link` (an `<a href>` on the start page) or `sitemap`. A URL found both ways lists both.
- **`sitemapFile` and `lastmod`** name the sitemap that listed the URL and the date it gave, as written there.
- **`title`**, when present, is the start page's own `<title>`, a link's anchor text, or a news sitemap's title. A map never opens a page to fetch its title.
- **`sources`** shows what was read: the start page (status, links found) and each sitemap file (the `Sitemap:` lines of robots.txt, or `/sitemap.xml` when there are none).
- **`refused`** counts what was left out and why, every reason each time, 0 included. Up to 20 examples are kept for URLs folded into a similar one, on other hosts, and disallowed by robots.txt. Here 347 URLs did not match `search`, 18 repeated a URL already seen, and 8 were on other hosts (among them `blog.modelcontextprotocol.io`, `github.com` and `discord.gg`).

Over MCP the answer is compact by default: each URL with its title, and counts of what was returned and refused. Set `debug: true` for the full map above.

## Narrow the list

| Option | What it does |
| --- | --- |
| `search` | Keeps URLs whose address or title contains every word, ignoring case. It filters and does not rank. |
| `limit` | The most URLs to return: 5000 by default and at most on hosted Octocrawl, up to 100000 on your computer. A map that reaches it is `completed` with `stoppedBy: "limit"`. |
| `sitemap` | `include` by default. `skip` reads only the start page; `only` reads only the sitemaps. |
| `includeSubdomains` | Also keeps `docs.`, `blog.` and other hosts under the start domain. Off by default. |
| `crawlEntireDomain` | Keeps URLs outside the start URL's path. Off by default. |
| `includePaths`, `excludePaths` | Regular expressions on the path; an exclude wins. |
| `ignoreQueryParameters` | Treats URLs that differ only in their query as one. Off by default. |
| `timeout` | Milliseconds for the whole map: 60000 by default and at most on hosted Octocrawl. At the deadline you get what was found. |

A map stays inside the start URL's path, or the path it redirects to. On the same day, starting at `https://modelcontextprotocol.io/docs` returned 117 URLs, all under `/docs`, and counted 248 links and sitemap entries elsewhere on the site as `subtreeDenied`; starting at `https://modelcontextprotocol.io` returned 358. Start at the site's root, or set `crawlEntireDomain`, to list the whole site.

## If the list is short or empty

- **The site has no sitemap:** a map then lists only the start page's links. To go further, crawl the site on your computer (`npx octocrawl crawl`), which reads each page it finds.
- **`start_page_client_rendered`:** the start page builds its links with JavaScript, which a map does not run. Scrape the page with `formats: ["links"]` on your computer, or with a key that has the browser lane, where a browser can render it.
- **`partial` with `map_timeout`:** the deadline ended the map. The links found so far are in the answer; raise `timeout` or narrow the map.
- **`refused.robots`:** robots.txt disallows those URLs, and a map does not list them. Hosted Octocrawl always obeys robots.txt. On your computer, `ignoreRobotsTxt` returns them with their verdict, except where a rule names Octocrawl itself.
- **`failed`:** nothing was found, and something did not finish: the start page could not be read or robots.txt disallows it (`sources.startPage.failureReason` says which), a sitemap could not be read (a file in `sources.sitemap.files` marked `unreadable` or `refused`, or `sources.sitemap.error`), too many sitemap files, or the deadline came first. `warnings` names each. When the start page fails but a sitemap lists URLs, the map is `partial` and keeps them.

See the [reference](/docs/reference/) for every route, and [limits and result states](/docs/limits/) for the hosted allowances.
