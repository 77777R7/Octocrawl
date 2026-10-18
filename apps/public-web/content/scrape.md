# Scrape a page

`POST /v1/scrape` reads one URL and returns what you ask for: Markdown, links, tables, fields as JSON, the raw HTML. Every result says whether the page was read (`status`) and carries an Evidence Record: the final URL, when it was fetched, the HTTP status, the robots.txt decision and hashes of the bytes read and of the output.

Hosted Octocrawl serves it at `https://api.octocrawl.dev` with no setup: without a key, 20 pages a day per address, over HTTP only. With a key from your account, it spends credits and can also read in a browser. The same route runs on your own computer with `npx octocrawl serve` (`http://127.0.0.1:8787`), with no daily limit.

## First call

```bash
curl -X POST https://api.octocrawl.dev/v1/scrape \
  -H 'content-type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/Octopus","formats":["markdown","links","tables",{"type":"json","schema":{"type":"object","properties":{"kingdom":{"type":["string","null"]},"phylum":{"type":["string","null"]},"class":{"type":["string","null"]},"order":{"type":["string","null"]}}}}]}'
```

Add `-H 'authorization: Bearer oc_…'` to spend your account's credits instead of the keyless allowance. On 2026-10-17 at 09:28 UTC, without a key, that call returned this, shortened:

```json
{
  "status": "success",
  "markdown": "…An **octopus** (pl.: **octopuses** or **octopodes**…) is a soft-bodied, eight-limbed …",
  "json": {
    "status": "complete",
    "data": { "kingdom": "Animalia", "phylum": "Mollusca", "class": "Cephalopoda", "order": "Octopoda Leach, 1818[1]" },
    "evidence": [
      { "path": "/kingdom", "source": "dom", "evidencePath": "table[0] tr[4] \"Kingdom:\"" },
      { "path": "/order", "source": "dom", "evidencePath": "table[0] tr[10] \"Order:\"" }
    ],
    "issues": []
  },
  "evidenceRecord": {
    "schemaVersion": "w2l.evidence/1",
    "finalUrl": "https://en.wikipedia.org/wiki/Octopus",
    "fetchedAt": "2026-10-17T09:28:44.066Z",
    "httpStatus": 200,
    "status": "success",
    "lane": "http",
    "robotsDecision": { "decision": "allowed", "robotsUrl": "https://en.wikipedia.org/robots.txt" },
    "rawSha256": "0962dd1b780cabdb7e8fc16f55dd713dbd16e685d8978d512c1c7f6e1e439cf6",
    "outputSha256": {
      "markdown": "ea6266cfa47ce54c4646fec4650ec09cb020b5da43ddb3dbd73fa614a18dfbdf",
      "json": "4657c798730a00302a262fe6c5a58b528082f7db0e09483e4f4a6a5f7dba595c"
    }
  }
}
```

The same response held 1,277 links, one table (the infobox, 15 rows) and 560 lines of Markdown. The requests and results of that day's runs are in the [run record](https://github.com/77777R7/Octocrawl/blob/main/research/hosted/2026-10-17-scrape-page-demos-e1e128d4.md).

## Formats

`formats` takes any of these, `markdown` when it is left out:

| Format | What comes back |
| --- | --- |
| `markdown` | The page's main content as Markdown. |
| `links` | The URLs the page links to. |
| `tables` | Each data table of the content as rows, in the order the Markdown has them. |
| `{ "type": "json", "schema": … }` | Fields you name in a JSON Schema, each with where on the page it was read. |
| `html`, `rawHtml` | The cleaned HTML of the content, or the bytes as received. |
| `images` | The URLs of the page's images. |
| `{ "type": "attributes", "selectors": … }` | Attribute values of the elements you name, such as every `a[href$=".pdf"]`. |
| `{ "type": "list" }` | One record per repeated item, such as products on a listing page. |
| `screenshot` | An image of the page. It needs the browser, so a key on hosted Octocrawl. |

## Keep only what you need

By default (`onlyMainContent: true`) the Markdown leaves out the header, navigation and footer. `onlyMainContent: false` keeps the whole page. `includeTags` keeps only the elements its CSS selectors name, and `excludeTags` removes elements before the content is taken.

Wikipedia served the Octopus page in two variants that day. Read at 16:00 UTC, the variant with `rawSha256` `0a1cc6ca…3f8de562` gave 560 lines and 39,370 tokens of Markdown. Read again at 18:18 UTC with only its headings and paragraphs:

```json
{ "url": "https://en.wikipedia.org/wiki/Octopus", "formats": ["rawHtml", "markdown"], "includeTags": ["h1", ".mw-parser-output section > p", ".mw-parser-output h2", ".mw-parser-output h3"] }
```

The same bytes (`0a1cc6ca…3f8de562` again) then gave 189 lines and 15,463 tokens, without the badges and the infobox. The selectors are listed in [Scrape options](https://github.com/77777R7/Octocrawl/blob/main/docs/scrape-options.md#page-options).

## Fields as JSON

A `json` format fills the schema you send from the page itself and gives each value its source in `json.evidence`. A value the page does not hold is not made up: the field is missing, or `null` when the schema allows it, and an issue names it. Reading an Amazon.sg book's product page the same day, `/brand` came back with a `field_unavailable` issue, because a book has no brand, rather than the author's name in its place.

`json.status` is `complete`, `incomplete` (a required field has no source, or the page was not a full success) or `invalid`. Check it, and `issues`, before you use a value. The supported schema keywords are in the [advanced reference](/docs/reference/#json-extraction).

## Pages that need a browser

Octocrawl reads over HTTP first and opens a browser when the page needs scripts to show its content. On 2026-10-17, [quotes.toscrape.com/js/](https://quotes.toscrape.com/js/), whose quotes a script draws, came back with all 10 quotes after HTTP and then the browser (`channelsTried: ["http", "browser_local"]`).

- `fastMode: true` keeps a call over HTTP alone. A page that needs scripts then returns HTTP's verdict instead of its content.
- `waitFor` (milliseconds) starts in the browser and waits that long after the page loads before reading it.
- `timeout` bounds the whole scrape; when it fires, the answer is `partial` with what was read, or `failed`.

Without a key, hosted Octocrawl reads over HTTP only. With a key it can use the browser, one scrape at a time per key.

## Read the result

`status` says what happened to the page. A scrape usually ends in one of these five; only `success` and `partial` carry the page's content.

| `status` | Meaning |
| --- | --- |
| `success` | The page was read. |
| `partial` | The deadline cut the read short; the content is what was read by then. |
| `blocked` | The site stopped the read: a CAPTCHA, a login wall, an access check. `blockReason` says which. |
| `failed` | Nothing usable was read, or the read was not allowed. `failureReason` says why. |
| `empty_verified` | The page was read and is empty, such as a search with no results. |

Two pages from the same day: a Walmart product page answered with a CAPTCHA page, so the result was `blocked` with `blockReason: "captcha"`. A Google search URL is disallowed by Google's robots.txt, which hosted Octocrawl always obeys, so it was `failed` with `failureReason: "policy_denied"` and the page itself was never requested. Hosted Octocrawl does not solve CAPTCHAs or change who it says it is. `agentHints`, when present, says what to try next.

An error body (`{ "error", "code" }` with HTTP 4xx or 5xx) is about the call, not the page: a bad option, a missing key, the daily allowance used up. The codes are in the [advanced reference](/docs/reference/#errors).

## Check the Evidence Record

`evidenceRecord.rawSha256` is the SHA-256 of the bytes Octocrawl received, and `outputSha256.markdown` that of the Markdown it returned. Hash the `markdown` you got as UTF-8 and compare: if they match, it is the output of that read. Request `rawHtml` to keep the bytes themselves. `robotsDecision` records the robots.txt rule that applied, and `fieldEvidence` where each JSON value was read. Every field is described in the [advanced reference](/docs/reference/#evidence-record).

## Cost

On an account's credits, a page read over HTTP costs 1 credit and a page read in a browser 5. A blocked or refused page costs nothing. Each answer gives `X-Credits-Used` and `X-Credits-Remaining`. An account gets 1,000 credits a month; [sign in](/signin/) to make a key. Without a key the call is free, within 20 pages a day. [Limits](/docs/limits/#hosted-api-and-mcp) has the rest.

The same call goes through the [TypeScript SDK](https://www.npmjs.com/package/@octocrawl/sdk), the Python client `octocrawl-client`, `npx octocrawl scrape` and the MCP `scrape` tool ([Connect MCP](/docs/connect-mcp/)). To read many pages, list them with `POST /v1/map` first.
