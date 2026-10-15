# Octocrawl: explicit list items as task content

Date: 2026-10-15, Asia/Shanghai. Baseline: `9884e66c7d8addb361c94930df4d299220e98439` (main with #506). Fix: `cb6c3fa8de47f0ee14dbd5c9026df629db54530a`, `extract-tf/27`.

An explicit list request previously read records from raw HTML while its Markdown could select a neighbouring article, or fall back to the whole page. A caller's region exclusions could also be absent from Markdown but reappear in record values. The fix uses one explicit single-page list candidate for Markdown/HTML/tables, with explicit include selections taking precedence; scoped records retain original selector context, base URL and original item match indexes.

## Targeted captures before the fix

These are diagnostic requests, not scheduled acceptance rounds. The frozen `e8b75c97` worktree, script, tasks, grant and schedule were not changed. A separate API on port 8796 used the existing grant read-only, `HTTPS_PROXY` and `HTTP_PROXY` set to `http://127.0.0.1:7890`; actual exit IP and egress cost were not measured. No paid provider calls were recorded.

The baseline API was started with `node --import tsx packages/api/src/cli.ts --port 8796`, `W2L_CAPTURE_RAW_DIR=.w2l/task-extraction/captures`, `W2L_SOURCE_COMMIT=9884e66c7d8addb361c94930df4d299220e98439`, and the existing installed-Chrome grant file supplied through `W2L_ACCESS_GRANT`.

```sh
NO_PROXY=localhost,127.0.0.1,::1 W2L_API_URL=http://127.0.0.1:8796 node research/access/run-set.mjs --set all --only T011,T012,T060 --access '"enhanced"' --raw-html --save-responses --request '{"timeout":60000,"debug":true,"formats":["markdown","html","rawHtml","tables"]}'
```

| Task | Observation | Frozen predicates |
| --- | --- | --- |
| T011 | Two video cards in the same raw capture; article extraction was empty. The raw card contents survived cleaning, but were not selected by the article cascade. | Failed |
| T012 | Final Markdown was navigation; the requested product/price checks failed. | False success |
| T060 | The target data checks failed; output still had an empty/unavailable-data state. The exact missing-data cause remains unresolved. | False success |

All three stay in this diagnostic denominator: 0/3 verified, 2 false successes. Nothing here fixes Walmart or Nasdaq. The captures are development evidence, not held-out samples.

## One task with an explicit list request

The fix was then tested through the live API at `cb6c3fa8` on TikTok with `formats: ["markdown", "html", "rawHtml", list]`, `access: "enhanced"`, `timeout: 60000`, `maxAge: 0`, and a `recordFields` check requiring description, author and authorUrl in at least one record. The list used `article[data-e2e="recommend-list-item-container"]`, description from `[data-e2e="video-desc"]`, and author text/href from `a[href^="/@"]`. These selectors are a request, not site-specific product logic.

At 2026-10-15 12:58:38 +08, the response was `success`, `verification: passed`, two records; HTTP and browser_local were attempted, and browser_local answered. Raw SHA-256: `c532bbd9698b0cfaa5bc12aa45dac6f5f89dbd6dc5696be3e7365dc91753ac4c`. The response's extractor is `extract-tf/27` at `cb6c3fa8`, with `content_selected: { basis: "list_items", candidates: 1 }`. The server was stopped afterwards.

An independent reading of the original HTML located the two card containers and each description and author/href. All 6 requested fields agreed with the delivered records; their capture hash and raw line/column positions are recorded locally. This annotation was made by the assistant, not yet reviewed by a non-author human. A stable video permalink was not requested or verified. There is no held-out accuracy claim.

Offline replay of the earlier TikTok capture (`7c096af0082aab20471f45a23dcc19647d24bd81177618ac1bf8ebf7c96e6d01`) showed that a baseline explicit list request already returned the same 6/6 fields, but included navigation in its Markdown fallback. The fix retains those fields and narrows Markdown to the cards. It does not establish a field-accuracy increase from zero, a new pass of frozen T011, or a stable access-rate improvement. The original frozen Markdown predicates are unchanged and may still fail on correctly scoped records.

Raw HTML, original requests/responses, per-attempt hashes and annotations remain git-ignored in the development worktree under `.w2l/access/runs/` and `.w2l/task-extraction/` (`capture-manifest.json`, `live-list/independent-review.json`). The record intentionally commits no raw feed or user data.

## Validation and boundaries

- The synthetic neighbouring-article/region-exclusion regression produced 3 failures before the fix and passed after it. Normal extraction and explicit whole-page selection are controls.
- HTTP/browser integration, provider transport simulation and an actual API response test cover selected content, corresponding record fields, exclusions, base URL and evidence hashes/indexes. The provider check makes no paid call.
- `npm run typecheck`: passed.
- `npm test`: 236 files, 2,878 tests passed (501 seconds); log retained at `.w2l/task-extraction/npm-test.log`.
- The new task-content selection has one candidate and at most one extra selection-body parse per extraction, limited to 1,000,000 HTML characters. Larger inputs keep the existing path and report `content_selection_skipped`/`html_too_large`; request/body limits remain. This is not a latency guarantee.
- Auto-detected and paginated content selection, arbitrary JSON facts, effective table-data validation, general duplicate detection, login/captcha classification beyond #506 and response-cropping verification scope remain follow-up work. No default-access 92, healthy-25, L or multi-date candidate acceptance has been claimed for this change.
