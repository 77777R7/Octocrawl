# example.com has no heading to drop, 2026-10-13

This corrects a reading in [2026-10-13-mcp-clients.md](2026-10-13-mcp-clients.md). That record says the hosted scrape of `https://example.com/` "returned Markdown without the page's `<h1>Example Domain</h1>`" and that "main-content extraction left the heading out". The second part is wrong: the page has no heading.

## What was checked (2026-10-13, about 06:40Z)

- `curl https://example.com/` returned 577 bytes, the same proxied and direct. The response is served by Cloudflare with `last-modified: Fri, 09 Oct 2026 20:19:47 GMT`.
  - Its `<head>` has `<title>Example Domain</title>`.
  - Its `<body>` holds one paragraph, "This domain is for use in documentation examples without needing permission. This is not a service; avoid relying on it for testing and monitoring purposes.", and `<script src=/s.js>`.
  - There is no `<h1>` or other heading.
- `/s.js` inserts the same sentence in other languages after the first paragraph (Arabic, Chinese, French, Russian, …) as more `<p>` elements, and no heading.
- The hosted scrape returned exactly that paragraph as its Markdown, `status: success`, HTTP 200, on the http lane.

## Reading

- The page changed on or before 2026-10-09; the earlier page had an `<h1>Example Domain</h1>`. Octocrawl's Markdown holds all the body text the served HTML has. Codex's "no heading returned" was right. Nothing was dropped.
- `llms-install.md` told an assistant to expect "a heading 'Example Domain'" in that scrape. It now names the paragraph and the title instead, in the PR that adds this record.
- The repository's offline tests that mention "Example Domain" use their own data, and `packages/extract-tf/test/extract.test.ts` already has the new page as a fixture. No real-site case asserts the heading.
