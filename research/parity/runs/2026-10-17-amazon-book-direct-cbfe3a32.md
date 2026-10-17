# Amazon book product output, re-run after the adapter fixes (2026-10-17)

- Source commit: `cbfe3a32` (branch `claude/amazon-product-output-fixes`, on `67d01484`)
- Server: local API, `npm run api` (port 8787), started with `HTTPS_PROXY`/`HTTP_PROXY` unset
- Egress: **direct** (Evidence Record `access.egress.source: "direct"`, no proxy). Amazon showed a Singapore delivery location on both hosts.
- Schema: `research/amazon-product-schema.v1.json`, `modelFallback: false` (what `scrape_product` sends)

## Before (hosted, server commit `cd0cbec7`, 2026-10-17)

Two hosted `scrape` calls on `https://www.amazon.com/dp/0135957052` through the signed-in MCP connection (`formats: ["json","rawHtml"]`, then `fastMode: true`), both on the HTTP lane, direct egress from the hosted server:

- `brand`: `"by David Thomas (Author), Andrew Hunt (Author) Format: Hardcover"`
- `specifications` keys `"Publisher "`, `"ISBN-10 "` and others with a trailing space
- `specifications["Customer Reviews"]`: `"4.8 4.8 out of 5 stars (3,661) var dpAcrHasRegisteredArcLinkClickAction; P.when('A', 'ready')…"`
- `price` `"58.83"` with `currency` `"SGD"` in the adapter entity. The "price without currency" report was **not reproduced** in these two calls.

The grey-pixel image (`…/x-locale/common/grey-pixel.gif`) came from the 2026-10-17 hosted `scrape_product` run on amazon.sg that the report quotes; it was not in the subject image selectors in either call above.

## After (local, `cbfe3a32`)

Commands (request bodies: `{url, mode: "standard", formats: [{type: "json", schema, modelFallback: false}]}`, plus `waitFor: 1500` for the browser rows):

```bash
curl -s -X POST localhost:8787/v1/scrape -H 'content-type: application/json' --data @req.json
```

| URL | Lane | fetchedAt | json | brand | price / currency | images | spec keys trimmed | script text in specs |
|---|---|---|---|---|---|---|---|---|
| https://www.amazon.sg/dp/0135957052 | http | 2026-10-17T08:11:51.378Z | complete (issue: `/brand` field_unavailable) | null | 64.55 SGD | 1 product photo | yes | none |
| https://www.amazon.com/dp/0135957052 | http | 2026-10-17T08:11:54.793Z | complete (issue: `/brand` field_unavailable) | null | 58.83 SGD | 1 product photo | yes | none |
| https://www.amazon.sg/dp/0135957052 | browser_local | 2026-10-17T08:12:03.658Z | complete (issue: `/brand` field_unavailable) | null | 64.55 SGD | 1 product photo | yes | none |

`Customer reviews` now reads `"4.8 4.8 out of 5 stars (2,578)"` (amazon.sg) and `"4.8 4.8 out of 5 stars (3,661)"` (amazon.com); the repeated 4.8 is the page's own visible text.

A schema-less call (`formats: ["json"]`, `waitFor: 1500`, browser_local) on the amazon.sg URL returned the adapter entity with `authors: ["Andrew Hunt", "David Thomas"]` (path `#bylineInfo .author`) and no `brand` field. The v1 schema has no `authors` property, so `scrape_product` output does not show the authors yet.

The browser page held 13 grey-pixel `<img>` tags (A+ modules, review avatars, review galleries), none inside the subject image selectors, so this run did not exercise the placeholder filter; the fixture test in `packages/extract-tf/test/adapters.test.ts` covers it.
