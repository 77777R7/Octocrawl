# PA item 9: competitor baseline, window 1 (2026-10-09)

ROADMAP PA item 9 and the bar decided on 2026-10-09: on item 1's frozen set, Octocrawl's enhanced route is to reach at least the best competitor's verified completion with no more false successes, or the record names the gap.

## How it was run

- 2026-10-09 01:56–02:16 UTC, source `3cde6e8` (clean), the whole task file (`--set all`, 92 tasks: 50 frozen, 3 unstable, 25 healthy, 14 blind), cold attempts, the same Markdown predicates for every arm (method in the header of `research/access/run-set.mjs`).
- Four arms, one record each:
  - Octocrawl default: a local API on 8797, no grant, fresh task root ([record](2026-10-09-pa9-w1-octocrawl-default-3cde6e8.md)).
  - Octocrawl best: a local API on 8798 with `W2L_ACCESS_GRANT={"tier":"standard","capabilities":["compatible_transport"]}`, the compatible transport on its five default hosts, fresh task root; run after the default arm, so the two never fetched a site at once ([record](2026-10-09-pa9-w1-octocrawl-best-3cde6e8.md)). Octocrawl has no provider route yet (PA item 4), so this is its strongest route today.
  - Firecrawl Cloud: `POST /v2/scrape`, `proxy: auto`, `maxAge: 0`, `storeInCache: false`, free plan ([record](2026-10-09-pa9-w1-firecrawl-3cde6e8.md)).
  - ZenRows: Fetch API, `mode=auto`, `response_type=markdown`, free plan ([record](2026-10-09-pa9-w1-zenrows-3cde6e8.md)).
- Network: both Octocrawl arms proxied through the machine's Clash forward proxy `127.0.0.1:7890` (TUN on), whose exit is a subscription's data-centre node; the competitors fetch from their own clouds, and the driver reached their APIs through the same proxy. The competitor arms ran at the same time as the Octocrawl arms.
- Not run: Octoparse (decided 2026-10-09: each URL needs a task built in its app, and cloud runs need its $249 plan).

## Results

| 92 tasks | Octocrawl default | Octocrawl best | Firecrawl | ZenRows |
| --- | --- | --- | --- | --- |
| Frozen (50) verified | 2 | 6 | **35** | 29 |
| Unstable (3) verified | 3 | 1 | 2 | 1 |
| Healthy (25) verified | 23 | 23 | 21 | 20 |
| Blind (14) verified | 8 | 8 | 12 | 8 |
| All verified | 36 | 38 | **70** | 58 |
| False successes | 9 | **7** | 12 | 19 |
| p50 / p95 ms | 2,912 / 11,408 | 2,685 / 8,566 | 3,401 / 9,606 | 4,706 / 66,952 |
| Credits (inferred) | — | — | 82 | unknown |

- Against the bar: on the frozen set the best competitor is Firecrawl at 35 of 50; Octocrawl's best route verified 6. The gap is 29 tasks. Octocrawl's false successes are the fewest (7 against Firecrawl's 12).
- Where the gap is: of the 35 tasks Firecrawl verified and Octocrawl's best route did not, Octocrawl's answer was `blocked` on 21 (`cloudflare_challenge` 10, `bot_detected_generic` 9, `rate_limit` 2), `failed` on 9 (`http_error` 4, `empty_unverified` 3, `connection_error` 1, `timeout` 1), `blocked` behind a login wall on 1, and `success` with a failing predicate on 4. By kind: 23 listings, 4 pages, 3 tables, 2 dynamic, 2 products, 1 document. Octocrawl verified 3 tasks Firecrawl did not (T058, T079, T080). No arm verified 15 tasks.
- Cost: Firecrawl billed one credit per document returned, 82 for 70 verified (about 1,171 credits per 1,000 verified; about $3.75 at the Hobby plan's annual price of $16 for 5,000 credits, $0 on the free plan used here). ZenRows' credits per success are unknown (mode=auto does not say which configuration it billed); its dashboard total for the run is to be added.

## Reading, not isolated

The difference sits almost wholly on sites with bot defences: on the healthy controls Octocrawl verified as many as either competitor or more. The suspected causes (the data-centre exit Octocrawl's arms used, against providers' proxy networks; the browser's fingerprint; challenges Octocrawl does not solve) are not isolated by this run: each arm changes several things at once.

## Owed

- A second window on another day, as for every PA set.
- ZenRows' credit total from its dashboard.
- Isolating the gap: Octocrawl's best route through a residential exit on the 35 tasks, and with a provider route once PA item 4 exists.
