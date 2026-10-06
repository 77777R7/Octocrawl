# Limits and result states

Octocrawl reports whether it captured a page and whether a requested structured record was verified. These are different questions. Check both before using fields in an alert, export, or downstream workflow.

## Hosted API and MCP

Hosted Octocrawl (`https://api.octocrawl.dev`, `https://mcp.octocrawl.dev/mcp`) serves `POST /v1/scrape` and `POST /v1/map`, and the MCP tools `scrape`, `map` and `scrape_product`.

| | Without a key | With a key |
| --- | --- | --- |
| Identity | Your address, hashed per day | The key, hashed |
| Pages a day | 20 per address | The key's allowance (1,000 to start) |
| Lane | HTTP only: no screenshot, no `scrape_product` | HTTP, then the browser when the key allows it |
| Starts a minute | 10 | 60 |

The whole service serves 1,500 pages a day. Over an allowance the answer is HTTP 429 with `Retry-After` until 00:00 UTC, and a refused request still counts as a start. Every request, of any kind, is limited to 120 a minute per address. A file (PDF, CSV) is read up to 5 MiB. Nothing is kept for reuse: records and files are deleted within ten minutes. `crawl`, `batch`, Monitors, logins, `/fc` and every other route answer 403 with a hint to run Octocrawl on your computer. Proxies, CAPTCHA solving and stealth are not offered; a blocked page is reported as blocked. These numbers may change; this page says what applies.

## Availability and quotas (the page preview)

The anonymous page allows three previews per browser visitor per UTC day and 100 previews site-wide per UTC day. A request refused before a preview starts (invalid input or options, a URL whose host is localhost or a private or reserved IP address, a used-up allowance) does not count. Once a preview starts it counts, whatever its result: that includes a host name that only turns out to resolve to a private address, a host that does not resolve, and a page stopped by robots.txt. `GET /api/quota` on the preview host reads what you have left without spending anything. On a local review address, quota and Amazon coordination live in memory and reset on process restart; do not expose that launcher publicly. On the hosted Cloud Run service, Firestore counters and Amazon coordination survive instance restarts. The local MCP service is separate and runs on loopback.

The browser preview accepts one public HTTP(S) URL per request, a main-content switch, and up to 20 fields read without a model. It does not accept visitor-supplied model prompts, browser sessions, other capture settings, private network targets, or raw HTML downloads; any other parameter returns HTTP 400 with `invalid_options` before a preview is counted. It reads pages of up to 2 MiB and files, such as PDFs, of up to 5 MiB. Generic pages use restricted HTTP capture; the public Amazon.sg `/dp/{ASIN}` route uses a configured anonymous browser context.

Typing a URL on the [Try Octocrawl page](/) shows a short note when the address is an Amazon.sg product, an X or Reddit post, or cannot be previewed. This hint comes from the same static rules used by the server; it does not contact the target site or spend a preview. Known private or reserved addresses are marked unsupported before capture; DNS results and redirects are checked by the guarded transport during extraction. The hint cannot predict whether a public site will allow access, return useful content, or select the requested product. Developers can read the planned route and its limitation with `POST /api/capability` and a JSON body `{"url": "<public-url>"}` on the preview host, as the page does; `GET /api/capability?url=<encoded-public-url>` also works, but puts the address in the request log. Invalid input returns HTTP 400 without starting a capture.

## How the preview identifies itself

The hosted preview identifies itself in every request it sends to a site: robots.txt, the page, and the Amazon.sg browser's requests. Its User-Agent is a Chrome User-Agent followed by the product token `OctoCrawl-Preview/1.0`. The Chrome version varies:

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OctoCrawl-Preview/1.0 (+https://octocrawl.dev)
```

The preview reads robots.txt before it fetches a page. To keep it off a site, or off part of one, add a group for `octocrawl-preview` (or `octocrawl`):

```text
User-agent: octocrawl-preview
Disallow: /
```

For the preview, a group that names it replaces the `User-agent: *` group, so repeat there any `*` rules it should still follow. Without such a group it follows `*`. The preview used to send `W2L-Preview/1.0`, the project's earlier name; a group for `w2l-preview` or `w2l` no longer applies to it, so rename such a group to `octocrawl-preview`. A disallowed page is not requested and returns `blocked` with the diagnostic `robots_disallowed`; a robots.txt that cannot be read stops the fetch too. The token belongs to this hosted preview: a copy of Octocrawl that someone runs on their own machine does not send it.

## Interpret the status

| Result | Meaning | Next action |
| --- | --- | --- |
| `success` | Readable page content was captured. | Inspect final URL and any separate product status. |
| `incomplete` | Content or subject/field checks could not be finished. | Read the issue; leave uncertain fields missing. |
| `blocked` | Site policy, login, or a verification page prevented a valid capture. | Respect the reason; try an eligible public source. |
| `timeout` | The preview deadline expired. | Check source availability and the network path before retrying. |
| `quota_exceeded` | This visitor or the whole preview has reached its configured limit. | Wait for the applicable quota period. |
| `invalid_url` / `failed` | The URL was rejected or the capture failed for another reason. | Correct the input or inspect the returned reason. |

The response may include a machine-readable `diagnostic` with `code`, `stage`, and `evidence`. Codes include `invalid_options`, `subject_mismatch`, `subject_conflicting`, `subject_unverified`, `quote_unverified`, `quote_absent_observed`, `quote_conflicting`, `region_unverified`, `currency_unverified`, `robots_disallowed`, `robots_unreachable` (robots.txt could not be read, so the page was not fetched), `login_required`, `challenge`, `policy_denied`, `timeout`, `quota_exceeded`, `service_unavailable`, and `capture_failed`. `observed` means the request itself identified that condition; `unobserved` means the expected evidence was missing or the service could not complete the check. Older clients can continue using `status` and `reason`.

For Amazon product JSON, `complete`, `incomplete`, and `invalid` describe the **structured record**, not the page transport. A missing price can be correct when the visible page does not provide a verifiable offer in the selected region. `quote_absent_observed` means this capture showed unavailability in its delivery context; it does not prove that no seller has an offer elsewhere. `quote_unverified` means no selected quote was observed, including pages that only show buying options. `quote_conflicting` means the captured selected-price evidence disagreed. An SGD value inferred only from the Amazon.sg domain does not satisfy the public quote check. `product.issues` explains unverified subject, region, currency, or fields. Octocrawl does not substitute prices from recommendations.

## Supported source boundary

| Source | Current boundary |
| --- | --- |
| Public documentation pages | Generic extraction and the checked Firecrawl Introduction Monitor preset. Individual sites may still block access. |
| Amazon.sg `/dp/{ASIN}` | Beta product adapter with main-ASIN, Singapore region, and SGD checks. Strict 100/100 holdout and 1000-page reliability gates remain open. |
| Reddit and X | Local Beta adapters do not establish hosted capture support. The Cloud Run preview plans restricted HTTP only; site policy, login, rendering, or challenges may prevent an anonymous result. |
| Logged-in or challenged pages | No general login-wall or CAPTCHA bypass promise. |

This is a support boundary, not a list of sites guaranteed to return content. See [Amazon.sg product JSON](/docs/guides/amazon-product/) for the exact verification flow.

## Task and environment matrix

| Source and task | Access and environment | Planned channel | Fields and support | Evidence and limit |
| --- | --- | --- | --- | --- |
| Public HTML page → readable text | Anonymous, Cloud Run preview | Restricted HTTP | Markdown, links (up to 500), page metadata, final URL, status, elapsed time, and up to 20 requested fields read without a model; conditional | Public documentation smoke tested on `bb32cbf`; sites can block or require rendering. |
| Amazon.sg `/dp/{ASIN}` → product JSON | Anonymous Singapore context, Cloud Run preview | Domain-limited browser | Main ASIN, region, currency, selected quote when verified; Beta | Public 200-page audit on `bb32cbf`: 171 complete, 29 incomplete, including two subject substitutions. Strict correctness gate remains open. |
| X status / Reddit post → public post | Anonymous, Cloud Run preview | Restricted HTTP | Only a verified requested post if captured; conditional | Hosted success is not validated. Local proxy and adapter experiments are separate. |
| Public page → Markdown or a site's URL list, from your agent or code | Hosted API and MCP, keyless or with a key | HTTP; browser with a key | `scrape` and `map` with the Evidence Record | Live since 2026-10-06; allowances above. |
| Persistent Monitor or Batch | Your own computer, the published packages | Local MCP workflow | Durable task results; local only | Not hosted yet; a later phase of the roadmap. |

The 200-page Amazon audit includes a fixed regression set and a separately frozen candidate set; neither cohort passed the 100/100 gate. The repository's R0 failure ledger records same-capture hashes and missing-evidence boundaries. Original HTML remains private on the operator's machine.

Need more pages a day on the hosted service, or the browser lane? [Ask for a key](/?from=limits#waitlist).
