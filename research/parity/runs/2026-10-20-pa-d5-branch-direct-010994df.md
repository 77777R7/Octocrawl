# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only J04,J06,J07 --record research/parity/runs/2026-10-20-pa-d5-branch-direct-010994df.md`
Source commit: `010994dfd1cd499384d0f91966f14f2ff404dcc9`
Run: 2026-10-20T05:19:00.546Z → 2026-10-20T05:19:50.122Z against http://127.0.0.1:8789
Network: NO_PROXY set in the runner's environment; 0 of 3 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 2/3; checks passing: 19/28.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| J04 | https://www.jpc.de/jpcng/books/detail/-/art/die-augenheilkunde/hnum/11617379 | 1/10 | field status (FS); field json.status (scrape-formats.json); field json.data.name (scrape-formats.json); field json.data.price (scrape-formats.json); field json.data.currency (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); jsonIssue json.evidence (scrape-formats.json); field evidenceRecord.fieldEvidence./price.source (ER); field evidenceRecord.fieldEvidence./price.locator (ER) |
| J06 | https://www.allbirds.com/products/mens-tree-runner-nz-dark-navy?size=10 | 9/9 | — |
| J07 | https://parachutehome.com/products/linen-top-sheet-evergreen?variant=39746728165637 | 9/9 | — |

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

## Engine (added when the record was written)

The API on port 8789 ran this checkout at the source commit above; its responses report `evidenceRecord.extractor.version` `extract-tf/31`.

Direct: the API and the runner ran with no proxy variables. J04 (jpc.de) ended `failed` direct, as it ended `geo_restricted` through the proxy, so J04's checks, including the locator checks changed with this branch, were not exercised on 2026-10-20.
