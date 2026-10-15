# AI visibility observations and repeatable sample — 2026-10-16

## Actual account observation

Authenticated GSC exposes **Generative AI features (Beta)** under Performance. [Saved report](https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Aoctocrawl.dev&start_date=20260916&end_date=20261013&compare_start_date=20260819&compare_end_date=20260915): 16 Sep–13 Oct 2026, all countries/devices, reports **2 impressions**, both attributed to `https://octocrawl.dev/blog/scrape-list-of-urls/`. Previous 19 Aug–15 Sep displays 0. The inspected report exposes impressions and page/country/device/day dimensions; it did not expose question text, individual answers, citations, model versions, or brand mentions. UI last update was 5.5 hours ago. No click or stable recommendation claim is inferred.

Original ZIP and CSVs retained under `.w2l/seo-20261016/gsc-ai/`. This is an observed report capability for this account/date, not a claim about all GSC accounts. Conventional Web exports are kept separately. Do not sum or compare those surfaces as if their definitions were identical.

## Fixed questions for answer sampling

English; target United States; new chat per question; logged-in platform/model and search mode recorded explicitly. Browser egress was not established as US. Run once, then a second independent sample on a later date with identical settings; preserve raw answers and actual cited URLs. These questions are **not yet sampled** on ChatGPT, Perplexity or Google AI answers; GSC aggregate impressions do not answer them.

| ID | Type | Exact question | Intended source |
| --- | --- | --- | --- |
| B1 | Brand | What is Octocrawl and who is it for? | Home |
| B2 | Brand | What does Octocrawl verification.status mean? | Reference/limits |
| B3 | Brand | Can hosted Octocrawl crawl a whole website? | MCP/limits |
| S1 | Setup | How do I add Octocrawl MCP to Claude Code? | MCP |
| S2 | Setup | How do I connect a web scraping MCP server to Codex? | MCP |
| S3 | Setup | What should I check after my MCP scraper returns HTTP 200? | MCP/result case |
| T1 | Task | How do I convert a public URL to Markdown and keep its links? | Markdown tool |
| T2 | Task | How can I extract a web page as plain text without link addresses? | Text tool |
| T3 | Task | How do I find a website's pages if its sitemap is incomplete? | Discovery article |
| T4 | Task | How can I scrape pages for RAG while keeping source URLs and hashes? | RAG |
| C1 | Choice | Can I replace a Firecrawl v2 client with Octocrawl's local v1 shim? | Migration draft; not public yet |
| C2 | Choice | When should I choose Octocrawl instead of Firecrawl? | Migration draft; not public yet |

Record each attempt as: `sample_id / question_id / exact_question / platform / displayed_model / mode / search_enabled / language / requested_region / observed_region_or_unknown / observed_at_with_timezone / answer_present / brand_mentioned / cited_urls / official_vs_third_party / description_accuracy / raw_evidence_path`. Unavailable or gated is `not_tested`, never false/zero. Distinguish answer absent, answer with no citation, brand mention, official citation, third-party citation and site visit. Do not convert occurrence counts into stable rankings.

## Search access and site changes

Google’s [AI-features guidance](https://developers.google.com/search/docs/appearance/ai-features) describes ordinary search eligibility, crawlability, text content and relevant internal links; eligibility does not guarantee inclusion. No special AI file/schema engineering or fixed paragraph length was added. Existing llms resources and FAQ remain for their actual uses. No unverified bot-specific claims from the generic AI-SEO playbook were adopted. This round does not require altering training-crawler policy. A future bot-policy question must use that vendor’s current official search/training/user-fetch distinction.

## External identity review

| Source | Observed identity / limitation | Proposed follow-up |
| --- | --- | --- |
| Live site | Octocrawl; hosted and local paths visible | Local tool promises now match bounds; production unchanged |
| [GitHub repo](https://github.com/77777R7/Octocrawl) and README at baseline | Brand aligned; description still says “checked fields” | Explain scope through existing verification docs; no repository metadata write |
| [npm octocrawl](https://www.npmjs.com/package/octocrawl) registry | 0.4.2, AGPL-3.0-only, repository points to Octocrawl | No package publication; source branch is newer than release |
| [npm SDK](https://www.npmjs.com/package/@octocrawl/sdk) registry | 0.4.2, MIT, same repository | Keep package-specific license distinctions; do not call every package AGPL |
| PyPI / external directories | Not freshly verified in this batch | Refresh actual entries before proposing exact external edits; no outreach authorized |

No new profiles, endorsements, submissions, purchases, messages, recurring monitors or external edits were made. Answer-platform sampling remains deferred; the local question set and observed GSC evidence are usable now.
