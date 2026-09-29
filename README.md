# W2L — Web-to-LLM Context Extraction

A transparent, verifiable web extraction system built for RAG and Agent workflows.

## Why This Exists

Most crawlers report "success" when they return empty pages, challenge screens, or the wrong content. W2L makes failure visible and fixable:

**Before (typical crawler):**
```
✓ Fetched example.com/article
  Status: 200 OK
  Content: 953 bytes
```

**After (W2L):**
```
✗ Fetched example.com/article
  Status: blocked (cloudflare_challenge)
  Lane: http → escalated to browser_local
   Evidence: artifacts=[] (no screenshot or DOM snapshot was produced)
  Cost: 847 tokens, 2.3s, $0.0042
  Fix: needs user login or proxy (tier 1b/2)
```

## What's Different

1. **Failure is a first-class outcome** — `empty_verified`, `blocked`, `failed` with reasons, not silent empties; a page answered with an error status keeps its `httpStatus` and Markdown as evidence, never as success, and so does a page on which W2L finds no main content (`failed`/`empty_unverified` with the whole page's Markdown)
2. **Five false-success checks** — challenge text, wrong-page content, missing facts, truncation, yield-below-floor
3. **Execution ladder** — HTTP → browser → user auth → proxy, with automatic routing, per-attempt trace, and task-level cost accounting
4. **Ground-truth benchmark** — 30 adversarial fixtures (soft 404s, challenge pages, SPAs, timeouts, zip bombs) with verified false-success rates
5. **Honest evidence** — `artifacts: []` is an explicit empty artifact list, not a promise that every failed page has a screenshot or DOM snapshot; browser `bytesWire: null` means wire bytes were not measured
6. **One Evidence Record** — every scrape result, batch item and crawl page carries `evidenceRecord` (final URL, redirect chain, fetch time, status and reason, lane, robots.txt decision, raw and output hashes, field evidence), stated the same way in every lane and described by a versioned [JSON Schema](packages/contracts/schemas/evidence-record.v1.json); see the [reference](apps/public-web/content/reference.md#evidence-record)

## Quick Start

For the no-install, single-page web preview and its deployment requirements, see
[Public preview](docs/public-preview.md). The page is implemented in this branch;
it does not have a permanent public URL until the Cloud Run deployment and live
acceptance are complete.

The same local preview service now serves an English [documentation home](apps/public-web/content/introduction.md)
at `/docs/`, with Codex MCP connection steps, four task guides, and limits.
Run `npm run public:preview:local` and open `http://127.0.0.1:8798/docs/`.
These pages are generated from Markdown during the public web build; their
hosted status labels must be updated only after an actual public acceptance run.

Use Node.js 22.13+ or 24+ and npm (the PDF text engine, pdf.js, needs 22.13 or later). The SDK is currently a private workspace package; build it from this checkout. For the full Monitor → result → HTTPS event → restart workflow, follow [the onboarding guide](docs/onboarding.md) and [independent developer acceptance checklist](docs/independent-developer-acceptance.md).

```bash
git clone https://github.com/77777R7/w2l.git
cd w2l
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run scrape -- https://example.com
npm run crawl -- https://example.com --max-pages 20
```

For local MCP use, one background service runs the API, Monitor scheduler,
delivery worker and MCP endpoint. On macOS, install it as a LaunchAgent and
connect Codex to its loopback URL:

```bash
npm run local:mcp:install
codex mcp add w2l-local --url http://127.0.0.1:8791/mcp
npm run local:mcp:status
```

It restarts after a process crash and at login. No Render or WorkOS account is
needed for this local path. `npm run local:mcp:uninstall` removes the agent;
`codex mcp remove w2l-local` removes the client entry. On other systems, run
`npm run local:mcp` in one terminal. The state stays in `.w2l/api` by default.
See the [MCP first-use walkthrough](docs/mcp-first-use.md) for the actual
Monitor and HTTPS delivery flow and secret setup. Keep this checkout while
the LaunchAgent points to it.

To receive signed events on the same Mac with a fixed HTTPS loopback URL,
run `npm run local:receiver:install`, then reinstall the MCP service with
`W2L_LOCAL_DELIVERY_LOOPBACK=1 npm run local:mcp:install`. The option only
permits loopback delivery and pins trust to the generated local certificate.
The receiver and its SQLite inbox run as a separate LaunchAgent; neither
service becomes reachable from another machine.

The legacy standalone REST API remains available for SDK and Firecrawl-shim
clients:

```bash
npm run api
```

To connect a standalone stdio MCP process to that API, run:

```bash
npm run mcp
```

`npm run api` binds `127.0.0.1` and allows loopback/RFC1918 so fixture servers work. Hosted mode is explicit: `npm run api -- --hosted --token $W2L_API_TOKEN`. That binds `0.0.0.0`, requires `Authorization: Bearer`, denies private/metadata IPs, and limits a crawl to 100 pages: an omitted or `null` `maxPages` takes 100, and a larger one is refused with `invalid_request`.

A server started with tokens, hosted or local, accepts any one of them: repeat `--token`, or set `W2L_API_TOKEN` and the comma-separated `W2L_API_TOKENS`. Tokens on the command line replace those in the environment. A `--token` without a value (the last argument, followed by another flag, or blank) stops the server at startup, and the error never repeats a token. Give each client its own token; restarting the server without a token revokes it. Tokens are compared as fixed-length SHA-256 digests in constant time, and a missing or unknown token gets HTTP 401 with `{ "error": "unauthorized", "code": "unauthorized" }`. The SDK sends its `token` option, or `W2L_API_TOKEN` from the environment when none is passed; `token: ''` sends none.

Behind a proxy, local mode (`npm run api`, the local MCP service, `npm run scrape`/`crawl`) sends its outbound requests, including robots.txt and the local browser, through `HTTPS_PROXY` for https: URLs and `HTTP_PROXY` for http: URLs (lower-case names too), with curl's rules: `NO_PROXY` hosts and their subdomains, `host:port`, IP and CIDR entries go direct, `*` disables the proxy, and loopback is always direct. The proxy must be `http://` or `https://`, and both variables must name the same one. The proxy resolves the names it fetches, so for proxied requests W2L trusts it for resolution and checks only the URL itself (scheme, credentials, IP literals, metadata names); direct requests are still resolved, validated and pinned. Results name the proxy's `host:port` in `evidence.envProxy` and an `egress_proxy` trace event, never its credentials. `W2L_PROXY=off` ignores the variables; hosted mode never uses them. Without the environment proxy, the local browser connects directly like the HTTP lane: it never falls back to the operating system's proxy settings, a route no result would record. The macOS LaunchAgent does not inherit your shell, so put these variables in `.w2l/local-mcp.env`.

robots.txt is obeyed in every mode, local and hosted. A 4xx robots.txt means no restrictions. A robots.txt that cannot be fetched (a 5xx, a network error, or no answer within 5 seconds) is a complete disallow, as RFC 9309 §2.3.1.4 requires: the page is not fetched, the result is `failed` with `policy_denied`, and the `robots_checked` and `robots_disallowed` trace events and the compliance record's robots decision (browser and provider lanes) carry `unreachable: "server_error"`, `"network_error"` or `"timeout"`, so it never reads like a rule the publisher wrote. W2L asks for that robots.txt again after five minutes (`robotsUnreachableTtlMs` in the network policy). On a direct connection a name that does not resolve is still `dns_error`; through the environment proxy, which resolves names itself, its robots.txt request fails first, so the page is `policy_denied` with `unreachable: "network_error"`.

Research mode (`mode: "research"`, `--research`) declares W2L as a bot in its User-Agent. Set `W2L_CONTACT` to say who runs it, as a name and email address or a URL, for example `W2L_CONTACT="Jane Doe jane@example.org"`: printable ASCII, at most 200 characters, no parentheses or backslashes. The research User-Agent then ends `; contact: Jane Doe jane@example.org)`. To sec.gov and its subdomains it takes the format SEC's fair-access policy prescribes, `<Company or name> <email>`, instead: `W2L Research Jane Doe jane@example.org` (so give an email address). Their robots.txt is requested with it too, a robots.txt group for `w2l-research` still applies there, and the Evidence Record's `identity.contact` reads the contact from either format. Results keep the User-Agent that was sent (the `identity_sent` trace event on the HTTP lane, the compliance record's `sentHeaders` in the browser lane). Standard mode sends a browser User-Agent and declares no contact. SEC.gov answers 403 to automated clients that declare no contact; on the HTTP lane such a 403 from an SEC host carries a `declared_contact_hint` trace event saying to use `mode: "research"` with `W2L_CONTACT` set. `npm run api`, the local MCP service (in `.w2l/local-mcp.env`) and `npm run scrape`/`crawl` read the variable.

The unified local MCP covers scrape, Crawl, persistent URL-array batches, and
Monitor/Delivery without separate worker terminals. A unified service also
implements authenticated Streamable HTTP for the reviewed public-document
Monitor and anonymous Amazon.sg product JSON/batch flows; its permanent Render
URL and final hosted acceptance are pending. For both flows on one Mac, run
`npm run first-use:local` after `npm ci`; see the
[two-flow first-use guide](docs/dual-flow-first-use.md),
[MCP first-use walkthrough](docs/mcp-first-use.md) and
[C2/C3 status](docs/roadmap/section-c-delivery.md). Advanced clients may
still launch the legacy stdio adapter from this repository:

```json
{
  "mcpServers": {
    "w2l": {
      "command": "npm",
      "args": ["run", "mcp"],
      "env": { "W2L_API_URL": "http://127.0.0.1:8787" }
    }
  }
}
```

MCP `scrape` is compact by default: it returns the selected content, document/product metadata, aggregate usage and errors without repeating the body under `summary.attempts`, with the response's status and `content-type` header in `snapshot` (`httpStatus`, `contentType`) and the final URL and every redirect hop in `evidenceRecord`. Pass `debug: true` when you need the full route, trace and per-attempt audit. REST and SDK calls that omit `formats` and `debug` keep the legacy full Markdown response.

For many known URLs, use `batch_scrape` in MCP, then `get_batch`, `get_batch_items`, or `wait_batch`. REST and SDK support the same durable task and paginated items. REST also streams progress and a terminal `complete` event (`GET /v1/batches/:id/events`, server-sent events); the SDK has no event stream and waits by polling (`waitBatch`, `batchAndWait`). See [batch scraping](docs/batch-scrape.md). The per-origin concurrency ceiling is configurable up to four, with a shared Retry-After cooldown and minimum request interval. The controlled [1/2/4 comparison](docs/evidence/same-origin-concurrency-controlled.json) is local fixture evidence, not an Amazon speed claim.

A crawl (`POST /v1/crawl`, MCP `crawl`) takes the same `formats` and `includeLinks` as scrape, plus `includePaths` / `excludePaths`: regular expressions matched against the URL path of each discovered link. The start URL is always fetched and an `excludePaths` match wins. A pattern that can backtrack catastrophically on a crafted link path, such as `^/(a+)+$` or `.*a.*b`, is refused with `invalid_request`: a repeated group with a repeated part and no separator, a repeated choice whose alternatives can start alike, or three or more overlapping repeated parts in a row. The rest run on V8's linear-time regular expression engine where it can run them; one with a lookaround, a backreference or a counted repetition above 16 (such as `{3,40}`) runs on the backtracking engine, only on paths of up to 2,048 characters and with a 100 ms limit per link. A link a filter cannot decide is not followed, and a filter that ran out of time decides no later link either. Scrape, batch and crawl reject an unknown field or an unsupported format with HTTP 400 naming it.

A crawl follows links on the start URL's host, that host's `www.` twin (`example.com` and `www.example.com`) and the host the start URL redirects to; a non-empty `allowlistedDomains` replaces that rule with its own list. It does not follow links whose path ends in an image, font, stylesheet, script, audio, video or program extension (`.png`, `.woff2`, `.css`, `.js`, `.mp4`, `.exe` and the like); documents and data files such as PDF, CSV, XLSX, JSON, XML and ZIP are followed.

A crawl task stores every option it was started with. A crawl paused by a shutdown or left running by a crash resumes when the API starts again, `POST /v1/crawl/:id/resume` (SDK `resumeCrawl`, MCP `resume_crawl`) restarts a paused or failed one, and `w2l crawl --resume <task-dir>` continues a CLI crawl; all three run with the stored options, and the CLI refuses a flag that names a different value. A resume refetches the pages the crawl already has, or reuses them when the crawl was started with `useCached: true`. `maxPages` counts the task's distinct pages across resumes, so a resumed crawl never exceeds it. `GET /v1/crawl/:id` counts pages while the crawl runs; `/v1/crawl/:id/pages` items carry the routing audit and trace only with `debug=true`, like batch items. Between two page starts on a host the crawl waits that host's robots.txt `Crawl-delay` or the minimum interval (`W2L_PER_HOST_MIN_DELAY_MS`), whichever is longer, and until a page on a host has reported its robots.txt the crawl starts one page at a time there. Each fetched page records the wait in a `crawl_delay` trace event: `startedAt`, `previousStartedAt`, `observedDelayMs`, `requiredDelayMs` and `robotsCrawlDelayMs`.

To wait for a crawl or a batch from the SDK, `waitCrawl(taskId)` and `waitBatch(taskId)` poll it until it is completed, failed or cancelled (a paused task is still waited on) and return its status; `crawlAndWait(url, options, wait)` and `batchAndWait(urls, options, wait)` start the task, wait, and also return every page and error of the crawl, or every item of the batch. The wait options are `pollIntervalMs` (default 500), `timeoutMs` (no limit by default), `maxRetries` (default 5) and `signal`. When `timeoutMs` runs out, a status request still in flight included, the wait throws `WaitTimeoutError` with `taskId`, `timeoutMs` and `last`, the last status read (null when none answered in time), and the task keeps running. A status request that fails with a network error, HTTP 408, 429 or 5xx is retried after 1, 2, 4, 8, then 10 s, or after its `Retry-After` when that asks for 60 s or less; the wait throws any other error at once, and a transient one once `maxRetries` retries in a row have failed.

Scrape, batch and crawl also take four page options; batch and crawl apply them to every page:

- `onlyMainContent` (default `true`). `false` returns the Markdown of the whole page: the document body with scripts, styles, form controls and embedded media left out, and the header, navigation and footer kept, through the same converter and base URL. The evidence (hashes, status) is the same in both modes, lane routing still reads the main content, and the `extract` trace event records `onlyMainContent: false`. One exception: on a page where the extractor finds no main block, the default is `failed`/`empty_unverified` with the whole page's Markdown kept as evidence, while `false` returns that Markdown as `success`; either way the browser rung is still tried and answers when it renders more. `links` always come from the whole page.
- `waitFor` (milliseconds, an integer from 0 to 60 000, default 0). The browser rung waits this long after the page has loaded and settled, then captures it; a document the page moved on to meanwhile (a script, a meta refresh) settles before the capture, and the result reports that document's URL and status. The HTTP rung cannot run scripts, so a request with `waitFor` starts at the browser rung, and the ladder audit records the skipped rung (`ladder_channel_skipped`). Where no browser rung is configured, the result is `failed` with `policy_denied` and a `wait_for_unavailable` trace event, never an answer that ignored the wait.
- `timeout` (milliseconds, an integer from 1 000 to 300 000, default 300 000). The deadline for the whole scrape, `waitFor` included. When it fires, the API still answers HTTP 200: `partial` with the best content a rung produced so far (for example the HTTP content while the browser rung was still loading), or `failed` with `failureReason: "timeout"` when nothing usable exists. Both carry `usage.deadlineExceeded: true` and a `deadline_exceeded` trace event. When a `waitFor` would run past the deadline, the browser stops waiting about one second before it and captures the page as it is then: `partial` when that page has content, otherwise `failed`/`timeout`. The lanes' waits for a slow server follow the `timeout` you set: the HTTP lane waits for the response headers and for each chunk of the body, and the browser waits for navigation, until the deadline. Without a `timeout` they keep their defaults inside the 300 000 ms deadline: 10 s for headers, 30 s between body chunks and 20 s for navigation. A lane that stops at one of these fails with `timeout`, without `usage.deadlineExceeded`, and the ladder does not move on to the next rung for it: the answer is the content an earlier rung produced, or that `failed`/`timeout`. The browser lane's `navigate` trace event records the wait it allowed (`timeoutMs`). A client that disconnects still cancels the scrape. An MCP client that cancels its `scrape` call (`notifications/cancelled`), or closes the call's HTTP request before the result, cancels it too, over stdio and over the local and hosted HTTP services; over HTTP only the same client can cancel a call (the same session id, and on the hosted service the same bearer token), see [cancelling an MCP call](docs/mcp-first-use.md#cancelling-a-call). The SDK's `scrape` waits for the answer until `timeout` plus 30 s; on Node that replaces fetch's own 300 s wait for the response headers, which an answer at a 300 000 ms deadline can outlast. JSON extraction reads fields from a `partial` page but reports it `incomplete` with a `page_partial` issue, and never calls the model for it.
- `maxFileBytes` (bytes, an integer from 1 up to the server's `W2L_MAX_FILE_BYTES`). A lower size cap for a file (PDF, CSV, XLSX, ZIP, JSON, text) than the server's; see [Files](#files-pdf-csv-xlsx-zip-json).

Markdown leaves out `data:` URIs, as Firecrawl's `removeBase64Images` does by default for images: an image keeps its alt text and a link its text. Table cells and captions keep their links and images with absolute targets, as a paragraph does, on one line (a `|` in a cell, target included, is written `\|`); emphasis and code in a cell are plain text. A table whose nested tables hold at least half of its text, or that has a single row, lays out the page rather than holding data: its cells become paragraphs, and only the data tables inside it become GFM tables. A data table with a small table in one cell stays one GFM table, with the small table as that cell's text. A page W2L extracts by its tables (`document.strategy: "table"`, for pages whose tables hold at least half of their text) keeps as main content the lowest element that holds all its data tables, so the headings, captions and text between them stay and what lies outside that element, usually the page's own header, footer and side column, does not; a menu laid out as a table (mostly links, and no figures outside them) counts only when it is the page's largest table, and a lone `<h1>` that shares a container with the tables below `<body>` is kept with them. When the HTTP rung finds no main content and the browser rung then fails without a page, the answer is the HTTP rung's `failed`/`empty_unverified` result with its page (the ladder audit records `ladder_evidence_kept`); when the deadline ends the browser rung instead, it is `failed`/`timeout` with that page, and the `deadline_exceeded` trace event names the rung it came from (`evidence`).

A result whose page was extracted carries `metadata`, what the page's HTML says about itself, in scrape responses (full, compact and MCP), batch items and crawl pages: `title` (its `<title>`), `description` (`<meta name="description">`), `language` (`<html lang>`, or `<meta http-equiv="content-language">` when `<html>` has no `lang`), `keywords` and `robots` (those `<meta>` values as written), `favicon` (the first `<link rel="icon">`, as an absolute http(s) URL resolved against the document base) and `canonicalUrl` (`<link rel="canonical">`, likewise). A value the page does not declare is `null`; W2L does not substitute `og:description`, a heading or `/favicon.ico`. A failed or blocked result has no `metadata`. `metadata.title` is the page's `<title>`, often with the site name added; `document.title` is unchanged: the content's title, usually the first heading of the main content, with `<title>` only as its fallback. `/fc` puts `title`, `description`, `language`, `keywords`, `robots` and `favicon` in `data.metadata` when the page declares them.

Request deterministic structured data with a JSON Schema alongside, or instead of, Markdown:

```ts
const product = await w2l.scrape('https://www.amazon.com/dp/B08KT2Z93D', {
  debug: false,
  formats: [{
    type: 'json',
    schema: {
      type: 'object',
      properties: {
        asin: { type: 'string' },
        title: { type: 'string' },
        price: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        seller: { type: ['string', 'null'] }
      },
      required: ['asin', 'title', 'price', 'currency', 'seller'],
      additionalProperties: false
    }
  }]
})
```

W2L maps supported product fields directly from subject-bound HTML, JSON-LD, metadata and DOM evidence. A top-level key that no such fact covers is matched to the page's own labels, two-cell `th`/`td` table rows and `dt`/`dd` pairs in the main content, compared without case, spaces or punctuation (`Number of reviews` fills `numberOfReviews`; `Price (excl. tax)` fills `price` when no label is exactly `Price`). `title` (or `pageTitle`) takes the content title, `url` (or `finalUrl`) and `requestUrl` the fetch's final and requested URL, and `pageType` the page type W2L classified. A number is read only from text that is one amount, such as `£51.77` or `1.299,00 €`, never from text like `HL-1`, `4.7 out of 5` or a URL (see below); labels that state different values leave the field out with a `field_ambiguous` issue. A missing nullable field is `null` with a `field_unavailable` issue; a missing required field is left out with a `missing_required` issue and the result is `incomplete`. Every value has an `evidence` entry (the same map is `evidenceRecord.fieldEvidence`): the label's table or list, row and label; `dom` with `h1[0]` (the main content's first heading) or `title` (the page's `<title>`) for the title; `fetch` with `finalUrl` or `requestedUrl` for a URL; `inferred` with `document.pageType` for the page type, and with `document.product.images` (`prices`, `variants`, `specifications`) for a list or map the product extractor reported empty, since nothing on the page locates an absence; `model` for a value the model fallback wrote. `json.evidence` also quotes the text each number was read from (`text`, whitespace collapsed); the Evidence Record keeps `source` and `locator`.

Numbers are read as the page writes them. An amount is an optional sign, a currency symbol or code before or after the number (`€`, `EUR`, `US$`, `kr`, `円`, or a symbol before and a code after, as in `$12.99 USD`) and one number: its decimal separator is `.` or `,`, its thousands are grouped by `.`, `,`, a space (no-break and narrow no-break spaces too) or an apostrophe in groups of three, or in India's lakh groups, and `,-` or `.–` after it ends a whole amount. So `12,99 €` is 12.99; `1.299,00 €`, `1 299,00 €`, `CHF 1'299.–` and `$1,299.00` are 1299; `₹1,29,999` is 129999. A single `.` or `,` before exactly three digits (`1.299 €`, `$1,299`) is 1299 in one notation and 1.299 in the other, so it is read only when the value settles it: a review count is whole, so is an amount in a currency without minor units (`JPY`, `KRW`, `ISK`, `VND`, `CLP`, `₩`, `円`, in the text or as the page's `priceCurrency`), and a JSON-LD or `product:price:amount` price writes `.` as its decimal point. W2L does not guess from the page's language, currency or domain: an English page of a German shop can write `1.299 €`, Irish shops write `€1,299`, and a German page can quote `$1,299`. Such a number, and a product price that is not a number at all (`Call for price`), is left out, or `null` when the field is nullable, with a `field_unavailable` issue quoting the text and where it is (a required one also gets `missing_required`); asked for as a string, the field is the text. An amount in the Amazon adapter's `prices` list that cannot be read stays its text, with a `field_unavailable` issue at `/prices/<i>/amount`.

The schema may use the JSON Schema subset W2L can honour, which covers what Pydantic's `model_json_schema()` and `zod-to-json-schema` usually write:

- **Structure:** `type` (one or a list), `properties`, `required`, `items` (one schema), `additionalProperties`, `enum`, `const`, local `$ref` (`#`, `#/$defs/…`, `#/definitions/…` or another pointer into the schema) with `$defs` or `definitions`, and `anyOf` / `oneOf` of a schema and `{ "type": "null" }` (Pydantic's `Optional`) or of primitive types only.
- **Checked on the result, never used to fill a value in:** `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `uniqueItems`, and `enum` / `const`. A page value that breaks one stays in `data` and the result is `incomplete` with a `field_unavailable` issue quoting the check (the model fallback, when on, may replace it). A `pattern` has at most 2,000 characters, and one that can backtrack catastrophically, such as `^(a+)+$`, is refused with `invalid_request`. The rest run on V8's linear-time engine, except a pattern with a lookaround, a backreference, a counted repetition above 16 (such as `[0-9a-f]{32}`), a `\p{…}` or `\u{…}` escape or a character outside the Basic Multilingual Plane, and any text holding such a character (an emoji): those are matched only against text of up to 2,048 UTF-16 code units and within 100 ms, and text they cannot decide counts as breaking the pattern.
- **Accepted and not acted on:** `title`, `description`, `$comment`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `format` (not checked), `default` (never filled in: a field the page does not give stays missing), and at the root only `$schema` (draft-07, 2019-09 or 2020-12) and `$id`.
- **Bounds:** 64 KiB, 8 levels of nesting and 100 properties.

Anything else is refused with HTTP 400 `unsupported_parameter`, whose `details.parameters` names the keyword where it was sent (for example `formats[0].schema.properties.author.allOf`): `allOf`, `not`, `if`, `patternProperties`, `prefixItems`, OpenAPI's `nullable`, a union of objects, arrays or references, a keyword other than an annotation beside `$ref`, `$schema` or `$id` below the root. A malformed value, such as an invalid `pattern` or a `$ref` that does not resolve, is `invalid_request`. A `json` format needs a schema: `{ "type": "json", "prompt": "…" }` alone is refused with `invalid_request`, because W2L does not extract JSON without one (that would need a model for every page); `prompt` only instructs the model fallback.

Model fallback is opt-in with `modelFallback: true` and runs only when a required field is missing or a value breaks the schema; configure an OpenAI-compatible endpoint through `W2L_EXTRACT_BASE_URL`, `W2L_EXTRACT_MODEL` and optional `W2L_EXTRACT_API_KEY`. Without those variables, page content is never sent to a model and the JSON result reports `model_unavailable`. The model receives the main-content Markdown and the values already read. It fills only what is missing, or replaces a page value that breaks the schema; every value read from the page keeps its value and evidence whatever the model answers, and every value the model wrote has `model` evidence. The request uses strict structured outputs (`json_schema` with `strict: true`) with a strict-safe copy of the schema: every object closed, every property required and the optional ones nullable, assertions and annotations left out. The answer is still checked against your schema, with one repair round, and a `null` your schema does not allow is dropped as "not found". A schema strict mode cannot express, such as an object without `properties`, is sent as given without strict mode; `json.modelUsage.strict` says which was used and `strictReason` why not.

Run the fixed 10-product, three-round Amazon MCP baseline with:

```bash
node scripts/section-b/amazon-public-state.mjs
npm run baseline:amazon -- --concurrency 1
npm run baseline:amazon -- --concurrency 2
# After 1 and 2 are comparable and unblocked:
npm run baseline:amazon -- --concurrency 4
```

The setup uses an anonymous Singapore public delivery preference for this benchmark only. Round 1 pins the observed context; later unobserved or mismatched region/currency records remain in the report and do not count as comparable. Reports and raw HTML stay under ignored `.w2l/amazon-baseline/`; the URL manifest and schema are versioned. The [signed ten-product result](docs/evidence/amazon-adapter-integration-2026-09-23.md) passed at limited concurrency, but Amazon remains beta pending the 100/1000 promotion gates. The [older baseline](research/amazon-product-baseline-2026-09-22.md) is historical.
The concurrency-1 command can exit nonzero because its ten-page median exceeds 20 seconds; inspect its report for comparability and blocking before continuing to 2. The signed run had 37.93 seconds at 1, 19.92 at 2, and 12.39 at 4.
This signed Amazon slice was merged into `main` by [PR #52](https://github.com/77777R7/w2l/pull/52), after the `v0.4.0-rc.1` source prerelease, so that prerelease does not contain it.

Firecrawl v1 clients (partial compatibility): set the base URL to `http://127.0.0.1:8787/fc` so `/v1/scrape` and `/v1/crawl` hit the shim. The scrape shim maps `url`, the `markdown` and `links` formats, `onlyMainContent`, `waitFor` and `timeout`; the crawl shim maps `url`, `limit`, `maxDepth`, `includePaths`, `excludePaths` and the same four `scrapeOptions` (`formats`, `onlyMainContent`, `waitFor`, `timeout`). `removeBase64Images: true` is accepted, since W2L always drops `data:` images. Any other parameter or format is rejected with HTTP 400 and `success: false`, naming it. Snapshot 2026-09-18; known diffs in [docs/firecrawl-shim.md](docs/firecrawl-shim.md). Firecrawl Search / Interact / Agent / Monitor compatibility is not implemented. W2L's native Monitor and Delivery APIs use their own contracts.

## Continuous Monitors and event delivery

The native SDK includes Crawl pagination/cancellation, Monitor creation/revisions/runs/control, and Delivery destinations/status/retry. [The runnable example](examples/monitor-workflow.ts) uses a controlled price source, explicit `captureMode`, validated baselines, conditional HTTP requests, and persisted events. [The webhook receiver](examples/webhook-receiver.ts) stores event receipts and applies a versioned product projection transactionally.

The API, Monitor scheduler and delivery worker share a persistent control database.
`npm run local:mcp:install` manages all three for local MCP users. For a
standalone API deployment, run the workers in separate terminals with the
same `W2L_TASK_ROOT` as the API:

```bash
export W2L_TASK_ROOT="$PWD/.w2l/api"
npm run monitors:worker
```

The Monitor worker defaults to public-source network policy. For the controlled local source in the onboarding example, explicitly set `W2L_MONITOR_NETWORK_MODE=local` in that worker terminal. A locally running worker does not inherit broader network access from the API or database.

```bash
export W2L_TASK_ROOT="$PWD/.w2l/api"
npm run delivery:worker
```

See [onboarding](docs/onboarding.md) for the HTTPS receiver, authentication, worker configuration, and pending-delivery restart exercise. Gate 2–4 source freeze `99894bd636ecafd254a7c7bc79d26e9a97fa9199` is on `main` through [PR #50](https://github.com/77777R7/w2l/pull/50) and is published as source prerelease [`v0.4.0-rc.1`](https://github.com/77777R7/w2l/releases/tag/v0.4.0-rc.1). Clone `main` or check out that tag. Workspace packages remain private and independent human installation remains pending.

The [Gate 2–4 acceptance record](docs/roadmap/gate-2-4-acceptance.md) links the process-crash, concurrent-claim, public HTTPS and agent clean-install evidence. Gate 2/3 engineering acceptance passed; Gate 4 awaits a non-author human, and Gate 5 external two-week/repeat-use validation has not started. `npm run package:handoff` captures review source with per-file hashes. The existing tested archive is a preserved pre-commit snapshot, not a package of subsequent roadmap edits.

C2 Monitor/Delivery MCP and its local HTTPS first-use workflow are implemented. C3 has a unified process and authenticated Streamable HTTP implementation; Render hosting, WorkOS browser login, real-client connection, and a hosted restart drill remain unverified. B1/B2 and C1 remain in_progress for their broader operational/adoption gates. See the [first-use walkthrough](docs/mcp-first-use.md) and [dated local evidence](docs/evidence/c2-c3-mcp-local-2026-09-23.md).

## Files: PDF, CSV, XLSX, ZIP, JSON

Scrape, batch items, crawl pages, MCP and `/fc` take a URL that answers with a file the same way as a web page. A 2xx response is a file when its `Content-Type` says PDF, CSV (including `+csv` types such as Eurostat's SDMX-CSV), JSON (and `+json`), plain text, XLSX, XLS or ZIP; when it says nothing useful (`application/octet-stream` and its kin, or none), the bytes decide: a `%PDF-` header in the first 1024 bytes, a ZIP header (an XLSX when the file is named `.xlsx`), an OLE header named `.xls`, or text named `.csv`, `.json` or `.txt`. A PDF header at the start overrides `text/html` or `text/plain`, and an HTML document sent as `text/plain` is still a page. The name is the `Content-Disposition` filename, else the URL path.

- **Saved as received, never sent to the browser.** The HTTP lane saves every byte to `<W2L_TASK_ROOT>/files/<sha256>.<ext>` (`.w2l/api/files/` by default; `npm run scrape` uses the same place, `npm run crawl` its task directory's `files/`), so the same bytes are stored once however many URLs serve them. A file never escalates to the browser, whatever its outcome. The result's `file` block gives the kind, how it was detected, the `Content-Type` as received, the declared and received size, the SHA-256, the path, and for a PDF its pages; `evidence.rawBodySha256` and the Evidence Record's `rawSha256` are the SHA-256 of the bytes. A request refused before anything is fetched (robots.txt, policy, DNS) saves nothing, and so does a non-2xx answer.
- **The browser lane catches the download.** When the browser is the first rung (`waitFor`) or otherwise reaches a file, it takes the file from the download the navigation starts, or from the response it displays (JSON, text), instead of failing with `Download is starting`, and saves the same bytes the same way.
- **Size cap.** `W2L_MAX_FILE_BYTES` sets the largest file in bytes (default 52 428 800, 50 MiB; at most 524 288 000, 500 MiB; anything else stops the service at start). A request, batch or crawl can lower it with `maxFileBytes`, never raise it (a larger value is HTTP 400 `invalid_request`). A file over the cap is `failed` with `body_too_large`, with its declared size in `file.declaredBytes` when the server sent one; it is not read further and nothing is saved or truncated. Web pages keep the 10 MiB body cap.
- **Other binary types** (images, audio, video, fonts, Word and PowerPoint documents, other archives) are `failed` with `unsupported_content_type`: not downloaded, not saved, not sent to the browser.
- A body that stalls or breaks off after the headers is `failed` with `timeout` or `connection_error`, with nothing saved (it was an internal error before).

What each kind returns:

| Kind | `markdown` | Status |
| --- | --- | --- |
| PDF | The text layer, a `<!-- page N -->` line before each page (below) | `success` with text; `partial` when the page cap (1000), the time budget (60 s, or less when the scrape's `timeout` is nearer) or an unreadable page stopped it short; `failed`/`empty_unverified` when no page has a text layer (a scan: no OCR); `failed`/`parse_error` when it cannot be opened (no PDF header, encrypted, malformed); `failed`/`timeout` when it did not open in time |
| CSV, JSON, text | The text as received, decoded by its byte-order mark, its declared charset or UTF-8 (the mark dropped) | `success`; without text and with a `text_not_decoded` warning when the bytes are not valid in that encoding |
| XLSX, XLS, ZIP | `null` | `success`; the file is the deliverable. Tables → CSV and XLSX parsing come later |
| Any, with no bytes | `null` | `empty_verified` |

`onlyMainContent` does not apply to files, and `waitFor` is not waited for once the file arrives. A file result has no `document` or `metadata` and no `links`. The Evidence Record lists the file in `artifacts` as `{ kind: "file", path, sha256, bytes, contentType }` and names the extractor `pdf-text` (`PDF_TEXT_VERSION`) for a PDF or `file-text` (`FILE_TEXT_VERSION`) for another file; `outputSha256.markdown` covers the Markdown delivered.

JSON extraction reads a PDF deterministically: a schema key is matched, as on a web page, to the labels of the PDF's `Label: value` lines (for example `KPI 2: Reduction of carbon intensity` fills `kpi2`), and `fieldEvidence` gives each such field `{ source: "pdf", locator: "page N \"label\"" }`. Labels that state different values leave the field out with `field_ambiguous`; prose and table cells are not read, the PDF's metadata is not used, and `modelFallback` is not applied to PDF text (a `model_unavailable` issue says so), so a field not found is reported missing, never guessed. PDF text runs on the API process's thread: the 304-page IEA report takes under a second.

## PDF text

`pdfToMarkdown(bytes, options?)` in `packages/extract-tf` turns the bytes of a PDF into Markdown with page numbers, so a figure quoted from a report can be traced to its page. Scrape, batch, crawl, MCP and `/fc` use it for every PDF they fetch (see [Files](#files-pdf-csv-xlsx-zip-json)).

What it does:

- Reads the PDF's own text layer with Mozilla pdf.js (`pdfjs-dist` 6.3.289, Apache-2.0), in Node, without rendering.
- Starts each page with a line `<!-- page N -->`, N being the page's position in the file, and returns `pages[]`: each page's `text`, its printed `label` when the PDF declares one, and the `start` / `end` offsets of that text in the Markdown. `pdfPagesForSpan(pages, start, end)` names the pages any span of the Markdown came from.
- Rebuilds lines, spaces and paragraphs from text positions, reads multi-column pages column by column and keeps table rows as lines. A word hyphenated at a line end is joined; the hyphen is removed only where the document spells the word without it elsewhere.
- Reports `info` as the PDF declares it (title, author, producer, dates, language), null where it declares nothing.

What it does not do:

- No OCR: a page without a text layer (a scan) comes back empty with a `no_text_layer` warning.
- No table reconstruction: cells become lines of text, and every result with text carries `tables_unverified`.
- Running headers and footers stay in the text unless `repeatedLines: 'remove'`, which lists the removed lines per page.
- `maxPages` (default 1000) and `timeBudgetMs` (default 60 000, checked before each page) stop with a `page_cap` or `time_budget` warning and the pages read so far. Encrypted, malformed and non-PDF input returns `{ ok: false, error: { code, message } }` instead of throwing.

It is checked on 10 public reports, six of them the seed user's PDFs: [manifest](research/pdf-corpus/manifest.v1.json), `node research/pdf-corpus/run.mjs`, runs in [research/pdf-corpus/runs/](research/pdf-corpus/runs/).

## Benchmark

Run the full fixture suite against the bare HTTP baseline:

```bash
npm run bench
```

Expected output:
```
Subject: bare-http
  Cases: 30
  Status matches: 17/30
  Contentful: 20
  False successes: 12
  False success rate: 60.0%
```

The bare HTTP baseline intentionally has a high false-success rate (no content extraction, no challenge detection, no redirect handling). A production subject should beat these numbers.

## Repository Structure

```
packages/
  contracts/       TypeScript types and ground-truth schema
  fixtures/        HTTP server with 30 ground-truth test cases
  http-core/       robots.txt parser (ReDoS-resistant)
  runtime/         TaskStore, frontier, bounded crawl orchestrator
  bench/           Benchmark runner, scrape/crawl CLI, scoring
  api/             REST server (AGPL)
  sdk/             TypeScript client (MIT)
  mcp/             stdio and restricted Streamable HTTP MCP server (MIT)

examples/monitor-workflow.ts       Runnable Monitor + Delivery SDK workflow
examples/webhook-receiver.ts       Durable idempotent sample receiver

ROADMAP.md                         Current phase plan

docs/
  onboarding.md                  Install, Crawl, Monitor, HTTPS events and recovery
  mcp-first-use.md               Conversational Monitor/Delivery and hosted pilot setup
  independent-developer-acceptance.md  Pending human Gate 4 run sheet
  roadmap/section-a-foundation.md  Section A phases and A4 gate
  roadmap/section-b-continuous-data.md  Section B future direction
  roadmap/section-c-delivery.md    Section C future delivery direction
  PHASE1_ENGINEERING_NOTES.md    Decision log
  PRODUCT_PLAN_V2.md              Product roadmap
  firecrawl-shim.md               Firecrawl v1 scrape/crawl snapshot + diffs
  benchmark-gate.md               Phase 3 comparator versions, evidence contract, and blockers
```

## Roadmap

- [x] Contracts and ground-truth schema
- [x] Fixture server with 30 adversarial cases
- [x] robots.txt ReDoS fix (token-based glob matcher)
- [x] Benchmark pipeline with bare HTTP baseline
- [x] extract-tf + HTML→Markdown after extract
- [x] Browser lane (Playwright) and HTTP → browser → vendor ladder
- [x] Honest identity bundle (UA / hints / locale / viewport must agree)
- [x] `w2l scrape` product CLI (`w2l-fetch` is an alias)
- [x] `w2l crawl` + SQLite checkpoint resume
- [x] REST API + TypeScript SDK (`POST /v1/scrape`, `POST /v1/crawl`, `GET /v1/crawl/:id`, paginated crawl pages/errors, cancel)
- [x] MCP server (`scrape`, `crawl`, `get_crawl`, paginated pages/errors, and cancel over REST)
- [x] Compact MCP scrape responses, direct structured JSON/JSON Schema extraction, and Amazon subject adapter/baseline
- [x] Firecrawl `/scrape` `/crawl` migration shim (snapshot 2026-09-18; not a compatibility layer)
- [x] Task-level ladder accounting, preserved per-channel attempts, and honest unknown cost/evidence fields
- [x] Bounded multi-page workers, shared host scheduling, conditional browser settling, and runtime resource reuse
- [x] Phase 1 Local Reliability Gate: Chromium-backed full test suite and GitHub Actions
- [x] Phase 2 L0-L2 quality benchmark: W2L ladder, verified completion, false-success, P95, escalation, and tiered reports
- [x] Phase A4 real-task harness: AI knowledge and product-info manifests, field assertions, repeat consistency, holdout and cost/evidence records
- [ ] Phase A4 real-task gate: 100-200 permitted pages, human correction time, repeated task evidence, and complete failure taxonomy
- [x] Phase A4 diagnostic expansion: 20 real tasks, 11 domains, 40 repeated runs, and holdout results
- [x] A6 scale slice: 100 pages, 10 domains, two runs; labeled holdout is not independent
- [x] A6 recovery/install evidence recorded: interrupt-resume lost 0 URLs; same-machine clean-clone first task; historical 18-minute correction record lacks human confirmation; billed USD unknown
- [x] A6 deferred exceptions recorded: second-developer install is deferred, not passed; billed USD is unknown, not zero
- [ ] A6 unconditional pass still needs a second human install
- [x] A5/A6 gate report: conditional alpha; billed USD remains unknown
- [x] Gate 2 execution contract, actual process recovery, controlled changes/cache and Monitor isolation
- [x] Gate 3 durable HTTPS delivery, same-event retry, deduplication and restart recovery
- [x] Gate 4 SDK, docs, examples and agent clean installation
- [ ] Gate 4 independent non-author human installation and full workflow
- [x] C2 Monitor/Delivery MCP and local conversational first-use flow
- [ ] C2 n8n and narrow task UI
- [x] C3 unified single-instance process and authenticated Streamable HTTP implementation
- [ ] C3 permanent Render URL, WorkOS/Codex OAuth acceptance and hosted restart drill
- [ ] Gate 5 two external trial users, two weeks, repeat use and real downstream consumption
- [x] Phase 3 Benchmark Gate harness: fixed W2L run, comparator evidence, and blocked-until-real-comparators decision
- [ ] Hosted Egress Gate: browser subresource policy enforcement and DNS-to-connection binding

See [ROADMAP.md](ROADMAP.md) for the current phase plan; the Section A/B/C roadmap is archived in [docs/roadmap/sections-abc-roadmap-2026-09-28.md](docs/roadmap/sections-abc-roadmap-2026-09-28.md). [PRODUCT_PLAN_V2.md](PRODUCT_PLAN_V2.md) remains the historical detailed plan.

## Contributing

We use the [Developer Certificate of Origin (DCO)](https://developercertificate.org/) instead of a CLA. Every commit needs a `Signed-off-by` line:

```bash
git commit -s -m "Your commit message"
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

Server-side code: [AGPL-3.0](LICENSE)  
SDK and client libraries: MIT (when published)

See [PHASE1_ENGINEERING_NOTES.md §1.3](PHASE1_ENGINEERING_NOTES.md) for the rationale.

## Why AGPL?

AGPL requires network-deployed modifications to remain open. Anyone can fork, modify, and host W2L — as long as they share those modifications. The real differentiator is the name (trademark) and the hosted service, not the license lock.
