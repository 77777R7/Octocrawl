# Data-center research partner pilot: frozen seven-source regression sample

Observed 2026-09-28 (UTC). This is a **previously seen regression sample**, frozen in commit `333fa93` before this run. The manifest SHA-256 is `b28ca2e114787e96444ca56ec563e2acf2f3e5fbf922704f25b205fac14149c4`. It is not a holdout, a claim about the partner's unknown research question, or a regression-model-ready dataset. The fixed seven URLs and rules are in [`research/datacenter-partner-pilot-manifest.v1.json`](../../research/datacenter-partner-pilot-manifest.v1.json).

Codex used the configured local W2L MCP service at `http://127.0.0.1:8791/mcp`. The listener was healthy and its executable path was under the clean `codex/c2-c3-remote-mcp` checkout at `c8b897aee9a8f50e73d87f05cbed3ed3e1071de9`. The endpoint does not attest that the compiled `dist` bytes correspond to that commit; this is separate from the deployed Cloud Run preview and is not implied to be on `main`. The single `batch_scrape` task `8e51445b-50a2-45ae-8e00-42802586beac` completed 7/7 items. Item status was **4 success, 1 blocked, 2 failed**. “Completed” describes the batch workflow, not seven successful captures. The full MCP item response remains in a private ignored `.w2l/partner-pilot/frozen-batch-items.json` file; the committed [run summary](../../research/datacenter-partner-pilot/run-2026-09-28.json) contains every URL, status, reason, capture time, final URL and raw-body hash where available. It also records the private artifact hash for local audit.

| Frozen source | Observed result | What can be used |
| --- | --- | --- |
| [DOE 2024 release](https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers) | success | The captured sentence supports 2014 and 2023 **modeled estimates** of 58 and 176 TWh, plus 2028 **projection bounds** of 325–580 TWh. |
| [DOE data-center hub](https://www.energy.gov/powering-americas-ai-future-data-center-resource-hub) | success | Readable report context; not a replacement for the underlying report data table. |
| [EIA 2024 state profiles](https://www.eia.gov/electricity/state/) | success | 51 state/DC electricity rows. These are contextual electricity variables, **not** data-center electricity use. |
| [EIA 2023 archive](https://www.eia.gov/electricity/state/archive/2023/) | failed, `policy_denied` | The MCP trace recorded a robots rule matching `/*archive/`; no 2023 rows were inferred or substituted. |
| [Census CBP dataset catalog](https://www.census.gov/programs-surveys/cbp/data/datasets.html) | success | Catalog text only, not the contents of a ZIP/CSV dataset. |
| [LBNL 2024 report landing](https://eta-publications.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report) | blocked, `cloudflare_challenge` | No report values were extracted from this blocked capture. |
| [Census 2023 state ZIP](https://www2.census.gov/programs-surveys/cbp/datasets/2023/cbp23st.zip) | failed, `connection_error` | No ZIP contents were captured. A separate ordinary HTTP HEAD returned 200, `application/zip`, 11,115,845 bytes; that is source availability evidence, not a W2L data pull. |

The [DOE example CSV](../../research/datacenter-partner-pilot/doe-datacenter-energy-evidence.csv) has four source-backed values but only two historical years; high and low 2028 projections are separate rows and must not be treated as independent historical observations. The [EIA example CSV](../../research/datacenter-partner-pilot/eia-state-electricity-2024.csv) has one row per state/DC for 2024, 51 unique keys and populated positive numeric fields. State generation and retail-sales sums match the displayed U.S. total. Summed state net summer capacity is 4 MW above the displayed U.S. total; this discrepancy is retained rather than silently corrected. Every exported row carries its source URL, raw-body hash and capture time. The exporter, [`scripts/section-c/export-datacenter-partner-pilot.mjs`](../../scripts/section-c/export-datacenter-partner-pilot.mjs), checks the exact frozen URL set and these CSV invariants against the private MCP item response.

The public Cloud Run preview is a distinct single-page product: a fresh `POST /mcp` initialize request returned HTTP 405. Its current URL is **not** a partner-ready MCP endpoint. The local service can support a guided Codex pilot, but a self-service external invitation needs an authenticated hosted MCP, independent client onboarding, quotas suited to the task, and a successful task from the partner's own environment. W2L has not demonstrated generic PDF/ZIP ingestion here. The partner must first specify dependent/explanatory variables, geography, years, unit of analysis, target URLs and access terms; then a new manifest should be frozen for those actual sources. Do not call this sample unseen, count a catalog page as dataset acquisition, use industry 518210 as an exact data-center count, or claim that these two CSVs form a valid regression panel.

To repeat the export after a **new** fixed-source W2L MCP batch, save the `get_batch_items` response as a JSON object with `taskId`, `items` and the observed local `operatorCheckoutCommit`, then run:

```bash
node scripts/section-c/export-datacenter-partner-pilot.mjs \
  .w2l/partner-pilot/frozen-batch-items.json \
  .w2l/partner-pilot/exports
```

A change in source table shape or a missing source-backed value fails the exporter rather than filling a value. The outputs of a new run must be reviewed and labeled with its own date; this 2026-09-28 report remains an immutable observation.
