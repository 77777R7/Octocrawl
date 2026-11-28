# SEO weekly review 2026-11-09

Snapshot: 2026-11-09T015658Z, source commit 2c222af7, working tree clean (snapshot.json `dirty: false`; the only change is the tracker rewrite), run proxied. Compared with: 2026-11-02 (research/seo/2026-11-02-weekly-review.md, snapshot 2026-11-02T091631Z; that record is in PR #810, still open, so it is not on main yet).
Run by: scheduled task octocrawl-seo-weekly-review (Claude), for Howard (owner, decision S-04). Search Console window: 2026-10-11 to 2026-11-07 (28 days); newest day with data 2026-11-06.

## Needs your decision
- /tools/ and /tools/website-to-text/ reach their week-4 checkpoint on 2026-11-10 and are still not indexed: /tools/ stays "Discovered - currently not indexed", and /tools/website-to-text/ went from "Discovered - currently not indexed" (2026-11-02) to "URL is unknown to Google". Decide whether to (a) use Request indexing on both in Search Console (UI-only, you do it), (b) add internal links to them (a site change, separate PR), or (c) wait another week. From framework 6.4 and the G-series index items; action 1 of 2026-11-02. If it waits, nothing breaks; the two pages just stay out of the index another week.

## Not read this week
- Snapshot sources: none missing. Search Console, URL Inspection (29 of 29), sitemap and first-party analytics were all read.
- Search Console "generative AI" report: read (Claude in Chrome, 2026-11-09 01:59 UTC). Per-day, country and device numbers were not read (the page text has none and those tabs were not opened); unknown, not zero.
- Bing "AI Performance": read (Claude in Chrome, 2026-11-09 01:59 UTC), both the Grounding Queries list and the Pages list.
- Page-level first query: not in the snapshot; unknown for every page.

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review (2026-11-02) | Change |
|---|---:|---:|---:|
| Impressions (28 days) | 19,619 | 19,650 | -31 |
| Clicks | 12 | 9 | +3 |
| Average position | 72.8 | 73.0 | -0.1 (better) |
| Impressions on pages averaging position 20 or better, of all | 239 of 20,183 (15 pages) | 248 of 20,252 (18 pages) | -9 |
| Visible queries naming octocrawl | 0 rows, 0 impressions, 0 clicks | 0 rows, 0 impressions, 0 clicks | +0 |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | 27 / 2 / 0 / 0 (29 of 29 read) | 27 / 2 / 0 / 0 | no verdict change |
| Site visitors, last 7 days (visitor-days) | 69 (92 page views) | 67 (138 page views) | +2 visitor-days, -46 views |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | 32 (34.78% of all): ChatGPT 32 views, 26 visitor-days | 51 (36.96%): ChatGPT 51 views, 46 visitor-days | -19 views |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day | 32, of which 32 tagged (100.00%). By day (views, tagged): 11-02 3, 3; 11-03 8, 8; 11-04 4, 4; 11-05 7, 7; 11-06 2, 2; 11-07 3, 3; 11-08 5, 5 | 52, of which 52 tagged (100.00%) | -20 views; tag share unchanged |
| Search Console "generative AI" report | 22 total impressions; window from 2026-09-30 to 2026-11-06 (chart caption); top pages 8 of 8: / 11, /blog/scrape-list-of-urls/ 4, /docs/ 3, /blog/find-all-pages-on-a-website/ 2, /blog/ 1, /blog/claude-code-web-scraping/ 1, /blog/extract-structured-data-from-web-page/ 1, /changelog/ 1. Read 2026-11-09 01:59 UTC with Claude in Chrome, read-only (.w2l/seo/manual-reads/2026-11-09/notes.md) | 13 impressions, 2026-09-30 to 2026-10-31 (read 2026-11-02) | +9 over a window 6 days longer (the report's window grows from a fixed start); not a like-for-like comparison |
| Bing "AI Performance" | Total Citations 0, Avg. Cited Pages 0, every day 0; window 2026-10-07 to 2026-11-05 (daily table, 30 days); Grounding Queries and Pages lists both "No data available", 0 rows. Read 2026-11-09 01:59 UTC with Claude in Chrome, read-only. The page says the data is a sample; "No data available" does not say whether Bing found no citations or has not collected this site | 0 citations, 2026-10-07 to 2026-10-31 (read 2026-11-02) | no change |

Data hygiene (framework 6.5): both Search Console windows are 28 days, so they are compared; the window moved seven days (newest day 2026-10-31 to 2026-11-06). /blog/find-all-pages-on-a-website/ carries 19,226 of 20,183 page impressions at average position 73.5; impressions at position 64 to 99 are not treated as growth, so the flat total says nothing about progress. The home page / gained impressions (58 to 72) and clicks (8 to 9) but its average position moved from 15.3 to 17.3; on 2026-10-28 it was 4.2 on 34 impressions, so the home page is now shown for more, lower-ranked queries. Too few impressions to evaluate. The page table (20,183) and the property total (19,619) are counted differently and are not reconciled. Query rows are incomplete, so the brand row is a floor. The two AI reports have windows that are not 28 days and differ from each other; they are not added. First-party figures are rolling 7-day windows: the drop from 138 to 92 views and 51 to 32 AI-assistant views is one week against another, not yet a trend; ChatGPT tagging stayed at 100%, so the drop is fewer visits, not a lost tag.

## Index changes since the last review
- No verdict changed (snapshot: none since 2026-11-02T091631Z); counts stay 27 PASS, 2 NEUTRAL, 0 FAIL.
- /tools/website-to-text/: still NEUTRAL, but the coverage state moved from "Discovered - currently not indexed" (2026-11-02) to "URL is unknown to Google" (snapshot inspection.json; page-tracker diff).
- /tools/: still NEUTRAL, "Discovered - currently not indexed".

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
No page entered the repository since the last review: `git log --diff-filter=A` on apps/public-web since 2026-11-01 adds only two source modules (startList.ts in #814, tools/nextStep.ts in #812), no page, and blogPosts.mjs has no post with a pubDate after 2026-10-22 (scrape-list-of-urls has updatedDate 2026-11-07). The home page changed on 2026-11-03 (#814, new closing section); it is not a new page. Launch dates are first-commit or publish dates from page-tracker.md, not deploy dates, so weeks are approximate. Impressions are 28-day page-table figures from page-tracker.md.

| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|
| /blog/hosted-crawl-and-batch-jobs/ | 2026-10-22 (publish) | about 2.5 (18 days) | PASS | none in page table (unknown, not zero) | unknown | week-4 checkpoint about 2026-11-19 |
| /blog/firecrawl-v1-migration/ | 2026-10-16 (publish) | between 3 and 4 (24 days) | PASS | yes: 11 impressions, position 7.7 | unknown | |
| /blog/http-200-task-completion/ | 2026-10-16 (publish) | between 3 and 4 | PASS | none in page table (unknown) | unknown | |
| /docs/scrape/ | 2026-10-18 (in repo) | about 3 (22 days) | PASS | yes: 2 impressions, position 5.0 | unknown | |
| /tools/ | 2026-10-13 (in repo) | about 4 (27 days) | NEUTRAL: Discovered - currently not indexed | none in page table (unknown) | unknown | week 4 on 2026-11-10; see Needs your decision |
| /tools/website-to-text/ | 2026-10-13 (in repo) | about 4 | NEUTRAL: URL is unknown to Google (was Discovered on 2026-11-02) | none in page table (unknown) | unknown | week 4 on 2026-11-10; see Needs your decision |
| /tools/link-extractor/ | 2026-10-13 (in repo) | about 4 | PASS | yes: 580 impressions, position 79.9, 0 clicks | unknown | |
| /tools/url-to-markdown/ | 2026-10-13 (in repo) | about 4 | PASS | yes: 3 impressions, position 64.3 | unknown | |
| /scrape/ | 2026-10-13 (in repo) | about 4 | PASS | yes: 41 impressions, 1 click, position 23.6 | unknown | |
| Group D blogs: /blog/claude-code-web-scraping/, /blog/extract-structured-data-from-web-page/, /blog/scrape-list-of-urls/, /blog/scrape-website-with-login/, /blog/web-scraping-for-rag/ | 2026-10-10 (publish) | about 4 (30 days; checkpoint 2026-11-07 passed) | PASS (all five) | yes: 21 / 17 / 9 / 28 / 2 impressions (77 in all), positions 67.1 / 52.4 / 20.3 / 26.8 / 6.5; 1 click (scrape-list-of-urls) | unknown | below 100 impressions as a group; see decision rules |

Nothing is at 8 weeks (before 2026-09-14): the oldest pages are from 2026-09-24 (about 6.5 weeks).

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|
| Position change evaluation | At least 4 weeks after a batch launch, and at least 100 impressions per page group | Group D blogs passed 4 weeks (30 days) but have 77 impressions as a group; tools are at 27 days (4 weeks on 2026-11-10); only the find-all-pages post and the link extractor exceed 100 impressions, at position 73 to 80 | Group D: not enough data; tools: not due. Position is not evaluated |
| Evidence-page pilot | After 4 weeks, most pages are "crawled, not indexed" or still have no impression | No evidence-page batch in the tracker | Not applicable |
| Duplicate or soft 404 | Most pages in a batch judged duplicate or soft 404 by Google | 0 FAIL; the 2 NEUTRAL are "Discovered - currently not indexed" and "URL is unknown to Google", neither duplicate nor soft 404 | Not triggered |
| Wedge switch | Day-45 review (2026-12-06) triggers "switch wedge to RAG builders" | 27 days away | Not due |

## GEO
Not started (protocol not approved).

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|
| 1 | Decide on /tools/ and /tools/website-to-text/ at their week-4 checkpoint (2026-11-10): Request indexing (UI-only), internal links (site PR), or wait (carried from 2026-11-02 action 1) | 6.4, G-series index items | Yes | Verdict PASS, or a decision recorded in decisions.md |
| 2 | Run the Google AI Mode 12-question retest on 2026-11-13 and 2026-11-20 | Phase 0 milestone in weekly-review.md | Yes (manual) | Results recorded |
| 3 | Decide whether to add a page-level query pull (first query per page) to the snapshot; "first query" is still unknown for every checkpoint page (carried from 2026-10-28) | 6.3 (page tracker) | Yes (script change) | Decision logged in decisions.md |
| 4 | Re-evaluate Group D blogs when the group reaches 100 impressions in a 28-day window; evaluate the tools group at week 4 in next week's review | 6.4 | No (review step) | Rule rows filled |
| 5 | Merge or close PR #810 (the 2026-11-02 record) so this record's comparison base is on main | weekly-review.md step 9 (archive) | Yes (you merge weekly records) | #810 merged or closed |

Done since the last review: action 4 of 2026-11-02 (evaluate Group D at week 4) was done above; the result is "not enough data".

## Library and framework updates made
- docs/seo/library/page-tracker.md: rewritten by the snapshot script from snapshot 2026-11-09T015658Z (29 rows updated, 0 added; read dates moved to 2026-11-09, 28-day figures to the 2026-10-11 to 2026-11-07 window, /tools/ and /tools/website-to-text/ coverage states updated). Because PR #810 is not merged, the diff on this branch is against the 2026-10-28 tracker. No other library or framework file was edited.

## Open questions and things that could not be checked
- Live (deploy) dates of the tracked pages are not in the repository; checkpoint weeks use in-repo or publish dates.
- The first query per page is not in the snapshot; it is unknown for every page.
- Why /tools/website-to-text/ went from "Discovered" to "URL is unknown to Google" is not known; URL Inspection gives no reason, and no crawl time is recorded for either tools page.
- Google's generative AI report: per-day, country and device split not read (needs an export). Why its range starts on 2026-09-30 is still unknown.
- Bing AI Performance: whether 0 citations means none or "not collected yet" is still unknown.
- The fall in first-party views (138 to 92) and AI-assistant views (51 to 32) was not examined beyond the summary; one week is not a trend.
- The 19,226 impressions on one post at position 73.5 were not re-examined.
