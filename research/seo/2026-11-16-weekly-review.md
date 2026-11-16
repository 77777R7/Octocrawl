# SEO weekly review 2026-11-16

Snapshot: 2026-11-16T073325Z, source commit bbd04eae, working tree clean (snapshot.json `dirty: false`; the only change is the tracker rewrite), run proxied. A first snapshot the same morning, 2026-11-16T060417Z, read the same Search Console numbers but fewer URLs (13 of 29); the second run was the one allowed retry and is the one used here. Compared with: 2026-11-09 (research/seo/2026-11-09-weekly-review.md, snapshot 2026-11-09T015658Z; that record is in PR #905, still open, as is the 2026-11-02 record in PR #810, so neither is on main yet).
Run by: scheduled task octocrawl-seo-weekly-review (Claude), for Howard (owner, decision S-04). Search Console window: 2026-10-18 to 2026-11-14 (28 days); newest day with data 2026-11-13.

## Needs your decision
- /tools/ and /tools/website-to-text/ are now about 5 weeks old and still not indexed. /tools/ is "Discovered - currently not indexed" (read 2026-11-16); /tools/website-to-text/ was not read this week (last read 2026-11-09: "URL is unknown to Google"). This is the 2026-11-09 decision, still unanswered: (a) use Request indexing on both in Search Console (UI-only, you do it), (b) add internal links to them (a site change, separate PR), or (c) wait another week. From framework 6.4 and the G-series index items; action 1 of 2026-11-02 and 2026-11-09. If it waits, nothing breaks; the two pages stay out of the index another week.
- Merge or close PR #810 (2026-11-02) and PR #905 (2026-11-09). Until they are merged, the page tracker on main still carries 2026-10-28 values for every URL a snapshot cannot read, and this week 13 URLs were not read, so the tracker on this branch shows some stale "(2026-10-28)" index states (for example /tools/website-to-text/ as "Discovered" though 2026-11-09 read "URL is unknown to Google"). From weekly-review.md step 9 (archive). If it waits, each new record diffs against an older base.

## Not read this week
- First-party site analytics (visitors, AI-assistant page views, ChatGPT tagging): not read in either snapshot run; the reader timed out (`spawnSync ... ETIMEDOUT`). Unknown, not zero.
- URL Inspection: 13 of 29 sitemap URLs not read in the snapshot used (timeouts and socket errors through the proxy). Across both runs today 17 of 29 were read at least once; 12 were read in neither: /blog/claude-code-web-scraping/, /blog/extract-structured-data-from-web-page/, /blog/find-all-pages-on-a-website/, /blog/firecrawl-v1-migration/, /blog/http-200-task-completion/, /blog/scrape-list-of-urls/, /blog/scrape-website-with-login/, /blog/web-scraping-for-rag/, /docs/, /docs/connect-mcp/, /scrape/, /tools/website-to-text/. Their index state this week is unknown.
- Search Console "generative AI" report: not read this week. The Claude in Chrome connection dropped twice before the tab left the new-tab page (one retry, as allowed); no report page loaded, nothing was clicked, and the tab was closed. Last read 2026-11-09.
- Bing "AI Performance": not read this week, same reason (both list pages). Last read 2026-11-09.
- Page-level first query: not in the snapshot; unknown for every page.

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review (2026-11-09) | Change |
|---|---:|---:|---:|
| Impressions (28 days) | 13,247 | 19,619 | -6,372 |
| Clicks | 12 | 12 | +0 |
| Average position | 73.0 | 72.8 | +0.11 (worse) |
| Impressions on pages averaging position 20 or better, of all | 331 of 13,624 (18 pages) | 239 of 20,183 (15 pages) | +92 |
| Visible queries naming octocrawl | 1 row, 6 impressions, 1 click ("octocrawl", position 2.3) | 0 rows, 0 impressions, 0 clicks | +1 row |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | 15 / 1 / 0 / 13 (16 of 29 read) | 27 / 2 / 0 / 0 | no verdict change among URLs read |
| Site visitors, last 7 days (visitor-days) | not read (timeout) | 69 (92 page views) | unknown |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | not read (timeout) | 32: ChatGPT 32 views, 26 visitor-days | unknown |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day | not read (timeout) | 32, of which 32 tagged (100.00%) | unknown |
| Search Console "generative AI" report | last read 2026-11-09, not re-read this week: 22 total impressions; window 2026-09-30 to 2026-11-06 (chart caption); top pages 8 of 8 (/ 11, /blog/scrape-list-of-urls/ 4, /docs/ 3, /blog/find-all-pages-on-a-website/ 2, /blog/ 1, /blog/claude-code-web-scraping/ 1, /blog/extract-structured-data-from-web-page/ 1, /changelog/ 1). Read 2026-11-09 01:59 UTC with Claude in Chrome, read-only (.w2l/seo/manual-reads/2026-11-09/notes.md) | same reading | no new reading |
| Bing "AI Performance" | last read 2026-11-09, not re-read this week: Total Citations 0, Avg. Cited Pages 0, every day 0; window 2026-10-07 to 2026-11-05 (daily table); Grounding Queries and Pages lists both "No data available", 0 rows. Read 2026-11-09 01:59 UTC with Claude in Chrome, read-only | same reading | no new reading |

Data hygiene (framework 6.5): both Search Console windows are 28 days, so they are compared; the window moved seven days (newest day 2026-11-06 to 2026-11-13). The whole drop is one page: /blog/find-all-pages-on-a-website/ went from 19,226 to 12,862 page impressions (-6,364 of the page table's -6,559) at average position 74.1 (was 73.5). Impressions at position 64 to 99 are not treated as growth, so their fall is not treated as a loss either; 0 to 1 click came from them. The pages at position 20 or better gained (239 to 331 impressions, 15 to 18 pages): the home page / 108 impressions, 10 clicks, position 17.7 (was 72, 9, 17.3); /changelog/ 82 at 5.6; /docs/ 45, 3 clicks, at 10.7. Too few impressions to evaluate position. The page table (13,624) and the property total (13,247) are counted differently and are not reconciled. Query rows are incomplete (111 rows, not full), so the brand row is a floor; it is the first visible brand row since these reviews began. The two AI reports were not re-read; their old readings are not compared with anything.

## Index changes since the last review
- No verdict changed among the URLs read (snapshot: none since 2026-11-16T060417Z; none of the 16 differs from 2026-11-09).
- /tools/: still NEUTRAL, "Discovered - currently not indexed", no crawl time.
- 13 URLs not read (see above); their state is unknown, not unchanged.

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|
| /tools/ | 2026-10-13 (in repo) | about 5 (week 4 passed 2026-11-10) | NEUTRAL: Discovered - currently not indexed (2026-11-16) | none in page table (unknown) | unknown | see Needs your decision |
| /tools/website-to-text/ | 2026-10-13 (in repo) | about 5 | not read (last: NEUTRAL, URL is unknown to Google, 2026-11-09) | none in page table (unknown) | unknown | see Needs your decision |
| /tools/link-extractor/ | 2026-10-13 (in repo) | about 5 | PASS (2026-11-16) | yes: 351 impressions, position 78.8, 0 clicks | unknown | was 580 at 79.9 on 2026-11-09 |
| /tools/url-to-markdown/ | 2026-10-13 (in repo) | about 5 | PASS (2026-11-16) | yes: 3 impressions, position 4.3 | unknown | |
| /scrape/ | 2026-10-13 (in repo) | about 5 | not read (last: PASS) | yes: 33 impressions, 0 clicks, position 24.4 | unknown | |
| /blog/firecrawl-v1-migration/, /blog/http-200-task-completion/ | 2026-10-16 (publish) | about 4.5 (week 4 passed 2026-11-13) | not read (last: PASS) | firecrawl-v1-migration yes: 17 impressions at 6.6; http-200-task-completion none in page table (unknown) | unknown | |
| /docs/scrape/ | 2026-10-18 (in repo) | about 4 (week 4 on 2026-11-15) | PASS (2026-11-16) | yes: 4 impressions at 3.5 | unknown | |
| /blog/hosted-crawl-and-batch-jobs/ | 2026-10-22 (publish) | about 3.5 (week 4 on 2026-11-19) | PASS (2026-11-16) | none in page table (unknown) | unknown | evaluate next week |
| Group D blogs: /blog/claude-code-web-scraping/, /blog/extract-structured-data-from-web-page/, /blog/scrape-list-of-urls/, /blog/scrape-website-with-login/, /blog/web-scraping-for-rag/ | 2026-10-10 (publish) | about 5 | not read (last: PASS, all five) | yes: 3 / 11 / 3 / 22 / 1 impressions (40 in all), positions 6.0 / 57.5 / 19.0 / 28.2 / 3.0; 0 clicks | unknown | below 100 impressions as a group (77 last week) |
| /, /docs/, /docs/connect-mcp/, /docs/guides/amazon-product/, /docs/guides/monitor-webhook/, /docs/limits/, /docs/reference/ | 2026-09-24 (in repo) | about 7.5 (week 8 on 2026-11-19) | PASS where read (/ , amazon-product, monitor-webhook, limits, reference); /docs/ and /docs/connect-mcp/ not read | all have impressions (see page tracker) | unknown | week-8 checkpoint falls before next review; evaluate on 2026-11-23 |

Pages that entered the repository in the last 8 weeks were checked against `git log` on apps/public-web: no new site page was added since 2026-11-09 (#915, #920 and #932 changed existing pages and code only).

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|
| Position change evaluation | At least 4 weeks after a batch launch, and at least 100 impressions per page group | Tools group (4 pages, about 5 weeks): 354 impressions, 351 of them on /tools/link-extractor/ at 78.8 (79.9 a week ago, 80.0 on 2026-10-28); 2 of 4 pages not indexed. Group D blogs: 40 impressions. | Tools: due, evaluated: no position gain; the group's impressions are one page at position 79, and half the group is not indexed. Group D: not enough data |
| Evidence-page pilot | After 4 weeks, most pages are "crawled, not indexed" or still have no impression | No evidence-page batch in the tracker | Not applicable |
| Duplicate or soft 404 | Most pages in a batch judged duplicate or soft 404 by Google | 0 FAIL among 16 read; the 1 NEUTRAL is "Discovered - currently not indexed" | Not triggered (13 URLs unknown) |
| Wedge switch | Day-45 review (2026-12-06) triggers "switch wedge to RAG builders" | 20 days away | Not due |

## GEO
Not started (protocol not approved).

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|
| 1 | Decide on /tools/ and /tools/website-to-text/: Request indexing (UI-only), internal links (site PR), or wait (carried from 2026-11-02 and 2026-11-09) | 6.4, G-series index items | Yes | Verdict PASS, or a decision recorded in decisions.md |
| 2 | Merge or close PR #810 and PR #905 so the tracker and the comparison base on main are current | weekly-review.md step 9 (archive) | Yes (you merge weekly records) | Both merged or closed |
| 3 | Re-run URL Inspection and site analytics when the network is steadier (this week both timed out through the proxy), or accept the gap for this week | 6.5 (data hygiene; unknown is not zero) | No (agent can re-run on request); yes if you want it done today | The 13 URLs and the first-party figures read, or the gap left as recorded |
| 4 | Check that Claude in Chrome is connected before next Monday's run, so the two AI reports can be read (they were last read 2026-11-09) | weekly-review.md step 3 | Yes (your Chrome) | Next week's record has a 2026-11-23 reading |
| 5 | Evaluate the week-8 pages from 2026-09-24 and the week-4 checkpoint of /blog/hosted-crawl-and-batch-jobs/ in next week's review | 6.4 | No (review step) | Rows filled on 2026-11-23 |
| 6 | Run the Google AI Mode 12-question retest; the 2026-11-13 date has passed and no result is recorded in the repository; 2026-11-20 is next | Phase 0 milestone in weekly-review.md | Yes (manual) | Results recorded |
| 7 | Decide whether to add a page-level query pull (first query per page) to the snapshot (carried from 2026-10-28) | 6.3 (page tracker) | Yes (script change) | Decision logged in decisions.md |

Done since the last review: action 4 of 2026-11-09 (evaluate the tools group at week 4) was done above; the result is "no position gain".

## Library and framework updates made
- docs/seo/library/page-tracker.md: rewritten by the snapshot script from snapshot 2026-11-16T073325Z (27 rows changed, 0 added; 28-day figures moved to the 2026-10-18 to 2026-11-14 window; index states updated for the 16 URLs read). Rows for the 13 URLs not read keep the value already on main, which is from 2026-10-28 because PRs #810 and #905 are not merged. No other library or framework file was edited.

## Open questions and things that could not be checked
- Why both snapshot runs timed out on site analytics and on about half of URL Inspection is not known; both runs went through the proxy, as the task requires. Not investigated further.
- Why the Claude in Chrome connection dropped is not known; the extension tab group was reachable (a tab was created and later closed) but each batch of page reads lost its connection before the first navigation.
- The find-all-pages post lost a third of its impressions at an unchanged position (73.5 to 74.1); the 2026-10-27 GSC cliff showed the same kind of drop. Whether these impressions are real searches was not re-examined.
- /changelog/ shows 82 impressions at position 5.6; its queries were not examined.
- Live (deploy) dates of the tracked pages are not in the repository; checkpoint weeks use in-repo or publish dates.
- The first query per page is not in the snapshot; it is unknown for every page.
- Google's generative AI report and Bing AI Performance: the open questions of 2026-11-09 (window start, per-day split, whether 0 citations means none) stand; no new reading.
