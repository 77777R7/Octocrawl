# Real-site run 2026-10-05: Walmart laptops listing routed as `article`

Reported problem: on 2026-10-05, at source commit `5d3335a` (branch `claude/gate-perimeterx`, PR #218), `POST /v1/scrape` for `https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960` with `debug: true` came back `failed` / `empty_unverified` on lane `browser_local`, with page type `article`, confidence 0, and 4324 characters of site chrome as Markdown. No laptop cards were extracted.

## Setup

- **Source commit:** `932170a` (origin/main). `git diff 5d3335a 932170a -- packages/extract-tf packages/runtime` is empty, and PR #218's own commits change only `packages/http-core/src/gate.ts`, its tests and a fixture.
- **API:** `npm run api` on port 8787, standard mode, requests sent with `curl --noproxy '*'` to the loopback API.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every Octocrawl response below records `evidence.envProxy: 127.0.0.1:7890`. One plain `curl` of the reported URL was also made **direct** (proxy variables unset), to see whether the answer depended on the proxy.
- **When:** 14:03 to 14:07 UTC on 2026-10-05.
- **Raw responses and HTML:** under `.w2l/parity/2026-10-05-walmart/` (git-ignored).
- **Firecrawl:** `research/parity/` holds no Walmart case or Firecrawl v4.42.0 record for either URL, so there is nothing to compare against.

## Runs

| # | Request | Octocrawl result |
| --- | --- | --- |
| 1 | `{"url":"https://www.walmart.com/browse/electronics/laptops/3944_3951_1089430_132960","debug":true}` | `failed` / `empty_unverified`, lane `browser_local`, HTTP 200, final URL unchanged; http lane `empty_unverified` with `client_rendered_suspected` (`script_shell`); browser lane page type `article`, strategy `article`, confidence 0, escalate true, 31 links; 4328 characters of Markdown. Scrape `beeded7d-58c2-441a-a13a-5df4cac3f837`. |
| 2 | `{"url":"https://www.walmart.com/browse/electronics/all-laptop-computers/3944_1089430_3951_132960","debug":true}` | `success`, lane `http`, HTTP 200; page type `collection`, strategy `list`; 21408 characters of Markdown, **9** product cards. Scrape `0ad9e50d-d58c-4ccb-85c9-c3dbb231f6c4`. |
| 3 | run 2's URL with `"waitFor":5000` | `success`, lane `browser_local`; page type `collection`, strategy `article`, confidence 0.75; 119888 characters, **47** product cards. Scrape `fd773d8e-146e-4894-a372-39665532f051`. |
| 4 | run 2's URL with six `scroll` actions, each followed by a 1.5 s `wait` | Walmart served the PerimeterX "Robot or human?" challenge: final URL `https://www.walmart.com/blocked?url=...`. Octocrawl reported `success` with the challenge as content (525 characters). This is the challenge, not the routing problem, and it is recorded here only as what happened. Scrape `415b5740-2d03-4029-b46e-ecd5867f2086`. |

Run 1 reproduces the report. Walmart served its own page, not the challenge.

A product card is counted as one Markdown line ending in `out of 5 stars`.

## Cause: the reported URL is a not-found page served with HTTP 200

- Run 1's Markdown has no laptop cards. Under the header it says "This page couldn't be found." and "Sorry about that!", followed by the footer.
- A plain `curl` of the reported URL was made through the proxy (HTML sha256 prefix `98838b95aea6f49b`) and one was made direct (`14ac594033d3dd70`). Both answered 200. Both have a `__NEXT_DATA__` whose `pageContext.browseContext.errorResponse` is `{"errorType":"FATAL","source":"polaris","statusCode":"POLARIS_1001","statusMsg":"INVALID_CAT_ID"}`. Its `searchResult` has `itemStacks: []`, `count: 0` and `catInfo.catId: ""`.
- So no product cards existed in the server HTML, in `__NEXT_DATA__` or in the rendered DOM. They were not hydrated later and did not depend on scrolling. Walmart rejects the category ID `3944_3951_1089430_132960`, through the proxy and direct alike.
- Walmart's electronics page (`/cp/electronics/3944`, fetched the same way) links its laptops category as `/browse/electronics/all-laptop-computers/3944_1089430_3951_132960`. That ID has the same numbers in a different order.
- Routing that page as `article` and failing it as `empty_unverified` is therefore not a routing or extraction miss: the page has no listing to route.
- No local fixture was added and no code was changed.

## What the valid listing URL showed

- Run 2 shows that page-type routing recognises Walmart's grid when it has one: `collection` with strategy `list`, with names, prices, ratings and delivery lines in the Markdown.
- Run 2 returned 9 cards, accepted from the http lane.
  - In a plain `curl` of the same URL (`23f32193f116fce0`), the server-rendered markup holds 9 tiles (`data-item-id`), while `__NEXT_DATA__` lists 49 products in `itemStacks` (`count` 53). The other 40 tiles are drawn by the page's scripts.
  - Run 3 got 47 cards from the browser lane with `waitFor` alone, so the missing cards need rendering time, not scrolling or other interaction.
  - The default request stopped at the http lane because 9 cards made a non-empty `success`.
- Markdown seen in runs 2 and 3, recorded as found and not investigated further:
  - prices render as `$19900` for $199.00, because Walmart splits dollars and cents into separate elements;
  - review counts run into the rating, as in `2964.4 out of 5 Stars. 296 reviews`.
