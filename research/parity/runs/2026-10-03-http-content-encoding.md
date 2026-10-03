# Real-site run 2026-10-03: the http lane decodes a Content-Encoding it did not ask for

Follow-up to [2026-10-03-m3-map.md](2026-10-03-m3-map.md), finding 2: https://www.python.org/ answers W2L's http lane with a gzip body although the lane sends no `Accept-Encoding`. Before this change, the lane read the gzip bytes as the page. The map group's run on 8da3e73 / 45d707c recorded the start page as 200 but `failed/empty_unverified`, with 0 links, `bytesWire` equal to `bytesDecompressed` and an empty `rawHtml`. The map also got a misleading `start_page_client_rendered` warning.

Source commits: `6e020c84d0f67fb3e86a7974360c55b681c608fd` (the change) and `8c1aa0e6036f6a30b5fae8b3d761a40f67547e60` (review fixes: decode only the final body, leave empty and redirect bodies alone, and stop inflating a `.gz` sitemap twice). Both live runs below were made on each of these two commits with a clean working tree. The results are the same on both, and the numbers quoted are from 8c1aa0e. A third commit, `b69fbab` (an error page whose body does not decode claims no body hash), was not run live: it changes only a non-2xx response whose body does not decode, a path neither live run takes. The fixture tests and both Node runs below are on b69fbab.

Network: proxied. The shell set `HTTPS_PROXY=HTTP_PROXY=http://127.0.0.1:7890` and `NO_PROXY=localhost,127.0.0.1,::1,.local`, and the local API followed them. The scrape's `evidence.envProxy` and the Evidence Record's `proxy` are `127.0.0.1:7890`, and each map's sitemap file record has `proxyUsed: true`. Map responses carry no `evidence.envProxy`, so the runner's line reads "0 of 2 cases' responses record an environment proxy". This was not run direct.

API: `W2L_API_PORT=8853 W2L_SOURCE_COMMIT=$(git rev-parse HEAD) npm run api`, Node v26.8.1.

## Fixture test (before and after)

`packages/bench/test/contentEncoding.test.ts` uses a local `node:http` server that encodes whatever the request asked for.

- On origin/main (3cfd6a8), with only the new decoder module present, all 7 http-lane and sitemap cases fail. Only the unit test of the new module passes.
- On 6e020c8, the four cases added for the review findings fail: an empty gzip body and a 304, redirects with a coded body, a 404 with an unknown coding, and a `.xml.gz` served with `Content-Encoding: gzip`.
- On 8c1aa0e and b69fbab, all 11 cases pass.

`npx tsc --build` and `npm test` on b69fbab (the same counts on 8c1aa0e):

- Node v26.8.1: 142 files, 1785 tests passed.
- Node v22.22.0 (`npm rebuild better-sqlite3` before and after): 142 files, 1785 tests passed.

## Scrape of https://www.python.org/

Command: `curl -X POST http://127.0.0.1:8853/v1/scrape -H 'content-type: application/json' -d '{"url":"https://www.python.org/","formats":["markdown","links","rawHtml"]}'`. It was run once per commit, at 2026-10-03T03:34:20Z on 6e020c8 and at 03:40:46Z on 8c1aa0e.

| Field | Value (8c1aa0e) |
| --- | --- |
| status / failureReason / lane / channelsTried | success / null / http / `["http"]` |
| evidence.httpStatus, contentType | 200, `text/html; charset=utf-8` |
| evidence.contentEncoding, Evidence Record `contentEncoding` | `gzip`, `gzip` |
| usage.bytesWire / bytesDecompressed | 11,723 / 52,883 |
| rawHtml length, markdown length, links | 52,871 characters; 8,181 characters; 128 links |
| rawSha256 | `21e77f11d94045931b63e4398a697b04569c080b7e23aaee75167374e0e88ec4` (same on both commits) |
| warnings | none |
| headers sent (`identity_sent`) | `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `user-agent`: no `accept-encoding`, unchanged |
| extractor.commit | `8c1aa0e6036f6a30b5fae8b3d761a40f67547e60` |

The 2026-10-03 map record gave `bytesWire 21,229` for the undecoded body. This run measured 11,723 wire bytes. It was not checked why the size differs (another edge, another compression level, or the page changing).

The Markdown begins with the page's own fallback notice, as served: "This page displays a fallback because interactive scripts did not run". That text is in the page's HTML. W2L did not add it.

## Runner cases MP13 and MP14

Command: `W2L_API_URL=http://127.0.0.1:8853 node research/parity/run-sites.mjs --only MP13,MP14 --record <scratchpad>/run.md`. It was run once per commit: 2026-10-03T03:34:31Z → 03:34:58Z on 6e020c8, and 03:40:53Z → 03:41:12Z on 8c1aa0e. Raw responses are under `.w2l/parity/2026-10-03T03-40-53-689Z/`, which is git-ignored.

Cases fully passing: 0/2. Checks passing: 10/14, up from 6/14 on 8da3e73.

| Case | Before (8da3e73, 2026-10-03-m3-map-options) | Now (8c1aa0e) | Failed checks now |
| --- | --- | --- | --- |
| MP13 python.org, `includeSubdomains: true` | 4/8, 1 link | 6/8: 86 links (22 on other `*.python.org` hosts), hostCount 13, hostDenied 40 | `status` is `partial`; `itemUrls` has 1 link outside `^https://…python.org/` |
| MP14 python.org, default | 2/6, 1 link | 4/6: 63 links, all on www.python.org or python.org, hostDenied 64 | `status` is `partial`; `sources.sitemap.files.0.kind` is `unreadable`, not `absent` |

Results on the start page in both maps:

- `startPage` is `{ finalUrl: https://www.python.org/, httpStatus: 200, status: success, lane: http, linksFound: 128 }`.
- The only warning is `sitemap_unreadable`. Neither `start_page_unreadable` nor `start_page_client_rendered` appears.

The remaining failures do not come from the http lane's page fetch:

1. **The sitemap read loops behind the proxy, because of W2L's own request.** It fails `status` in both cases and `sources.sitemap.files.0.kind` in MP14. The sitemap file record shows:
   - `url: https://python.org/sitemap.xml`
   - `finalUrl: https://www.python.org/sitemap.xml`
   - `status: 301`, `kind: unreadable`, `error: redirect_limit`, source `guess`

   This is not python.org redirecting its sitemap to itself. undici's `ProxyAgent` writes `host` into the headers object it is given, and the sitemap reader reused one object across a file's redirect hops. So every request to `www.python.org` still carried `host: python.org`, and the CDN answered each with the apex's redirect to `www`, until the redirect limit. Without the proxy, or with a fresh headers object, `https://www.python.org/sitemap.xml` answers 404 and the file is `absent`, as the cases expect. The diagnosis and the fix are in PR #107 and [2026-10-03-sitemap-proxy-host.md](2026-10-03-sitemap-proxy-host.md). This record first described the loop as python.org's own; that wording was corrected before the PR merged.
2. **MP13 keeps an `http://` variant of a link.** The start page links `http://docs.python.org/3/tutorial/introduction.html` and also its `https://` form. The map collapses the two into the first one seen: its `refused.samples.collapsed` has `{ url: "https://docs.python.org/3/tutorial/introduction.html", into: "http://docs.python.org/3/tutorial/introduction.html" }`. So the map returns the `http://` URL, which the case's `^https://` pattern rejects. That is how the map collapses variants, and this change does not touch it.

## What the change does

The http lane now decodes the final response's body by its `Content-Encoding`, whether or not it was requested:

- Supported codings: `gzip`, `x-gzip`, `deflate` (zlib-wrapped or raw) and `br`, and lists of them. Decoding happens after the wire cap and under the 50 MiB decompressed cap.
- A file is held to its file cap as decoded.
- An unknown coding fails with the new reason `unsupported_content_encoding`. Bytes that do not decode fail with `parse_error` (trace `content_decoding_failed`). Neither is read as the page.
- An answer without content (a 404, a 304) keeps its status.
- The coding goes on `evidence.contentEncoding` and on the Evidence Record's additive `contentEncoding` key.
- Redirect and retry bodies that the engine drains are not decoded.

The sitemap reader (`packages/bench/src/sitemapSource.ts`) had its own path. It inflated gzip only when it recognised the magic number or a `.gz` path, and never decoded deflate or br. It now decodes the Content-Encoding first, then inflates a `.gz` file only if it is still gzip. Scrape, batch, crawl and map all read pages through the same lane.
