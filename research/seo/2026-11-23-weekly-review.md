# SEO weekly review 2026-11-23

Snapshot: 2026-11-23T015702Z, source commit bbd04eae, working tree clean (the only change is the tracker rewrite), run proxied. Compared with: 2026-11-16 (research/seo/2026-11-16-weekly-review.md, snapshot 2026-11-16T073325Z; that record is in PR #966, still open, as are the 2026-11-09 record in PR #905 and the 2026-11-02 record in PR #810, so none of them is on main yet).
Run by: scheduled task octocrawl-seo-weekly-review (Claude), for Howard (owner, decision S-04). Search Console window: 2026-10-25 to 2026-11-21 (28 days); newest day with data 2026-11-20.

## Needs your decision
- /tools/ and /tools/website-to-text/ are now about 6 weeks old and still not indexed. Both are "Discovered - currently not indexed" (read 2026-11-23); /tools/website-to-text/ moved from "URL is unknown to Google" (2026-11-09) to "Discovered", so Google now knows the URL but has not crawled it (no crawl time on either). This is the decision of 2026-11-02, 11-09 and 11-16, still unanswered: (a) use Request indexing on both in Search Console (UI-only, you do it), (b) add internal links to them (a site change, separate PR), or (c) wait another week. From framework 6.4 and the G-series index items. If it waits, nothing breaks; the two pages stay out of the index another week.
- Merge or close PR #810 (2026-11-02), PR #905 (2026-11-09) and PR #966 (2026-11-16). This week every URL was read, so the tracker on this branch no longer carries stale values, but each record still diffs against the 2026-10-28 record on main, and this PR will conflict on docs/seo/library/page-tracker.md with the three open ones (whichever merges last should keep its own tracker, since the script rewrites the whole table). From weekly-review.md step 9 (archive). If it waits, the archive on main stays four weeks behind.
- The Google AI Mode 12-question retest (Phase 0 milestones 2026-11-13 and 2026-11-20) has no result in the repository; both dates have passed. Run it, move the date, or drop it. From weekly-review.md milestones (framework phase 0). If it waits, the phase-0 baseline comparison stays open.

## Not read this week
- Bing Webmaster Tools "AI Performance" (both lists, Grounding Queries and Pages): not read. In Claude in Chrome both URLs redirected to the Bing Webmaster Tools landing page for signed-out visitors (retried once, same result); nothing was clicked and nobody signed in. Last read 2026-11-09. Unknown, not zero.
- Page-level first query: not in the snapshot; unknown for every page.
- Everything else was read: Search Console, URL Inspection 29 of 29, first-party site analytics, and the Search Console generative AI report.

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review (2026-11-16) | Change |
|---|---:|---:|---:|
| Impressions (28 days) | 4,194 | 13,247 | -9,053 |
| Clicks | 14 | 12 | +2 |
| Average position | 71.5 | 73.0 | -1.43 (better) |
| Impressions on pages averaging position 20 or better, of all | 377 of 4,320 (17 pages) | 331 of 13,624 (18 pages) | +46 |
| Visible queries naming octocrawl | 1 row, 13 impressions, 3 clicks | 1 row, 6 impressions, 1 click | +7 impressions, +2 clicks |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | 27 / 2 / 0 / 0 | 15 / 1 / 0 / 13 | all 29 read; no verdict change |
| Site visitors, last 7 days (visitor-days) | 79 (140 page views) | not read (timeout); 2026-11-09: 69 (92 page views) | +10 visitor-days against 2026-11-09 |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | 39 (27.86% of all): ChatGPT 39 views, 26 visitor-days | not read (timeout); 2026-11-09: 32, ChatGPT 32 views, 26 visitor-days | +7 views against 2026-11-09 |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day | 39, of which 39 tagged (100.00%); by day (views, tagged): 11-16 7, 7; 11-17 5, 5; 11-18 5, 5; 11-19 13, 13; 11-20 2, 2; 11-21 1, 1; 11-22 6, 6 | not read (timeout); 2026-11-09: 32, of which 32 tagged | tag still on every view |
| Search Console "generative AI" report | 41 total impressions; window from 30 September 2026 to 20 November 2026 (chart caption); top pages 10 of 10 (/ 24, /blog/find-all-pages-on-a-website/ 5, /blog/scrape-list-of-urls/ 4, /docs/ 4, /docs/contact/ 2, /blog/ 1, /blog/claude-code-web-scraping/ 1, /blog/extract-structured-data-from-web-page/ 1, /blog/scrape-website-with-login/ 1, /changelog/ 1). Read 2026-11-23 01:56 UTC with Claude in Chrome, read-only (.w2l/seo/manual-reads/2026-11-23/notes.md). No per-day, country or device numbers in this read. | not re-read on 2026-11-16; last read 2026-11-09: 22, window 2026-09-30 to 2026-11-06 | +19 over a window 14 days longer (cumulative from 09-30, so not a weekly rate) |
| Bing "AI Performance" | not read this week (signed-out landing page, see above); last read 2026-11-09, not re-read this week: Total Citations 0, Avg. Cited Pages 0, every day 0; window 2026-10-07 to 2026-11-05 (daily table); Grounding Queries and Pages lists both "No data available", 0 rows. Read 2026-11-09 01:59 UTC with Claude in Chrome, read-only | same reading (not re-read on 2026-11-16) | no new reading |

Data hygiene (framework 6.5): both Search Console windows are 28 days, so they are compared; the window moved seven days (newest day 2026-11-13 to 2026-11-20). The drop is one page again: /blog/find-all-pages-on-a-website/ went from 12,862 to 3,743 page impressions (-9,119, more than the property's -9,053) at average position 76.9 (was 74.1); its top queries all sit at position 72 to 78 with 0 clicks. Impressions at position 64 to 99 are not treated as growth, so their fall is not treated as a loss; that page gave 1 click. Outside that page the site grew a little: pages at position 20 or better have 377 impressions (331 a week ago); the home page / has 152 impressions, 11 clicks at position 19.0 (was 108, 10, 17.7); /tools/link-extractor/ 123 impressions at 52.1 (was 351 at 78.8); /changelog/ 92 at 5.9; /docs/ 51, 2 clicks, at 11.0. The page table (4,320) and the property total (4,194) are counted differently and are not reconciled. The brand row is a floor (hidden queries are not in the rows). The Google generative AI report counts from 2026-09-30 and its window grew 14 days since the last reading, so its two totals are not a like-for-like comparison; it is not added to the Bing report. The first-party figures are compared with 2026-11-09 because 2026-11-16 did not read them.

## Index changes since the last review
- No verdict changed (snapshot: none since 2026-11-16T073325Z). All 29 sitemap URLs were read; the 13 not read on 2026-11-16 are all PASS, as they were on 2026-11-09.
- /tools/website-to-text/: still NEUTRAL, coverage state "URL is unknown to Google" (2026-11-09) to "Discovered - currently not indexed" (2026-11-23); no crawl time.
- /tools/: still NEUTRAL, "Discovered - currently not indexed", no crawl time.

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|
| /tools/ | 2026-10-13 (in repo) | about 6 (week 8 on 2026-12-08) | NEUTRAL: Discovered - currently not indexed (2026-11-23) | none in page table (unknown) | unknown | see Needs your decision |
| /tools/website-to-text/ | 2026-10-13 (in repo) | about 6 | NEUTRAL: Discovered - currently not indexed (2026-11-23; was "URL is unknown to Google" 2026-11-09) | none in page table (unknown) | unknown | see Needs your decision |
| /tools/link-extractor/ | 2026-10-13 (in repo) | about 6 | PASS (2026-11-23) | yes: 123 impressions, 1 click, position 52.1 | unknown | was 351 at 78.8 on 2026-11-16 |
| /tools/url-to-markdown/ | 2026-10-13 (in repo) | about 6 | PASS (2026-11-23) | yes: 4 impressions, position 4.3 | unknown | |
| /scrape/ | 2026-10-13 (in repo) | about 6 | PASS (2026-11-23) | yes: 24 impressions, 0 clicks, position 21.7 | unknown | |
| /blog/hosted-crawl-and-batch-jobs/ | 2026-10-22 (publish) | about 4.5 (week 4 passed 2026-11-19) | PASS (2026-11-23) | none in page table (unknown) | unknown | week 4 evaluated: indexed, no impressions in the window |
| /blog/http-200-task-completion/ | 2026-10-16 (publish) | about 5.5 | PASS (2026-11-23) | none in page table (unknown) | unknown | indexed, no impressions |
| /blog/firecrawl-v1-migration/ | 2026-10-16 (publish) | about 5.5 | PASS (2026-11-23) | yes: 17 impressions at 10.5 | unknown | |
| /docs/scrape/ | 2026-10-18 (in repo) | about 5 | PASS (2026-11-23) | yes: 7 impressions at 28.6 | unknown | |
| Group D blogs: /blog/claude-code-web-scraping/, /blog/extract-structured-data-from-web-page/, /blog/scrape-list-of-urls/, /blog/scrape-website-with-login/, /blog/web-scraping-for-rag/ | 2026-10-10 (publish) | about 6 | PASS, all five (2026-11-23) | yes: 4 / 7 / 1 / 19 / 1 impressions (32 in all), positions 7.3 / 53.7 / 8.0 / 27.0 / 3.0; 0 clicks | unknown | below 100 impressions as a group (40 last week) |
| /, /docs/, /docs/connect-mcp/, /docs/guides/amazon-product/, /docs/guides/monitor-webhook/, /docs/limits/, /docs/reference/ | 2026-09-24 (in repo) | about 8.5 (week 8 passed 2026-11-19) | PASS, all seven (2026-11-23) | all have impressions: 152 / 51 / 5 / 1 / 3 / 7 / 20; positions 19.0 / 11.0 / 5.4 / 8.0 / 35.7 / 5.6 / 5.6 | unknown | week 8 evaluated: all indexed; only / and /docs/ get clicks (11 and 2) |

Pages that entered the repository in the last 8 weeks were checked against `git log` on apps/public-web: no commit touched apps/public-web since 2026-11-15, and no new site page was added since 2026-11-09.

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|
| Position change evaluation | At least 4 weeks after a batch launch, and at least 100 impressions per page group | Tools group (4 pages, about 6 weeks): 127 impressions, 123 of them on /tools/link-extractor/ at 52.1 (78.8 a week ago, 79.9 on 2026-11-09); 2 of 4 pages not indexed. Group D blogs: 32 impressions. Week-8 docs and home (7 pages): 239 impressions. | Tools: due, evaluated: link-extractor's average moved from 79 to 52 while its impressions fell from 351 to 123, so the gain may be the deep impressions dropping out rather than a better rank; not counted as a position gain; half the group still not indexed. Group D: not enough data. Week-8 group: due, evaluated: indexed, positions mostly under 12 on small volumes; no change judged. |
| Evidence-page pilot | After 4 weeks, most pages are "crawled, not indexed" or still have no impression | No evidence-page batch in the tracker | Not applicable |
| Duplicate or soft 404 | Most pages in a batch judged duplicate or soft 404 by Google | 0 FAIL of 29; the 2 NEUTRAL are "Discovered - currently not indexed" | Not triggered |
| Wedge switch | Day-45 review (2026-12-06) triggers "switch wedge to RAG builders" | 13 days away | Not due |

## GEO
Not started (protocol not approved).

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|
| 1 | Decide on /tools/ and /tools/website-to-text/: Request indexing (UI-only), internal links (site PR), or wait (carried from 2026-11-02, 11-09 and 11-16) | 6.4, G-series index items | Yes | Verdict PASS, or a decision recorded in decisions.md |
| 2 | Merge or close PRs #810, #905, #966 (and this one) so the archive and the comparison base on main are current | weekly-review.md step 9 (archive) | Yes (you merge weekly records) | All merged or closed |
| 3 | Sign in to Bing Webmaster Tools in your Chrome so next Monday's run can read AI Performance (both list URLs showed the signed-out landing page today; last read 2026-11-09) | weekly-review.md step 3 | Yes (your Chrome, your sign-in) | Next week's record has a 2026-11-30 Bing reading |
| 4 | Run, reschedule or drop the Google AI Mode 12-question retest (2026-11-13 and 2026-11-20 have passed with no result recorded) | Phase 0 milestone in weekly-review.md | Yes (manual) | Results recorded, or a new date in decisions.md |
| 5 | Decide whether to add a page-level query pull (first query per page) to the snapshot (carried from 2026-10-28) | 6.3 (page tracker) | Yes (script change) | Decision logged in decisions.md |
| 6 | Prepare the day-45 GTM review inputs (2026-12-06): Group B and Group D page numbers side by side | 6.4 wedge switch rule | No (review step) | Table in the 2026-12-07 record |

Done since the last review: action 5 of 2026-11-16 (evaluate the week-8 pages from 2026-09-24 and the week-4 checkpoint of /blog/hosted-crawl-and-batch-jobs/) was done above. Action 4 of 2026-11-16 (Claude in Chrome connected) is done for Google; Bing now needs a sign-in (action 3). Action 3 of 2026-11-16 (re-run URL Inspection and analytics) is no longer needed: this week's run read both in full.

## Library and framework updates made
- docs/seo/library/page-tracker.md: rewritten by the snapshot script from snapshot 2026-11-23T015702Z (29 rows changed, 0 added; 28-day figures moved to the 2026-10-25 to 2026-11-21 window; index states read for all 29 URLs). No other library or framework file was edited.

## Open questions and things that could not be checked
- The find-all-pages post lost another 70% of its impressions (12,862 to 3,743) at an unchanged deep position (74.1 to 76.9), on top of the 2026-10-27 cliff and last week's drop. Whether these impressions were ever real searches was not re-examined; nothing on the page changed in this window (no commit to apps/public-web since 2026-11-15).
- /tools/link-extractor/ average position moved 78.8 to 52.1 while impressions fell 351 to 123; which queries remain was not examined.
- /changelog/ shows 92 impressions at position 5.9; its queries were not examined.
- Why Bing Webmaster Tools redirected to the signed-out page (session expired, or something else) is not known; only the redirect was seen.
- Google's generative AI report: window start (2026-09-30) and the per-day, country and device split remain unknown in this read; they need an export.
- Live (deploy) dates of the tracked pages are not in the repository; checkpoint weeks use in-repo or publish dates.
- The first query per page is not in the snapshot; it is unknown for every page.
