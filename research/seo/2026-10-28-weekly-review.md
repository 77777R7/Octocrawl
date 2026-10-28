# SEO weekly review 2026-10-28

Snapshot: 2026-10-28T035016Z, source commit 6ee57f2a, working tree clean (snapshot.json `dirty: false`; the only change is the tracker rewrite), run proxied. Compared with: none (first review). For reference the table uses the earlier snapshot 2026-10-27T174019Z (commit 5f6f6563) in the "Last review" column; that snapshot is not a review.
Run by: scheduled task octocrawl-seo-weekly-review (Claude). Search Console window: 2026-09-29 to 2026-10-26 (28 days); newest day with data 2026-10-25.

## Needs your decision
Nothing this week.

(Two things for information, no decision: the Search Console figures did not move because the newest day with data is still 2026-10-25; and the Search Console "generative AI" and Bing "AI Performance" reports were not read, see below.)

## Not read this week
- Search Console "generative AI" report: no documented API, needs a manual read. Unknown, not zero.
- Bing "AI Performance" report: no documented API, needs a manual read. Unknown, not zero.
- Snapshot sources: none missing. Search Console, URL Inspection (29 of 29), sitemap and first-party analytics were all read.

## Numbers (copied from the snapshot summary)
| Metric | Now | Last review (snapshot 2026-10-27T174019Z) | Change |
|---|---:|---:|---:|
| Impressions (28 days) | 17,465 | 17,465 | +0 |
| Clicks | 6 | 6 | +0 |
| Average position | 72.2 | 72.2 | +0 |
| Impressions on pages averaging position 20 or better, of all | 190 of 18,032 (19 pages) | 190 of 18,032 (19 pages) | +0 |
| Visible queries naming octocrawl | 0 rows, 0 impressions, 0 clicks | 0 | +0 |
| Sitemap URLs read by URL Inspection, PASS / NEUTRAL / FAIL / not read | 27 / 2 / 0 / 0 (29 of 29 read) | 27 / 2 / 0 / 0 | no change |
| Site visitors, last 7 days (visitor-days) | 60 (112 page views) | 49 (90 page views) | +11 visitor-days, +22 views |
| Page views from AI assistants, last 7 days (at least; direct is not counted), by assistant | 38 (33.93% of all): ChatGPT 38 views, 32 visitor-days | not recorded in that snapshot (unknown) | n/a |
| ChatGPT page views by tag or referrer, and how many carry utm_source=chatgpt.com, by day | 39, of which 39 tagged (100.00%). By day (views, tagged): 10-23 5, 5; 10-24 7, 7; 10-25 5, 5; 10-26 10, 10; 10-27 12, 12 | not recorded (unknown) | n/a |
| Search Console "generative AI" report and Bing "AI Performance" | not read | not read | n/a |

Data hygiene (framework 6.5): the window is 28 days in both snapshots, but the newest day with data is 2026-10-25 in both, so "+0" means Search Console has no newer day, not that nothing happened. One page, /blog/find-all-pages-on-a-website/, carries 17,176 of 18,032 page impressions at average position 72.7; impressions at position 64 to 99 are not treated as growth. The page table sums to 18,035 impressions and the property total is 17,465; the two are counted differently and are not reconciled. Query rows are not complete (queryRowsFull false), so the brand row is a floor. The first-party week (112 views) differs from the earlier snapshot's week (90 views) because the 7-day window moved, not because of a method change; the earlier snapshot's script version differs (sha 0265ab5c5d9e vs 6c9397b854d4).

## Index changes since the last review
- No change in counts (27 PASS, 2 NEUTRAL, 0 FAIL). The snapshot reports no verdict changed since 2026-10-28T031014Z. The tracker diff against 2026-10-27 shows only read dates changing.
- Still NEUTRAL: /tools/ ("URL is unknown to Google") and /tools/website-to-text/ ("Discovered - currently not indexed").

## New pages at a checkpoint (weeks 2, 4, 8 after launch)
The live launch date is not recorded in the repository; the dates below are the first-commit or publish dates in the tracker, so weeks are approximate and the real launch may be later.

| Page | Launched | Week | Index verdict | First impression | First query | Note |
|---|---|---|---|---|---|---|
| /tools/link-extractor/ | 2026-10-13 (in repo) | about 2 (15 days) | PASS | yes: 562 impressions in 28 days, position 80.0, 0 clicks | unknown (not read per page) | not due for evaluation |
| /tools/url-to-markdown/ | 2026-10-13 (in repo) | about 2 | PASS | yes: 2 impressions, position 92.0 | unknown | |
| /tools/website-to-text/ | 2026-10-13 (in repo) | about 2 | NEUTRAL: Discovered - currently not indexed | none in page table (unknown, not zero) | unknown | candidate for a note at week 4 |
| /tools/ | 2026-10-13 (in repo) | about 2 | NEUTRAL: URL is unknown to Google | none in page table (unknown) | unknown | |
| /scrape/ | 2026-10-13 (in repo) | about 2 | PASS | yes: 30 impressions, 1 click, position 27.9 | unknown | |
| /blog/firecrawl-v1-migration/ | 2026-10-16 | about 2 (12 days) | PASS | yes: 2 impressions, position 15.0 | unknown | |
| /blog/http-200-task-completion/ | 2026-10-16 | about 2 | PASS | none in page table (unknown) | unknown | |
| /docs/acceptable-use/, /docs/contact/, /docs/privacy/, /docs/terms/ | 2026-10-02 (in repo) | about 4 (26 days) | PASS (all four) | yes: 5 / 5 / 7 / 5 impressions, positions 6.4 to 9.0 | unknown | legal pages, no target keyword |

Pages published 2026-10-22 or later (/blog/hosted-crawl-and-batch-jobs/): week 1, below the first checkpoint; PASS, no page-table row yet. Nothing in the repository entered at 8 weeks (before 2026-09-02): the oldest pages are from 2026-09-24.

## Decision rules (framework 6.4)
| Rule | Condition | This week | Status |
|---|---|---|---|
| Position change evaluation | At least 4 weeks after a batch launch, and at least 100 impressions per page group | Newest batches are about 2 weeks old (tools, 2026-10-13; Group D blogs, 2026-10-10, 18 days). The only group above 100 impressions is the find-all-pages post and link extractor at position 70 to 80 | Not due; position is not evaluated |
| Evidence-page pilot | After 4 weeks, most pages are "crawled, not indexed" or still have no impression | No evidence-page batch exists yet in the tracker | Not applicable |
| Duplicate or soft 404 | Most pages in a batch judged duplicate or soft 404 by Google | 0 FAIL, 0 other; the 2 NEUTRAL are "unknown to Google" and "Discovered - currently not indexed", not duplicate or soft 404 | Not triggered |
| Wedge switch | Day-45 review (2026-12-06) triggers "switch wedge to RAG builders" | 39 days away | Not due |

## GEO
Not started (protocol not approved).

## Actions
| # | Action | Framework item | Needs Howard | Done when |
|---|---|---|---|---|
| 1 | Read the Search Console "generative AI" report and Bing "AI Performance" by hand and add the figures to next week's record | 6.2 (weekly metrics) | Yes (manual login) | Both figures, or "not available", written in the next review |
| 2 | Re-check /tools/ and /tools/website-to-text/ at the week-4 checkpoint (about 2026-11-10); if still not indexed, decide on internal links or Request indexing (a UI-only step) | 6.4 (evidence/index rule), G-series index items | Yes for any change to links or indexing requests | Verdict PASS, or a recorded decision |
| 3 | Run the Google AI Mode 12-question retest on 2026-11-13 and 2026-11-20 | Phase 0 milestone in weekly-review.md | Yes (manual) | Results recorded |
| 4 | Decide whether to add a page-level query pull (first query per page) to the snapshot, since "first query" is unknown for every checkpoint page | 6.3 (page tracker) | Yes (script change) | Decision logged in decisions.md |

## Library and framework updates made
- docs/seo/library/page-tracker.md: rewritten by the snapshot script from snapshot 2026-10-28T035016Z (29 rows updated, 0 added; read dates and the 28-day window moved to 2026-09-29 to 2026-10-26). No other library or framework file was edited.

## Open questions and things that could not be checked
- Actual live (deploy) dates of the tracked pages are not in the repository; checkpoint weeks use in-repo dates.
- The first query per page is not in the snapshot; it is unknown for every page.
- Why the 17,176 impressions on one post at position 72.7 persist (earlier note: unrelated to our traffic) was not re-examined.
- The 7-day first-party figures cover a different week from the earlier snapshot, so the +11 visitor-days is a rolling-window comparison, not a trend.
