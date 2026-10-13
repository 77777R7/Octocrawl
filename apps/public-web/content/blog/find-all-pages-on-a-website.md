# How to find all pages on a website: 6 ways, and how to check the list

To find all pages on a website, read its sitemap (robots.txt says where it is), search Google with `site:`, check Search Console if the site is yours, run a crawler, map the site with one API call, or look the domain up in the Wayback Machine. Each finds a different part of the site, so the last step is to check the list.

[**Paste a URL, get every page and where it was found →**](/tools/link-extractor/?from=blog-find-all-pages)

On 2026-10-13 we tried five of them on modelcontextprotocol.io and on our own site, octocrawl.dev; for the crawler we read its documentation. The sitemap listed 357 pages, Google said "about 4,310 results", and two web archives held 458 addresses that a map of the site didn't. Here is what each way finds, which to use, and how we found out which of those 458 were real pages.

## 1. Read the sitemap, found from robots.txt

Most sites publish a sitemap: an XML file that lists the pages they want search engines to find, described by the [sitemaps protocol](https://www.sitemaps.org/protocol.html). Its address is usually written in the site's robots.txt, on a `Sitemap:` line. Open `https://example.com/robots.txt` and look for it:

```text
User-agent: *
Disallow: /cdn-cgi/
Allow: /_next/image
Disallow: /_next/
Sitemap: https://modelcontextprotocol.io/sitemap.xml
```

That is modelcontextprotocol.io's robots.txt, with one line left out. Its sitemap lists 357 URLs. When robots.txt names no sitemap, try `/sitemap.xml` and `/sitemap_index.xml`. A sitemap index lists other sitemaps, so open each one it names.

**Finds:** the pages the site wants found. **Misses:** pages the owner left out, and on many small sites there is no sitemap at all.

## 2. Search Google with site:

Type `site:` and the domain into Google:

```text
site:modelcontextprotocol.io
```

Google answered "About 4,310 results", and its first five results were on other hosts: `blog.`, `ts.sdk.`, `php.sdk.` and `ruby.sdk.modelcontextprotocol.io`. `site:` includes subdomains, so add a path to stay in one part of a site. `site:modelcontextprotocol.io/specification` said about 192, where the sitemap lists 142 pages under `/specification`.

The number is an estimate, not a count. Google's own [documentation of `site:`](https://developers.google.com/search/docs/monitor-debug/search-operators/all-search-site) says the list "is not always exhaustive". Use `site:` to see what Google shows for a site, and to check whether one page is in Google. Don't use it to count pages.

**Finds:** pages Google has indexed, on any site. **Misses:** pages Google hasn't indexed, and the count can't be trusted.

## 3. Check Search Console (your own site only)

If you own the site, [Google Search Console](https://search.google.com/search-console) says which of your pages Google knows. The [Pages report](https://support.google.com/webmasters/answer/7440203) lists indexed and not-indexed pages with a reason, up to 1,000 example URLs for each. URL Inspection checks one address.

We inspected the 24 URLs a map of our own site found. 21 were "Submitted and indexed". Three were "URL is unknown to Google": `/scrape/`, a page we had published that day, `/llms.txt` and `/signin/`. Search Console is the only method here that tells you what Google thinks of each page, not just whether it exists.

**Finds:** what Google has found and indexed on your site, with a reason for the rest. **Misses:** pages Google has never found. It only works on a site you've verified.

## 4. Run a crawler

A crawler, such as [Screaming Frog SEO Spider](https://www.screamingfrog.co.uk/seo-spider/), starts at the home page, opens every page and follows every link, the way a search engine does. It reports each page's status code, title and links. Screaming Frog's free version crawls up to 500 URLs at a time and doesn't render JavaScript; a licence removes both limits.

**Finds:** every page that a link reaches, with its status code. **Misses:** pages nothing links to. It's also the slowest method, because it opens every page.

## 5. Map the site with one call

A site map tool reads the sitemaps and the links on the start page, without opening every page, and returns one list. Octocrawl's `map` does that, and says where it found each URL. Hosted Octocrawl takes no key. A map counts as one page of the [daily allowance](/docs/limits/#hosted-api-and-mcp), 20 a day per address:

```bash
curl -s https://api.octocrawl.dev/v1/map \
  -H 'content-type: application/json' \
  -d '{"url": "https://modelcontextprotocol.io"}'
```

It returned 359 URLs in 2.5 seconds: 357 from the sitemap and 18 from links on the start page. Two were not in the sitemap at all: the home page and `/llms.txt`. On your own computer, with no daily limit, the CLI does the same:

```bash
npx octocrawl map https://modelcontextprotocol.io --search transports --limit 3
```

![The CLI map of modelcontextprotocol.io with search "transports", limited to 3 URLs](/blog-assets/find-all-pages-on-a-website/cli-map.webp "npx octocrawl@0.3.2 map with --search transports --limit 3: three URLs, each found in the sitemap, and the counts of what was left out. Rendered from the saved output, 2026-10-09 19:48 UTC.")

Every URL in the answer says where it came from:

```json
{
  "url": "https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro",
  "via": ["link", "sitemap"],
  "sitemapFile": "https://modelcontextprotocol.io/sitemap.xml",
  "lastmod": "2026-10-11T01:32:35.369Z",
  "robots": "allowed"
}
```

`via` is `start`, `link` or `sitemap`, and a URL found both ways lists both. `sitemapFile` and `lastmod` name the sitemap that listed it and the date it gave. What the map left out is counted in `refused`: here 18 entries repeated a URL already seen (17 sitemap entries for pages already found as links) and 8 links pointed to other hosts, such as `github.com` and `blog.modelcontextprotocol.io`.

![How map builds the list: start-page links and sitemap entries go through the scope, robots.txt and search filters, and every URL left out is counted by reason](/blog-assets/find-all-pages-on-a-website/sources.webp "Two sources in, one list out, and a count for every reason a URL was left out.")

Options narrow the list:

| Option | What it does |
| --- | --- |
| `search` | Keeps URLs whose address or title contains every word, ignoring case. It filters and does not rank. |
| `limit` | The most URLs to return: 5,000 by default and at most on hosted Octocrawl, up to 100,000 on your computer. |
| `sitemap` | `include` by default. `skip` reads only the start page, `only` reads only the sitemaps. |
| `includeSubdomains` | Also keeps `docs.`, `blog.` and other hosts under the start domain. |
| `crawlEntireDomain` | Keeps URLs outside the start URL's path. |
| `includePaths`, `excludePaths` | Regular expressions on the path. An exclude wins. |

A map stays inside the start URL's path: starting at `/docs` lists only pages under `/docs`. Start at the root to list everything.

[**Try it on any site, no sign-up →**](/tools/link-extractor/?from=blog-find-all-pages)

**Finds:** everything the site declares and links from its start page, in seconds, with the source of each URL. **Misses:** pages that are neither in a sitemap nor linked from the start page. It doesn't open the pages, so it can't give status codes.

## 6. Look the domain up in web archives

The Wayback Machine and Common Crawl keep copies of pages they have visited over the years. Both can list every address they hold for a domain. The Wayback Machine's CDX API:

```text
https://web.archive.org/cdx/search/cdx?url=modelcontextprotocol.io/*&collapse=urlkey&filter=statuscode:200&filter=mimetype:text/html&fl=original
```

returned 582 page addresses for modelcontextprotocol.io, after we dropped query strings, duplicates and malformed addresses such as `/introduction)`, copied from text with the bracket still on. Common Crawl's latest index that day (CC-MAIN-2026-39) held 411. Together they had 458 addresses that the map didn't.

**Finds:** pages that exist now or used to, including old ones nothing links to. **Misses:** pages the archives never visited. Many of the addresses are gone, as the next section shows.

## Which way should you use?

| Your situation | Use |
| --- | --- |
| You want a list in seconds, for any site | Map it (5), or read the sitemap (1) |
| The site is yours | Search Console (3), then compare it with the sitemap |
| You need status codes, titles, broken links | A crawler (4) |
| You're checking one page is in Google | `site:` with the page's address (2) |
| You want pages that used to exist | Web archives (6) |
| The site has no sitemap | A crawler (4), or a map, which falls back to start-page links |

## How do you check the list is complete?

Compare two sources, then check the addresses that only one of them has. A longer list isn't a more complete one until you do.

The archives gave us 458 addresses the map didn't have. We requested each one, except 11 under `/_next/`, which the site's robots.txt disallows, and followed every redirect that didn't land on a page the map listed:

| What came back | Addresses |
| --- | --- |
| 404, the page is gone | 95 |
| A redirect: 88 to a page the map listed, 8 to a page that answers 404 | 96 |
| 200, a Markdown copy of a listed page (`…/intro.md`) | 203 |
| 200, the same page under another address (`…/index`) or a copy of that | 52 |
| 200, `robots.txt` | 1 |

None of the 447 we requested was a live page the map had missed. The extra length was old pages, redirects and copies. On another site the same check could find real pages, which is why it's worth doing.

The same goes for your own site: compare the sitemap with Search Console. Pages in the sitemap that Google doesn't know need a link or a request to index them. Pages Google knows that aren't in the sitemap are either missing from it or shouldn't exist.

## Which pages won't any method find?

- **Orphan pages.** A page that no sitemap lists, no page links to and no archive visited can't be found from outside. If the site is yours, your server logs or CMS still have it.
- **Pages behind a login.** Crawlers and maps see what a visitor sees.
- **Links built by JavaScript.** A map and most crawlers read the HTML as the server sends it. When the start page builds its links in the browser, the map's answer says `start_page_client_rendered`, and a scrape in a real browser gets them.

## FAQ

### How do I find all pages on a website for free?

All six ways are free to start. The quickest is to read the sitemap or map the site: hosted Octocrawl maps a site with no key, 20 a day per address, and `npx octocrawl map` on your computer has no daily limit.

### How many pages does a website have?

Count the URLs in its sitemap or map, then check them as above. Google's `site:` count is an estimate and includes subdomains: it said 4,310 for a site whose sitemap lists 357 pages.

### How do I find all subpages of a website?

Start from the section's address. A map that starts at `https://example.com/docs` lists only pages under `/docs`, and `site:example.com/docs` searches only that path.

### Why isn't every page in the sitemap?

The site's owner chose what to list. Sign-in pages, search results and old pages are often left out on purpose, and some sitemaps are simply out of date. Links and archives find the rest.

### How do I find hidden pages on a website?

Check the archives for old addresses and the robots.txt for paths the site asks crawlers to skip, then request what you find. A page that nothing lists, links to or archived can't be found from outside.

### Can I get all URLs from a sitemap only?

Yes. Open the sitemap in a browser, or map with `sitemap: "only"` (`--sitemap only` on the CLI) to list just its entries.

### Why does my list stop at 5,000 URLs?

That's the map's default `limit` and the hosted maximum. On your computer, raise `limit` up to 100,000.

Once you have the list, you can [scrape the list](/blog/scrape-list-of-urls/) to read every page, or feed it to a pipeline as in [web scraping for RAG](/blog/web-scraping-for-rag/).
