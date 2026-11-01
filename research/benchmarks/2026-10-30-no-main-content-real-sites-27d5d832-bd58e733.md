# Pages with no main region, before and after PR #794, 2026-10-30

A record of a real-site check run on 2026-10-30 (UTC) for PR https://github.com/77777R7/Octocrawl/pull/794. Without
the PR, a rendered page with no main region is `failed`/`empty_unverified`. With it, such a page whose whole-page
Markdown is over 1,000 characters is answered `success` with that Markdown and a `no_main_content` warning.

It covers 16 URLs from the Firecrawl Scrape Content Dataset v1:
- the 14 rows that `research/benchmarks/2026-10-30-firecrawl-1k-failure-analysis.md` lists as "content fetched,
  status withheld it" for `empty_unverified`;
- rows 39 and 326, which the analysis predicted would become successes holding none of the truth text.

This is not a run of the 1,000-row set. **No Firecrawl call was made and no paid service was used.**

## What ran

- Before: source `27d5d832` (`origin/main`, clean tree). The API was started with `W2L_API_PORT=8787 npm run api`,
  which builds before it starts. Fetched 15:49:11Z–15:49:40Z.
- After: source `bd58e733` (the PR's commit).
  - Built with `npx tsc --build`, then started with `W2L_API_PORT=8787 node --import tsx packages/api/src/cli.ts`.
  - The tree was uncommitted at the time but identical to `bd58e733`: no source file changed between the run and the
    commit.
  - The `research/access/run-set.mjs` dist check was not run.
  - Fetched 17:21:15Z–17:21:35Z.
- Request, the same for each URL in both runs:
  `POST http://127.0.0.1:8787/v1/scrape {"url": <url>, "formats": ["markdown", "rawHtml"], "debug": true}`, four at a
  time, from a script outside the repository.
- Network: **proxied** through `HTTPS_PROXY=127.0.0.1:7890` (the Evidence Record's `proxy`), as in the benchmark runs.
  Not run direct.
- Truth share: the share of the dataset row's unique `truth_text` words, tokenized as in the harness, found in the
  Markdown. Row 326 has no truth text, so its share is unknown.
- An earlier after-run on a draft of the PR, before the review fixes, gave the same status for every row. It is
  superseded by the run recorded here.

## Results

| Row | URL | Before (`27d5d832`) | After (`bd58e733`) | Markdown chars (before → after) | Truth share (after) |
|---:|---|---|---|---:|---:|
| 6 | lms.leanderisd.org/campus_information/fine-arts | failed / empty_unverified | success, no_main_content | 21,264 → 21,264 | 1.00 |
| 140 | scanpy.readthedocs.io/…/scanpy.p… | failed / empty_unverified | success, no_main_content | 33,324 → 33,324 | 1.00 |
| 209 | hoo.be/savannahraedemers | failed / empty_unverified | success, no_main_content | 2,716 → 2,716 | 0.89 |
| 283 | valleyot.com/az-duarte/ | failed / empty_unverified | success, no_main_content | 1,915 → 1,897 | 0.67 |
| 410 | animaldiversity.org/…/classification/ | failed / empty_unverified | success, no_main_content | 3,908 → 3,908 | 1.00 |
| 482 | pappysfinefoods.com/combo-packs | failed / empty_unverified | success, no_main_content | 6,154 → 6,154 | 0.57 |
| 517 | alexkademusic.com/links | failed / empty_unverified | success, no_main_content | 2,757 → 2,757 | 1.00 |
| 518 | omr.com/de/reviews/contenthub/tag/web3 | failed / empty_unverified | success, no_main_content | 8,772 → 8,772 | 1.00 |
| 904 | secretberryspa.com/our-services/facial | failed / empty_unverified | success, no_main_content | 6,471 → 6,471 | 1.00 |
| 915 | dicht-o-fix.de/kontakt | failed / empty_unverified | success, no_main_content | 2,651 → 2,651 | 0.71 |
| 63 | ericciarla.com/ | failed / empty_unverified | failed / empty_unverified | 249 → 249 | 1.00 (withheld) |
| 399 | help-teller.more.com/…/3392038-… | failed / empty_unverified | failed / empty_unverified | 915 → 915 | 1.00 (withheld) |
| 906 | passthekeys.com/…/book_a_call_button | failed / empty_unverified | failed / empty_unverified | 157 → 157 | 0.62 (withheld) |
| 676 | distinctivedoordesigns.com/…/maplepaintgrade/ | failed / empty_unverified | failed / empty_unverified | 51 → 51 | 0.00 |
| 39 | ui.kws3.media/v4/?path=/docs/forms-timepicker--docs | not fetched live (A2 baseline, `2aaad1f4`: failed / empty_unverified) | success, no_main_content | 3,596 (after) | 0.07 |
| 326 | kidstuffcatalog.com/catalog/page-80/ | not fetched live (A2 baseline, `2aaad1f4`: failed / empty_unverified) | success, no_main_content | 2,157 (after) | unknown (no truth text) |

Every row's HTTP status was 200 and its lane `browser_local` in both runs.

- Of the 14 rows, 10 became `success` with the page's text (truth share 0.57–1.00).
- Rows 63, 399 and 906 hold their text in under 1,000 characters and stay failed. Their Markdown is kept as evidence,
  as before.
- Row 676 served 51 characters in both runs, against 3,043 in the 2026-10-29 benchmark run: the page answered
  differently, not the build.
- Rows 39 and 326 became `success` on their site chrome (a Storybook docs frame, a catalog's navigation), with the
  warning. This is the cost of the rule: the stored-data estimate for arm A2 was 11 pages matching and 3 hollow pages
  among its 50 `empty_unverified` rows.

## Notes

- Row 410 carried `robots_overridden` before and not after. In the before-run the site's robots.txt timed out
  (`unreachable: "timeout"`, recorded as an override of a URL the caller named). In the after-run it was read and
  allowed the page. This is the site's robots.txt answering differently, not the PR.
- The raw answers are in a temporary session scratchpad on Howard's Mac and are not committed.
