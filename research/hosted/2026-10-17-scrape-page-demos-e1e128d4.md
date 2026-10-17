# Demo scrapes for the /scrape/ page redesign (2026-10-17)

The three real pages the redesigned /scrape/ page will show, each read once on hosted Octocrawl.

- Server: hosted API at `https://api.octocrawl.dev`, Cloud Run revision `octocrawl-api-fields-e1e128d` (tag `h21fields`), source commit `e1e128d4` (main after #566 and #567). Every Evidence Record names extractor `extract-tf/28`, commit `e1e128d4a5e1fef0fa442a4c79cb980049b6c308`.
- Caller: keyless REST from Howard's Mac. The request to `api.octocrawl.dev` went through the shell's proxy (127.0.0.1:7890), but the page fetches are made by the hosted server: Evidence Record `access.egress.source: "direct"` on all three, no proxy.
- Lane: HTTP on all three (keyless hosted reads over HTTP only). Keyless calls carry no `X-Credits-*` headers; on an account each would cost 1 credit.
- Raw responses, request bodies and headers are kept under `.w2l/scrape-demo/2026-10-17/` (not committed).

Command, once per request body:

```bash
curl -s -X POST https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' --data @<name>.request.json
```

## Request bodies

- Octopus: `{"url":"https://en.wikipedia.org/wiki/Octopus","formats":["markdown","links","tables",{"type":"json","schema":{"type":"object","properties":{"kingdom":{"type":["string","null"]},"phylum":{"type":["string","null"]},"class":{"type":["string","null"]},"order":{"type":["string","null"]}}}}]}`
- datetime: `{"url":"https://docs.python.org/3/library/datetime.html","formats":["markdown","tables"]}`
- Amazon: `{"url":"https://www.amazon.sg/dp/0135957052","mode":"standard","formats":[{"type":"json","schema":<research/amazon-product-schema.v1.json>,"modelFallback":false}]}`. This is the request the hosted MCP tool `scrape_product` sends (`packages/mcp/src/hostedToolPolicy.ts`); keyless MCP refuses `scrape_product` itself, so it was sent over REST.

## Results

| Page | fetchedAt (UTC) | Status | robots.txt | Bytes read | rawSha256 | Content tokens |
|---|---|---|---|---|---|---|
| https://en.wikipedia.org/wiki/Octopus | 2026-10-17T09:28:44.066Z | success, HTTP 200 | allowed | 922,203 | `0962dd1b780cabdb7e8fc16f55dd713dbd16e685d8978d512c1c7f6e1e439cf6` | 39,370 |
| https://docs.python.org/3/library/datetime.html | 2026-10-17T09:28:48.842Z | success, HTTP 200 | allowed | 429,471 | `bad4d2ecc5603a45bb46a8a4dcaa8354ec22af3010939f41be6e97379da614c2` | 28,435 |
| https://www.amazon.sg/dp/0135957052 | 2026-10-17T09:28:52.626Z | success, HTTP 200 | allowed (`User-agent: *`) | 1,370,155 | `06a6973ce8b0d53e30dc6640e068a0a3c0d77e7d375db8d91ae0b303d1367d5b` | 9,532 |

Output hashes: Octopus Markdown `ea6266cf…a18dfbdf`, JSON `4657c798…7dba595c`; datetime Markdown `ff2be307…9b5529f4`; Amazon JSON `e7af7a61…9ac1d02e`.

### Octopus (Markdown, fields)

- Fields, all four read, no issues: `kingdom` "Animalia" (`table[0] tr[4] "Kingdom:"`), `phylum` "Mollusca" (`tr[5]`), `class` "Cephalopoda" (`tr[6]`), `order` "Octopoda Leach, 1818[1]" (`tr[10]`). The `[1]` is the page's footnote marker, kept as written.
- Tables: 1 (the infobox, 2 × 15). Before #567 the same page gave 8, seven of them cladogram layout.
- Links: 1,277. Markdown: 560 lines; it opens with the "Featured article" and "Page semi-protected" badge images before the lead paragraph ("An **octopus** (pl.: **octopuses** or **octopodes**…) is a soft-bodied, eight-limbed mollusc…").

### datetime (tables)

- Tables: 6. The strftime/strptime directive table is `tableIndex` 4: 4 columns × 38 rows including the header (`Directive, Meaning, Example, Notes`), `csvSha256` `718101f42742c93714824664fa79c42786731b215ce388d005615d5d0f725b4f`.

### Amazon.sg (fields)

- JSON complete; one issue: `/brand` `field_unavailable` (a book has no brand; #566 stopped filling it with the byline).
- Values with their locators: `title` "Pragmatic Programmer, The: your journey to mastery, 20th Anniversary Edition" (`#productTitle`), `price` 64.55 and `currency` "SGD" (`#buybox .a-price .a-offscreen`), `availability` "In stock" (`#availability span`), `seller` "Amazon US", `rating` 4.8 (`#acrPopover`), `reviewCount` 2578 (`#acrCustomerReviewText`), `deliveryLocation` "Singapore 170000", one product image.
- `specifications` (from `#detailBullets_feature_div`): Publisher "Addison Wesley", Publication date "2 December 2019", Edition "2nd", Print length "352 pages", ISBN-10 "0135957052", ISBN-13 "978-0135957059", and others; keys trimmed, no script text.
- No `authors` field: the v1 schema has no such property (see `research/parity/runs/2026-10-17-amazon-book-direct-cbfe3a32.md`).

## Re-fetching the bytes

The same day, from the Mac through the proxy, with the record's User-Agent:

- datetime: SHA-256 `bad4d2ec…a614c2`, 429,471 bytes. **Matches** the record.
- Octopus: SHA-256 `0a1cc6caaaa9e20e8057e955eb9b74d4469e4494a1137823833cd1413f8de562`, 922,203 bytes. **Does not match** the 09:28 record, though the size is the same. That hash equals the one hosted Octocrawl recorded for the same URL at 07:37 UTC. Wikipedia served two variants of equal length within two hours; which bytes differ is not known (this run did not keep `rawHtml`).
- Amazon: not re-fetched (the page changes per request: prices, ranks, tokens).

A page that wants to say "hash the page yourself and get the same value" should use the datetime page for it, not Octopus or Amazon.

## Harder pages (same day, same server)

For the page's "When a page is harder" section. Walmart and Google: keyless REST as above, request bodies `{"url":…,"formats":["markdown"]}`, responses at 09:34:16 GMT (response `date` header). The JavaScript pages: the hosted MCP `scrape` tool through Howard's signed-in `/mcp-oauth` connection (the browser lane needs an account), `formats: ["markdown"]`; the MCP result shows no credit headers, and the tariff charges a browser page 5 credits.

| Page | fetchedAt (UTC) | Status | Lane | robots.txt | What the result says |
|---|---|---|---|---|---|
| https://www.walmart.com/ip/5689919121 | 2026-10-17T09:34:16.063Z | blocked, `blockReason: captcha` (HTTP 200 on `walmart.com/blocked?…`) | http | allowed | agentHints: Walmart gates automated access; Octocrawl does not solve challenges or change its identity; a key opens the browser lane, or run it on your own computer. rawSha256 `35ba0637…bf1ee76c9d` (same as the 07:50 trial). |
| https://www.google.com/search?q=octocrawl | — (no fetch) | failed, `failureReason: policy_denied` | http | disallowed (rule `/search`, robots.txt SHA-256 `1aba570a…9538cf2c`) | agentHints: a hosted server obeys robots.txt for every URL. No request was sent (`requestCount` 0). The Evidence Record is present: status failed, reason `policy_denied`, robots decision `disallowed` with the robots.txt URL and SHA-256, `fetchedAt`/`finalUrl`/`httpStatus`/`rawSha256` null because nothing was fetched. |
| https://quotes.toscrape.com/js/ | 2026-10-17T09:35:01.514Z | success, HTTP 200 | browser_local (`channelsTried: http, browser_local`) | no_robots | 10 quotes, 387 tokens; Markdown SHA-256 `bc3bcec1…1dee6ab126`. |
| https://www.nasa.gov/blogs/missions/2026/10/07/nasa-releases-artemis-ii-lunar-science-data-images/ | 2026-10-17T09:34:48.691Z | **failed, `empty_unverified`** | browser_local | allowed | The returned Markdown holds the whole article ("NASA Releases Artemis II Lunar Science Data, Images", byline, body, contacts) inside the site's navigation, yet readiness says `not_extracted` and the hint says no main content was found. A false failure; not usable as a demo. |

One finding for the product, not the page: main-content detection missed the NASA article on the browser lane. (A first reading of the Google response claimed its Evidence Record was null; that was a mistake in the reading script, which failed on the record's null `finalUrl`. The record is in the saved response.)

## The three demo pages again, with raw HTML (same day, 15:54 and 16:00 UTC)

The redesigned hero shows each page's raw HTML turning into its Markdown, so the raw HTML had to come from the same read as the result. The three pages were read again on `api.octocrawl.dev`, now revision `octocrawl-api-nasa-ea3b0d7` (tag `h22nasa`, source `ea3b0d7d`, deployed from another window after #574), keyless REST, direct egress, with `rawHtml` added to each request body above.

- 15:54 (`formats` with `rawHtml` first; Amazon, Octopus and datetime as before): every value shown on the page matched the 09:28 read. Only hashes and byte counts moved.
- 16:00, the read the page now shows (`formats: ["rawHtml", "markdown", …]`, so Amazon also returned Markdown):

| Page | fetchedAt (UTC) | Bytes | rawSha256 | Markdown lines / tokens |
|---|---|---|---|---|
| Octopus | 2026-10-17T16:00:07.468Z | 922,203 | `0a1cc6ca…3f8de562` | 560 / 39,370 |
| datetime | 2026-10-17T16:00:11.701Z | 429,471 | `9964af63…7f8abe7c` | 2,108 / 28,435 |
| Amazon.sg | 2026-10-17T15:59:53.921Z | 1,372,004 | `2f1ca227…d3b5fba7` | 815 / 9,535 |

In every response the SHA-256 of `rawHtml` (UTF-8) equals the record's `rawSha256`: the raw HTML is the bytes that were read. The page shows the first 4,200 characters of it and the first 60 lines of the Markdown, as returned. `apps/public-web/public/samples/python-docs-datetime.html.txt` is the datetime read's `rawHtml`.

The datetime page's bytes differed from the 09:28 read (`bad4d2ec…`) in one line only: "Last updated on Oct 17, 2026 (07:21 UTC)" became "(14:17 UTC)". The Octopus page's 16:00 bytes hash to `0a1cc6ca…`, the variant seen at 07:37, not the 09:28 one.
