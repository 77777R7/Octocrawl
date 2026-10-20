# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only J04,J06,J07 --record research/parity/runs/2026-10-20-pa-d5-main-direct-cea1d4cb.md`
Source commit: `010994dfd1cd499384d0f91966f14f2ff404dcc9`
Run: 2026-10-20T05:17:50.714Z → 2026-10-20T05:19:00.445Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 3 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/3; checks passing: 11/28.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 1/10 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field json.data.currency (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); field evidenceRecord.fieldEvidence./price.source (ER); field evidenceRecord.fieldEvidence./price.locator (ER) |
| J06 | https://www.allbirds.com/products/mens-tree-runner-nz-dark-navy?size=10 | 5/9 | field json.status (scrape-formats.json); field json.data.sku (scrape-formats.json); field json.data.name (scrape-formats.json); field evidenceRecord.fieldEvidence./sku.locator (ER) |
| J07 | https://parachutehome.com/products/linen-top-sheet-evergreen?variant=39746728165637 | 5/9 | field json.data.sku (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field evidenceRecord.fieldEvidence./price.locator (ER) |

Failed checks with the observed value:

- J04 [FS] field `status`: failed
- J04 [scrape-formats.json] field `json.status`: incomplete
- J04 [scrape-formats.json] field `json.data.name`: absent
- J04 [scrape-formats.json] field `json.data.price`: absent
- J04 [scrape-formats.json] field `json.data.currency`: absent
- J04 [scrape-formats.json] jsonIssue `json.evidence`: []
- J04 [scrape-formats.json] jsonIssue `json.evidence`: []
- J04 [ER] field `evidenceRecord.fieldEvidence./price.source`: absent
- J04 [ER] field `evidenceRecord.fieldEvidence./price.locator`: absent
- J06 [scrape-formats.json] field `json.status`: incomplete
- J06 [scrape-formats.json] field `json.data.sku`: absent
- J06 [scrape-formats.json] field `json.data.name`: Men's Tree Runner NZ - Dark Navy (Blizzard Sole)
- J06 [ER] field `evidenceRecord.fieldEvidence./sku.locator`: absent
- J07 [scrape-formats.json] field `json.data.sku`: FLTLNNEVGTXL
- J07 [scrape-formats.json] field `json.data.name`: Linen Top Sheet - Evergreen - Twin/Twin XL / Evergreen
- J07 [scrape-formats.json] field `json.data.price`: 110
- J07 [ER] field `evidenceRecord.fieldEvidence./price.locator`: absent

## Engine (added when the record was written)

The runner ran from the D branch checkout, so "Source commit" above is the runner's and the case file's (`010994df`, which adds J06 and J07 and J04's new locator checks). The API it called on port 8787 ran `main` `cea1d4cb` from a detached checkout (`git worktree add --detach … origin/main`, before #620–#622 were merged); its responses report `evidenceRecord.extractor.version` `extract-tf/30`. This is the "reproduce on main first" run of PA D5.

Direct: the API and the runner ran with no proxy variables. J04 (jpc.de) ended `failed` direct, as it ended `geo_restricted` through the proxy, so J04's checks, including the locator checks changed with this branch, were not exercised on 2026-10-20.
