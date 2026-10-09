# Access task set run: all, 2026-10-09

- Command: `node research/access/run-set.mjs --set all --access "enhanced" --record research/access/runs/2026-10-09-pa4-steel-all-loading-4f791ae.md`
- Source commit: `4f791ae`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.135
- Run: 2026-10-09T09:06:47.677Z → 2026-10-09T09:22:59.396Z
- Tasks: 92 (set `all`); task file SHA-256 at fetch time: `63ef6e86a7cb765e578951e2acd092479d214f57b7149982e4bf9100f28fb075`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 92 | 47 | 13 | 5603 | 27529 | unknown | unknown |

- Paid provider calls (cold): 33; tasks verified with a paid call's page as the answer: 7; charged by the spend ledger: $0.1100 (a provider that states no price is charged its price ceiling: an upper bound, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 25098 | steel: blocked/cloudflare_challenge (answer) |
| T002 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16277 | steel: success (answer) |
| T003 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 16749 | steel: success (answer) |
| T004 | cold | no | failed | timeout |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 40266 |  |
| T005 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19876 | steel: blocked/bot_detected_generic (answer) |
| T006 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5723 |  |
| T007 | cold | yes | success |  | 200 | http | http_compat |  | 1523 |  |
| T008 | cold | yes | success |  | 200 | http | http |  | 1756 |  |
| T009 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3534 |  |
| T010 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 25744 | steel: success (answer) |
| T011 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 28663 | steel: success (answer) |
| T012 | cold | no | blocked | captcha | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 31048 | steel: blocked/captcha (answer) |
| T013 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 11003 |  |
| T014 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21064 | steel: failed/http_error (answer) |
| T015 | cold | yes | success |  | 200 | http | http |  | 1871 |  |
| T016 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 7097 |  |
| T017 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 5603 |  |
| T018 | cold | yes | success |  | 200 | http | http_compat → browser_local → provider |  | 45848 | steel: success |
| T019 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3168 |  |
| T020 | cold | yes | success |  | 200 | http | http |  | 3787 |  |
| T021 | cold | no | failed | http_error | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20628 | steel: failed/http_error (answer) |
| T022 | cold | yes | success |  | 200 | http | http |  | 3146 |  |
| T023 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21584 | steel: success (answer) |
| T024 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 8014 |  |
| T025 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 5169 |  |
| T026 | cold | no | failed | timeout |  | http | http | markdownCountMin, markdownMatches | 12384 |  |
| T027 | cold | yes | success |  | 200 | http | http |  | 3487 |  |
| T029 | cold | yes | success |  | 200 | http | http_compat |  | 2532 |  |
| T030 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19949 | steel: success (answer) |
| T031 | cold | no | failed | empty_unverified | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26526 | steel: failed/empty_unverified (answer) |
| T033 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local | markdownCountMin | 3535 |  |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 26999 | steel: blocked/bot_detected_generic (answer) |
| T035 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 15107 | steel: success (answer) |
| T036 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6303 |  |
| T037 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 967 |  |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19037 | steel: blocked/bot_detected_generic (answer) |
| T039 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4656 |  |
| T040 | cold | yes | success |  | 200 | http | http |  | 1490 |  |
| T041 | cold | yes | success |  | 200 | http | http → browser_local |  | 3595 |  |
| T042 | cold | no | blocked | rate_limit | 429 | http | http | markdownCountMin, markdownMatches | 1618 |  |
| T043 | cold | no | blocked | bot_detected_generic | 405 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 23504 | steel: blocked/bot_detected_generic (answer) |
| T044 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 9882 |  |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18135 | steel: blocked/bot_detected_generic (answer) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15474 | steel: blocked/bot_detected_generic (answer) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 18558 | steel: blocked/cloudflare_challenge (answer) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19971 | steel: blocked/cloudflare_challenge (answer) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2740 |  |
| T050 | cold | yes | success |  | 202 | provider | http → browser_local → provider |  | 20975 | steel: success (answer) |
| T051 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4940 |  |
| T052 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | minTables, markdownMatches | 18302 | steel: blocked/cloudflare_challenge (answer) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 20817 | steel: blocked/bot_detected_generic (answer) |
| T055 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | minTables | 27529 | steel: success (answer) |
| T056 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 993 |  |
| T057 | cold | yes | success |  | 200 | browser_local | http_compat → browser_local |  | 3491 |  |
| T058 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4653 |  |
| T059 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 2784 |  |
| T060 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 2755 |  |
| T061 | cold | yes | success |  | 200 | http | http |  | 2860 |  |
| T062 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5728 |  |
| T063 | cold | yes | success |  | 200 | http | http |  | 1152 |  |
| T064 | cold | no | blocked | login_wall | 401 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 2520 |  |
| T065 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 12076 |  |
| T066 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin | 3770 |  |
| T067 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4449 |  |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 16141 | steel: blocked/cloudflare_challenge (answer) |
| T069 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 13636 | steel: blocked/cloudflare_challenge (answer) |
| T070 | cold | no (false success) | success |  | 200 | http | http | markdownCountMin, markdownMatches | 1418 |  |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 15104 | steel: blocked/cloudflare_challenge (answer) |
| T072 | cold | yes | success |  | 200 | http | http |  | 2994 |  |
| T073 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4588 |  |
| T074 | cold | yes | success |  | 200 | http | http → browser_local → provider |  | 19980 | steel: blocked/cloudflare_challenge |
| T075 | cold | no | failed | http_error | 403 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3460 |  |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 17744 | steel: blocked/cloudflare_challenge (answer) |
| T077 | cold | yes | success |  | 200 | http | http |  | 1556 |  |
| T078 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownMatches, markdownMatches | 2598 |  |
| T079 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 5207 |  |
| T080 | cold | yes | success |  | 200 | http | http |  | 2511 |  |
| T081 | cold | no | failed | http_error | 400 | http | http | markdownMatches, markdownMatches | 1807 |  |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17832 | steel: blocked/cloudflare_challenge (answer) |
| B002 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6005 |  |
| B003 | cold | no (false success) | success |  | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 16703 | steel: success (answer) |
| B004 | cold | yes | success |  | 200 | provider | http → browser_local → provider |  | 19474 | steel: success (answer) |
| B005 | cold | yes | success |  | 200 | http | http |  | 3930 |  |
| B006 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 4498 |  |
| B007 | cold | yes | success |  | 200 | http | http |  | 4213 |  |
| B008 | cold | no | blocked | bot_detected_generic | 202 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 3620 |  |
| B009 | cold | no | failed | http_error | 402 | http | http | markdownMatches, markdownCountMin | 1042 |  |
| B010 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6695 |  |
| B011 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 3719 |  |
| B012 | cold | yes | success |  | 200 | http | http |  | 1996 |  |
| B013 | cold | yes | success |  | 200 | http | http |  | 693 |  |
| B014 | cold | yes | success |  | 200 | http | http |  | 1289 |  |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (the narrowed loading wait, and why B003 slipped through it)

**Set-up.**
- The same set-up as `2026-10-09-pa4-steel-all-06b9354.md`: the Steel grant (SHA-256 `b2e32cb817d763f758e5755d94a61932182f3bf1894c09df39fc65fab5da1259`), Steel's tariff and the proxied network.
- The server ran at `4f791ae`. In that build the loading probe, after review, looks only for:
  - a visible `aria-busy` element or a visible short loading text;
  - not on a button or a link;
  - on a page of at most 4,000 characters of text.

  It is also off for requests with `waitFor` or `actions`.

**Against the run before any loading wait** (`06b9354`):
- **Verified:** 47 here, 45 there. Frozen: 12 here, 11 there.
- **False successes:** 13 in both runs, and none of them is new.
  - These three were false successes before and are not now: T014, T021 and T026. They ended `http_error` or `timeout`, which is run-to-run variation.
  - B003 and T025 were false successes in both runs. In the run at `004a107`, with the first probe, both had become honest failures.
- **Latency on the 45 tasks both runs verified:** median 4449 ms here, 5025 ms before.

**B003, examined after the run.** Two further Steel calls were made.
- **A scrape through this API** (`formats: ["markdown", "rawHtml"]`, `access: "enhanced"`):
  - The answer was `success` with the 79-character "Inventory Search Results Fetching..." page.
  - Its trace held no `loading_wait`, so the probe never reported loading. It did not give up at 8 s.
  - The HTML's text came to about 350 characters, so the 4,000-character gate was not the cause.
- **A one-off script, run outside the product, that inspected the page in a Steel session.**
  - Its set-up: Steel's own API with the same session options (`useProxy: false`, stealth on), Playwright over CDP, and the probe evaluated directly. The session was released at the end.
  - At about 1.5 s after `domcontentloaded`:
    - A full-screen loader `div.tds-loader` was visible, marked `aria-busy="true"` and `role="progressbar"`.
    - The placeholder `h1` held "Inventory Search Results Fetching...".
    - The probe returned true.
  - At 4 s and at 8 s the loader was gone (opacity 0) and the probe returned false. The page held about 800 characters of text and no vehicles or prices.
  - On the script's first attempt, the page replaced its document while it loaded ("Execution context was destroyed").
- **What this means.**
  - In the product, the wait's samples met that navigation.
  - The wait treats a navigation error as a fresh document with nothing loading, so it ended at its usual 1.5 s bound, before any sample could see the loader.
  - Even waited out, B003's page has no data through Steel: that is an honest `empty_unverified`, as at `004a107`.
