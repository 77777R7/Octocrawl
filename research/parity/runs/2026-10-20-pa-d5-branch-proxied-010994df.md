# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only J04,J06,J07 --record research/parity/runs/2026-10-20-pa-d5-branch-010994df.md`
Source commit: `010994dfd1cd499384d0f91966f14f2ff404dcc9`
Run: 2026-10-20T05:16:47.696Z → 2026-10-20T05:17:06.507Z against http://127.0.0.1:8789
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

The API on port 8789 ran this checkout at the source commit above; its responses report `evidenceRecord.extractor.version` `extract-tf/31`.

Blocked the same way as the main run through the proxy (J06, J07 HTTP 429; J04 HTTP 451). See the direct runs.

The file was renamed after the run to say it was proxied: the command above wrote it as the same name without `-proxied`.
