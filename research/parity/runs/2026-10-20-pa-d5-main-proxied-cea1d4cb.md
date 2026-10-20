# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only J04,J06,J07 --record research/parity/runs/2026-10-20-pa-d5-main-cea1d4cb.md`
Source commit: `010994dfd1cd499384d0f91966f14f2ff404dcc9`
Run: 2026-10-20T05:16:24.254Z → 2026-10-20T05:16:47.608Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 3 of 3 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 0/3; checks passing: 4/28.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 1/10 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field json.data.currency (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); field evidenceRecord.fieldEvidence./price.source (ER); field evidenceRecord.fieldEvidence./price.locator (ER) |
| J06 | https://www.allbirds.com/products/mens-tree-runner-nz-dark-navy?size=10 | 1/9 | field status (FS); field json.status (scrape-formats.json); field json.data.sku (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.currency (scrape-formats.json); fieldType json.data.price (scrape-formats.json); field evidenceRecord.fieldEvidence./sku.locator (ER) |
| J07 | https://parachutehome.com/products/linen-top-sheet-evergreen?variant=39746728165637 | 2/9 | field status (FS); field json.status (scrape-formats.json); field json.data.sku (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.currency (scrape-formats.json); fieldType json.data.price (scrape-formats.json); field evidenceRecord.fieldEvidence./price.locator (ER) |

Failed checks with the observed value:

- J04 [FS] field `status`: blocked
- J04 [scrape-formats.json] field `json.status`: incomplete
- J04 [scrape-formats.json] field `json.data.name`: absent
- J04 [scrape-formats.json] field `json.data.price`: absent
- J04 [scrape-formats.json] field `json.data.currency`: absent
- J04 [scrape-formats.json] jsonIssue `json.evidence`: []
- J04 [scrape-formats.json] jsonIssue `json.evidence`: []
- J04 [ER] field `evidenceRecord.fieldEvidence./price.source`: absent
- J04 [ER] field `evidenceRecord.fieldEvidence./price.locator`: absent
- J06 [FS] field `status`: blocked
- J06 [scrape-formats.json] field `json.status`: incomplete
- J06 [scrape-formats.json] field `json.data.sku`: absent
- J06 [scrape-formats.json] field `json.data.name`: absent
- J06 [scrape-formats.json] field `json.data.name`: absent
- J06 [scrape-formats.json] field `json.data.currency`: absent
- J06 [scrape-formats.json] fieldType `json.data.price`: undefined
- J06 [ER] field `evidenceRecord.fieldEvidence./sku.locator`: absent
- J07 [FS] field `status`: blocked
- J07 [scrape-formats.json] field `json.status`: incomplete
- J07 [scrape-formats.json] field `json.data.sku`: absent
- J07 [scrape-formats.json] field `json.data.name`: absent
- J07 [scrape-formats.json] field `json.data.currency`: absent
- J07 [scrape-formats.json] fieldType `json.data.price`: undefined
- J07 [ER] field `evidenceRecord.fieldEvidence./price.locator`: absent

## Engine (added when the record was written)

The runner ran from the D branch checkout, so "Source commit" above is the runner's and the case file's (`010994df`, which adds J06 and J07 and J04's new locator checks). The API it called on port 8787 ran `main` `cea1d4cb` from a detached checkout (`git worktree add --detach … origin/main`, before #620–#622 were merged); its responses report `evidenceRecord.extractor.version` `extract-tf/30`. This is the "reproduce on main first" run of PA D5.

Through the Clash proxy, both Shopify stores (J06, J07) answered HTTP 429 (`rate_limit`) on the HTTP lane, and jpc.de (J04) HTTP 451 (`geo_restricted`) after the browser lane. A plain curl through the same proxy got 429 from both stores too, and 200 direct, so the direct runs (`2026-10-20-pa-d5-*-direct-*.md`) are the comparison.

The file was renamed after the run to say it was proxied: the command above wrote it as the same name without `-proxied`.
