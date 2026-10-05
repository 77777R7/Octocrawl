# Real-site run 2026-10-05: Walmart laptops listing after `hydration_list_partial`

Follows [2026-10-05-walmart-laptops-proxied-932170a.md](2026-10-05-walmart-laptops-proxied-932170a.md). On `932170a` the default request for Walmart's laptops category ended on the http lane with 9 of the page's products. The server markup draws 9 tiles, and its `__NEXT_DATA__` lists 49. Commit `3e5d62f` adds the `hydration_list_partial` render reason, which offers such a listing to the browser rung.

## Setup

- **Source commit:** `3e5d62f` (branch `claude/partial-listing-escalation`, on origin/main `06c2a85`).
- **API:** `npm run api` on port 8787, standard mode, requests sent with `curl --noproxy '*'` to the loopback API.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890), recorded in each response's `evidence.envProxy`. No direct run was made.
- **When:** 14:21 to 14:22 UTC on 2026-10-05.
- **Raw responses:** `.w2l/parity/2026-10-05-walmart/run5.json` and `run6.json` (git-ignored).
- A product card is counted as one Markdown line ending in `out of 5 stars`, as in the earlier record.

## Runs

Both runs sent the request `{"url":"https://www.walmart.com/browse/electronics/all-laptop-computers/3944_1089430_3951_132960","debug":true}`, with no `waitFor` and no actions.

| # | Scrape | http rung | `quality_client_rendered` detail | Answer |
| --- | --- | --- | --- | --- |
| 5 | `45da368a-6a29-4537-a302-62c616005a2f` | `success`, 9 cards | `hydration_list_partial`, `listRecords: { declared: 47, shown: 8 }`, textChars 3498 | `success` on `browser_local`, **50** cards, 120784 characters; escalation `http → browser_local`, trigger `quality_client_rendered`, `improved: true` |
| 6 | `53a4a336-ac46-40bf-8ba0-2753c626abef` | `success`, 9 cards | `hydration_list_partial`, `listRecords: { declared: 44, shown: 7 }`, textChars 3559 | `success` on `browser_local`, **47** cards, 120420 characters; same escalation, `improved: true` |

- Walmart served its page both times, not the PerimeterX challenge.
- Final URL was the requested URL both times. HTTP 200.
- `shown` counts the names that are in the cleaned page's visible text. That is 8 and 7 of the 9 tiles. Why the other names did not match was not investigated.

## Regression check

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/2026-10-05-lists-proxied-3e5d62f.md`, proxied, at `3e5d62f`, passed 8/8 cases and 34/34 checks. No case's raw response contains `hydration_list_partial`.
