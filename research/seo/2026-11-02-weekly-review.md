# SEO weekly review 2026-11-02

Snapshot: 2026-11-02T091631Z, source commit b93c766a, working tree clean (snapshot.json `dirty: false`; the only change is the tracker rewrite), run proxied. Compared with: 2026-10-28 (research/seo/2026-10-28-weekly-review.md, snapshot 2026-10-28T035016Z).
Run by: scheduled task octocrawl-seo-weekly-review (Claude), for Howard (owner, decision S-04). Search Console window: 2026-10-04 to 2026-10-31 (28 days); newest day with data 2026-10-31.

## Needs your decision
Nothing this week.

(For information, no decision: both AI reports were read this week in your signed-in Chrome, read-only. Google's generative AI report shows 13 impressions from 2026-09-30 to 2026-10-31; Bing AI Performance still shows 0 citations. The open items from 2026-10-28 (week-4 check of /tools/ and /tools/website-to-text/ around 2026-11-10, the AI Mode retest on 2026-11-13 and 2026-11-20, and the page-level query question) are carried below; none is due yet.)

## Not read this week
- Snapshot sources: none missing. Search Console, URL Inspection (29 of 29), sitemap and first-party analytics were all read.
- Search Console "generative AI" report: read (Claude in Chrome, 2026-11-02). Per-day, country and device numbers were not read (the page text has none and those tabs were not opened); unknown, not zero.
- Bing "AI Performance": read (Claude in Chrome, 2026-11-02), both the Grounding Queries list and the Pages list.

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review (2026-10-28) | Change |
|---|---:|---:|---:|
| Impressions (28 days) | 19,650 | 17,465 | +2,185 |
| Clicks | 9 | 6 | +3 |
| Average position | 73.0 | 72.2 | +0.73 (worse) |
| Impressions on pages averaging position 20 or better, of all | 248 of 20,252 (18 pages) | 190 of 18,032 (19 pages) | +58 |
| Visible queries naming octocrawl | 0 rows, 0 impressions, 0 clicks | 0 rows, 0 impressions, 0 clicks | +0 |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | 27 / 2 / 0 / 0 (29 of 29 read) | 27 / 2 / 0 / 0 | no change |
| Site visitors, last 7 days (visitor-days) | 67 (138 page views) | 60 (112 page views) | +7 visitor-days, +26 views |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | 51 (36.96% of all): ChatGPT 51 views, 46 visitor-days | 38 (33.93%): ChatGPT 38 views, 32 visitor-days | +13 views |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day | 52, of which 52 tagged (100.00%). By day (views, tagged): 10-26 10, 10; 10-27 12, 12; 10-28 9, 9; 10-29 3, 3; 10-30 5, 5; 10-31 7, 7; 11-01 6, 6 | 39, of which 39 tagged (100.00%) | +13 views; tag share unchanged |
| Search Console "generative AI" report | 13 total impressions; window from 2026-09-30 to 2026-10-31 (chart caption); top pages 6 of 6: / 5, /blog/scrape-list-of-urls/ 4, /blog/extract-structured-data-from-web-page/ 1, /blog/find-all-pages-on-a-website/ 1, /changelog/ 1, /docs/ 1. Read 2026-11-02 09:18 UTC with Claude in Chrome, read-only (.w2l/seo/manual-reads/2026-11-02/notes.md) | 9 impressions, 2026-09-30 to 2026-10-25 (Howard's export and a Chrome read on 2026-10-28, found after that review was written; the 2026-10-28 record said "not read") | +4 over a window 6 days longer; not a like-for-like comparison |
| Bing "AI Performance" | Total Citations 0, Avg. Cited Pages 0, every day 0; window 2026-10-07 to 2026-10-31 (daily table); Grounding Queries and Pages lists both "No data available", 0 rows. Read 2026-11-02 09:18 UTC with Claude in Chrome, read-only. The page says the data is a sample; "No data available" does not say whether Bing found no citations or has not collected this site | 0 citations, 2026-10-07 to 2026-10-25 (same 2026-10-28 notes) | no change |

Data hygiene (framework 6.5): both Search Console windows are 28 days, so they are compared; the window moved six days (newest day 2026-10-25 to 2026-10-31). /blog/find-all-pages-on-a-website/ carries 19,306 of 20,252 page impressions at average position 73.5, so most of the +2,185 impressions and the slightly worse average position come from position 64 to 99 and are not treated as growth. The 8 clicks on / and the 248 impressions at position 20 or better are the useful signal, but too small to evaluate. The page table (20,255; 20,252 on https://octocrawl.dev) and the property total (19,650) are counted differently and are not reconciled. Query rows are incomplete, so the brand row is a floor. The two AI reports have windows that are not 28 days and differ from each other; they are not added. First-party figures are rolling 7-day windows, so the change is not a trend.

## Index changes since the last review
- No verdict changed (snapshot: none since 2026-10-28T035016Z); counts stay 27 PASS, 2 NEUTRAL, 0 FAIL.
- /tools/: still NEUTRAL, but the coverage state moved from "URL is unknown to Google" to "Discovered - currently not indexed" (page-tracker diff).
- /tools/website-to-text/: still NEUTRAL, "Discovered - currently not indexed".

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
No page entered the repository since the last review (`git log --diff-filter=A` on apps/public-web since 2026-10-27 adds no page; blogPosts.mjs has no post after 2026-10-22). Launch dates are first-commit or publish dates from page-tracker.md, not deploy dates, so weeks are approximate.

| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|
| /blog/hosted-crawl-and-batch-jobs/ | 2026-10-22 (publish) | about 2 (11 days) | PASS | none in page table (unknown, not zero) | unknown | week-2 checkpoint; no impressions yet |
| /blog/firecrawl-v1-migration/ | 2026-10-16 (publish) | between 2 and 4 (17 days) | PASS | yes: 11 impressions, position 7.7 | unknown | |
| /blog/http-200-task-completion/ | 2026-10-16 (publish) | between 2 and 4 | PASS | none in page table (unknown) | unknown | |
| /docs/scrape/ | 2026-10-18 (in repo) | about 2 (15 days) | PASS | yes: 1 impression, position 7.0 | unknown | |
| /tools/ | 2026-10-13 (in repo) | about 3 (20 days) | NEUTRAL: Discovered - currently not indexed | none in page table (unknown) | unknown | week-4 check due about 2026-11-10 |
| /tools/website-to-text/ | 2026-10-13 (in repo) | about 3 | NEUTRAL: Discovered - currently not indexed | none in page table (unknown) | unknown | week-4 check due about 2026-11-10 |
| /tools/link-extractor/ | 2026-10-13 (in repo) | about 3 | PASS | yes: 569 impressions, position 79.8, 0 clicks | unknown | |
| /tools/url-to-markdown/ | 2026-10-13 (in repo) | about 3 | PASS | yes: 3 impressions, position 64.3 | unknown | |
| /scrape/ | 2026-10-13 (in repo) | about 3 | PASS | yes: 35 impressions, 1 click, position 25.2 | unknown | |
| /docs/acceptable-use/, /docs/contact/, /docs/privacy/, /docs/terms/ | 2026-10-02 (in repo) | about 4 (31 days) | PASS (all four) | yes: 6 / 6 / 8 / 5 impressions, positions 6.1 to 8.2 | unknown | legal pages, no target keyword; week-4 checkpoint passed |

Group D blogs (2026-10-10) are at about 3 weeks (23 days); their week-4 checkpoint is 2026-11-07. Nothing is at 8 weeks (before 2026-09-07): the oldest pages are from 2026-09-24.

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|
| Position change evaluation | At least 4 weeks after a batch launch, and at least 100 impressions per page group | Group D blogs 23 days, tools 20 days; only the find-all-pages post and the link extractor exceed 100 impressions, at position 70 to 80 | Not due; position is not evaluated |
| Evidence-page pilot | After 4 weeks, most pages are "crawled, not indexed" or still have no impression | No evidence-page batch in the tracker | Not applicable |
| Duplicate or soft 404 | Most pages in a batch judged duplicate or soft 404 by Google | 0 FAIL; both NEUTRAL are "Discovered - currently not indexed" | Not triggered |
| Wedge switch | Day-45 review (2026-12-06) triggers "switch wedge to RAG builders" | 34 days away | Not due |

## GEO
Not started (protocol not approved).

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|
| 1 | Re-check /tools/ and /tools/website-to-text/ at the week-4 checkpoint (about 2026-11-10); if still "Discovered - currently not indexed", decide on internal links or Request indexing (UI-only) | 6.4, G-series index items | Yes for any change to links or indexing requests | Verdict PASS, or a recorded decision |
| 2 | Run the Google AI Mode 12-question retest on 2026-11-13 and 2026-11-20 | Phase 0 milestone in weekly-review.md | Yes (manual) | Results recorded |
| 3 | Decide whether to add a page-level query pull (first query per page) to the snapshot; "first query" is still unknown for every checkpoint page (carried from 2026-10-28) | 6.3 (page tracker) | Yes (script change) | Decision logged in decisions.md |
| 4 | Evaluate the Group D blog batch at its week-4 checkpoint (2026-11-07) in next week's review; position is still evaluated only for groups with at least 100 impressions | 6.4 | No (review step) | Rule row filled next week |

Done since the last review: action 1 of 2026-10-28 (read the two AI reports): Howard exported both and the weekly task now reads them in Chrome; figures are in the table above.

## Library and framework updates made
- docs/seo/library/page-tracker.md: rewritten by the snapshot script from snapshot 2026-11-02T091631Z (29 rows updated, 0 added; read dates moved to 2026-11-02, 28-day window to 2026-10-04 to 2026-10-31, /tools/ coverage state updated). No other library or framework file was edited.

## Open questions and things that could not be checked
- Live (deploy) dates of the tracked pages are not in the repository; checkpoint weeks use in-repo or publish dates.
- The first query per page is not in the snapshot; it is unknown for every page.
- Google's generative AI report: per-day, country and device split for this window not read (needs an export). Why the report's range starts on 2026-09-30 is still unknown.
- Bing AI Performance: whether 0 citations means none or "not collected yet" is still unknown.
- The 19,306 impressions on one post at position 73.5 were not re-examined.
