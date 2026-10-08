# One link. Web data, ready.

Octocrawl turns a public web page into readable content and, on supported pages, fields you can check against the source. [Try a page now](/), then use these guides when you need a durable task or an MCP connection.

> **Availability:** Try the page preview at the URL where you are reading this. Octocrawl also runs on your own computer from the published packages (`npx octocrawl`) and connects to Claude Code, Cursor, OpenCode and Codex over MCP; see [Connect MCP](/docs/connect-mcp/). Hosted Octocrawl serves scrape and map at `https://api.octocrawl.dev` and `https://mcp.octocrawl.dev/mcp`, keyless within a daily allowance and with a key for more; crawl, batch and Monitor run on your computer for now.

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

- [Extract a public page](/docs/guides/extract-page/) for the browser workflow.
- [Connect MCP](/docs/connect-mcp/) to scrape, map, crawl and batch pages from Claude Code, Cursor, OpenCode or Codex.
- [Check Amazon.sg product JSON](/docs/guides/amazon-product/) when subject identity, region, and currency matter.
