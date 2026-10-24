# Introduction to Octocrawl

Octocrawl is an open-source web scraping tool for AI agents and developers. Extract public web pages as Markdown or structured data, discover site URLs, and run crawling, batch and monitoring workflows locally.

Start with a page in your browser, connect an agent through MCP, or call the REST API from your application.

## Get started

- [Try a page](/): extract a public web page in your browser without installing anything.
- [Connect your agent](/docs/connect-mcp/): set up Octocrawl in Claude Code, Cursor, OpenCode or Codex.
- [Build with the API](/docs/reference/#rest-and-sdk): call REST or use the TypeScript SDK and Python client.

## Official project and connections

The official website is [octocrawl.dev](https://octocrawl.dev/). The official source repository is [github.com/77777R7/Octocrawl](https://github.com/77777R7/Octocrawl).

| Connection | Address or package | What it does |
| --- | --- | --- |
| Hosted REST API | `https://api.octocrawl.dev` | `POST /v1/scrape` for one page and `POST /v1/map` for site URLs; with an account, `POST /v1/crawl` and `POST /v1/batches` jobs. |
| Hosted MCP | `https://mcp.octocrawl.dev/mcp` | Connect your agent to hosted scrape and map. An account adds crawl and batch jobs; a key also enables the browser lane and Amazon.sg `scrape_product`, subject to limits. |
| TypeScript SDK | `@octocrawl/sdk` | Call an Octocrawl API with an explicit base URL. |
| Python client | `octocrawl-client` | Call an Octocrawl API with an explicit base URL. |
| Local API | `npx octocrawl serve` | Start the API on `http://127.0.0.1:8787`. |
| Local MCP package | `@octocrawl/mcp` | Connect an MCP client to the running local API. |

## Hosted or local?

Hosted Octocrawl supports single-page scraping and site URL mapping. Keyless requests use HTTP within a daily allowance. An account adds crawl and batch jobs (up to 500 pages a crawl and 1,000 URLs a batch), and a key enables the browser lane, subject to credits and service limits.

Run Octocrawl locally for larger crawls and batches, browser actions, saved login sessions and monitoring workflows. Browser actions require browser setup; scheduled monitoring requires local workers from a repository checkout. See [Connect MCP](/docs/connect-mcp/#run-it-on-your-computer) and the [Monitor guide](/docs/guides/monitor-webhook/).

Installing an SDK or connecting an MCP client does not expand the capabilities of the server it uses. The website preview is a single-page trial with its own limits. See [Limits and result states](/docs/limits/) for the differences.

Scrape results include an Evidence Record describing the capture. A successful capture means page content was read. Check any separate verification result before treating structured fields as verified.

## Try Octocrawl

Paste `https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview` into [the Octocrawl page](/) and select **Extract page**. The result shows readable Markdown, the final URL, a page status, and the time from submission until the result is visible. Choose **Format** to see its links, its page info, the fields you set in **Options**, or the whole result JSON instead, then copy or download the output without another extraction.

This is a recorded result from the preview, not a guaranteed response for every future visit:

```json
{
  "observedAt": "2026-10-08T18:23:02.090Z",
  "requestedUrl": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview",
  "status": "success",
  "finalUrl": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview",
  "title": "Overview of HTTP",
  "totalMs": 873,
  "excerpt": "# Overview of HTTP\n\n**HTTP** is a [protocol](https://developer.mozilla.org/en-US/docs/Glossary/Protocol) for fetching resources such as HTML documents."
}
```

`totalMs` above is the server-side measurement from that capture. The web page displays the longer client-visible time, including network and rendering. A successful page capture does not mean every optional structured field was found.

## When Octocrawl cannot read a page

Octocrawl reports a reason instead of inventing content. In another recorded preview, a LinkedIn feed URL was stopped by the site's automated-access policy:

```json
{
  "observedAt": "2026-09-24T08:52:48.374Z",
  "requestedUrl": "https://www.linkedin.com/feed/",
  "status": "blocked",
  "reason": "This site does not allow automated preview of this page.",
  "finalUrl": "https://www.linkedin.com/feed/",
  "totalMs": 572
}
```

The preview did not return readable feed content in this result. A separate X request in the same session **timed out**, so it is not used as an example of a site block. See [result states and limits](/docs/limits/) for the difference.

## Choose your next step

- [Extract structured data from a web page](/blog/extract-structured-data-from-web-page/), in the browser or over the API.
- [Connect MCP](/docs/connect-mcp/) to scrape, map, crawl and batch from your agent, or connect a local server for larger crawls, Monitors and logins.
- [Check Amazon.sg product JSON](/docs/guides/amazon-product/) when subject identity, region, and currency matter.
