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
| https://www.google.com/search?q=octocrawl | — (no fetch) | failed, `failureReason: policy_denied` | http | disallowed (rule `/search`, robots.txt SHA-256 `1aba570a…9538cf2c`) | agentHints: a hosted server obeys robots.txt for every URL. No request was sent (`requestCount` 0). **`evidenceRecord` is `null`** in this response. |
| https://quotes.toscrape.com/js/ | 2026-10-17T09:35:01.514Z | success, HTTP 200 | browser_local (`channelsTried: http, browser_local`) | no_robots | 10 quotes, 387 tokens; Markdown SHA-256 `bc3bcec1…1dee6ab126`. |
| https://www.nasa.gov/blogs/missions/2026/10/07/nasa-releases-artemis-ii-lunar-science-data-images/ | 2026-10-17T09:34:48.691Z | **failed, `empty_unverified`** | browser_local | allowed | The returned Markdown holds the whole article ("NASA Releases Artemis II Lunar Science Data, Images", byline, body, contacts) inside the site's navigation, yet readiness says `not_extracted` and the hint says no main content was found. A false failure; not usable as a demo. |

Two findings for the product, not the page: a robots.txt refusal comes back without an Evidence Record (`evidenceRecord: null`), though the robots decision and its hash are in the trace; and main-content detection missed the NASA article on the browser lane.
