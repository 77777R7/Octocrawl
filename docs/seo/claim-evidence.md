# Changed claims and evidence — 2026-10-16

All rows reviewed locally by Codex, not approved for external publication by Howard. Source baseline `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`; task-local code changes remain in this checkout. Evidence files below live under ignored `.w2l/seo-20261016/`.

| Claim / change | Source / evidence | Observed date | Mode / verification scope | Limitation / review status |
| --- | --- | --- | --- | --- |
| Capability hint sends URL in body, not request path | `src/main.ts` POST `/api/capability`; existing privacy doc; corrected shared Home FAQ/Schema | 16 Oct | Source and local rendering | Does not claim the entire site has no request logs |
| Link discovery is sitemap + start-page links, free cap 500 / sitemap files 50 | `packages/public-preview/src/map.ts`; `src/tools/mapResults.ts`; built and rendered tool | 16 Oct | Source and local rendering | Not full crawl or proof every sitemap URL was found; ready for local review |
| Heading/link/table/code conversion shown exactly | `conversion.json`; actual `htmlToMarkdown` → `markdownToText`; `conversionExample.ts` | 16 Oct | Synthetic fragment, local converter | Does not test acquisition or main-region selection; labelled in page |
| Markdown is a format choice, not universally best | Removed unsubstantiated superlative; no benchmark added | 16 Oct | Editorial correction | Token use depends on tokenizer/task |
| Copy proxy only follows resolved clipboard write | `analytics-tests.log`, `browser-qa.json`; changed senders | 16 Oct | Local HTTP receiver and browser | Counts action; cannot prove user’s real goal or field accuracy |
| Extracted map link absent from navigation events | Sender exclusion `.map-row`; actual receiver regression | 16 Oct | Synthetic DOM click + local HTTP reception | Existing result-link exclusions retained |
| DNT/GPC and beacon/fallback semantics preserved | Seven sender/receiver regression cases | 16 Oct | Local, no production event tests | Transport acceptance is not guaranteed long-term delivery |
| RAG skips partial/empty/failed/unready before chunking | Exact article Python block executed; `rag-fixtures.json`: 7 cases, 5 skipped, 3 chunks | 16 Oct | Synthetic client results | `not_requested` explicitly remains unverified; historical six-URL 47-chunk run not rerun |
| MCP connection does not prove task content | Existing `taskStatus.ts`, contracts and 13 rendered regression cases | 16 Oct | Source and response-injected browser | No new hosted client certification |
| Migration bridge is selected local v1 surface | Source, 24 parser cases, official firecrawl-js4.42.0 real requests; `followup/client/run.json` and `fixture-run.json` | 16 Oct | Real local API; public example plus10 synthetic-target acceptance cases | v2 fails; target errors/skip/expiry are rewritten by SDK; narrow v1 draft ready for content review, no hosted Firecrawl comparison |
| Current Firecrawl v2/deployment/billing documentation | [Introduction](https://docs.firecrawl.dev/introduction), [self-host](https://docs.firecrawl.dev/contributing/self-host), [pricing](https://www.firecrawl.dev/pricing), [license](https://github.com/firecrawl/firecrawl/blob/main/LICENSE) | 16 Oct | Official documentation | Not measured performance; ambiguous Monitor units excluded |
| HTTP 200 / no contract / failed target / source error differ | `quality-fixtures.json`; existing rendered suite | 16 Oct | Four synthetic display fixtures | No live-site detection/ranking claim; draft explicitly scoped |
| GSC current Web and AI report values | Original `gsc/` and `gsc-ai/` ZIP/CSV exports; `gsc-profile.json` | 16 Oct | Authenticated account data | Date coverage, aggregate grain and platform scope limits in measurement docs |
| Production source identity | `production-traffic.json`, `production-identity.json`, revision/image metadata | 16 Oct | Read-only authenticated Cloud Run | Production is baseline SHA; this worktree’s later edits are not deployed |

Rendered schema is parsed and compared with page purpose; no rich-result eligibility or AI-citation guarantee is claimed. Full URL/classification audit is in `audit-baseline.md`. No external profile correction, message, purchase, configuration change or publication is part of this ledger.

## Follow-up observations

- [Actual client procedure](firecrawl-client-verification.md):10/10 expected behavior checks, including negative paths; preserves wire status versus SDK exception. No extraction-engine or SDK patch.
- [AI baseline](ai-answer-sample-2026-10-16.md):12/12 Google AI Mode answers;6 literal name mentions,0 Octocrawl official inline citations, including wrong-entity answers. Signed-in/Auto, requested US, actual egress unknown; one sample only. ChatGPT/Perplexity gates retained.
- [Cloudflare](cloudflare-access-2026-10-16.md): authenticated seven-day event window,77 rows including10 verified-category AI Assistant BIC blocks;4 earlier rays exactly matched. Full rule configuration unread (403), no Google/Bing-wide conclusion and no rule changes.
