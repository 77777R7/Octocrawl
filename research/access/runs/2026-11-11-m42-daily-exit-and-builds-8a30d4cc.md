# M4.2 / M3.3: exit against environment over several days, with the Chrome builds alongside, from 2026-11-11

Label: `research`. Task list: [docs/enhanced-access-tasks.md](../../docs/enhanced-access-tasks.md), M4.2, M3.3 and the build comparison M3.4 left open.

**Why again.** M1 ([2026-11-10](2026-11-10-exit-vs-environment-1949dc97.md)) and the build comparisons (M3.1, M3.2 and the [M3.4 follow-up](2026-11-11-m34-testing-config-sites-f50c1b5d.md)) each ran two or three rounds in one afternoon and ended without a conclusion: the same page read differently hours apart. This run spreads the reads over days (M4.1).

## Design and decision rules (written and committed before the first run; not changed afterwards)

- **Arms**, all on this Mac, one local API process, the same grant (`installed_chrome`), `access: "enhanced"`, cold, through `research/access/run-set.mjs`:
  - **A**: the installed Google Chrome on the exit the API gives it (the shell's proxy, a Clash client on `127.0.0.1:7890`). The same-day baseline.
  - **B**: the same Chrome; each launch leaves through the next proxy of Webshare's shared datacenter list (the batch hosted uses), one per read, as in M1 (`research/access/exit-split/chrome.sh` and `forward.mjs`). The launch counter carries over between days, so no proxy is used twice.
  - **C**: Chrome for Testing 157.0.8103.50, same exit as A.
  - **N**: the same binary with `--disable-field-trial-config` (`research/access/exit-split/chrome-noftc.sh`), same exit as A.
  - The `http`, `http_compat` and `browser_local` rungs leave by the API's own route in every arm.
- **Pages:** all 16 of `challenge16` (`research/access/subsets.v1.json`), none dropped or replaced.
- **Sessions:** one a day (the local date of this Mac, UTC+8), two rounds, order A, B, C, N in each round, by `research/access/exit-split/daily.sh`. At least 3 days, so every page has at least 6 reads per arm. A day without a session is said as such; the run goes on until 3 days have one. Every read counts, including those of a day whose baseline is low.
- **Product code:** `8a30d4cc` (origin/main on 2026-11-11) for every day. Later commits on this branch add only this record, the scripts under `research/access/exit-split/` and the task list.
- **Pooled verdict of a page in an arm**, over all reads of all days: **reads** when at least two thirds are verified (run-set's `verified`), **does not read** when at most one third are, **mixed** otherwise.
- **Rule 1, exit or environment (M4.2; focus pages capterra T047, cars.com T071, crunchbase T048):**
  1. B reads capterra and cars.com → the datacenter exit is enough for them on a real desktop Chrome: the hosted gap on these pages is **environment**.
  2. A reads both, B reads neither, and what B gets is a challenge that does not clear → **exit**: H1 (ISP exit) is first after an unfreeze.
  3. A reads both, B reads neither, and what B gets is a block page (`access_denied`) → **exit refused**, also H1.
  4. Anything else (A does not read them, mixed verdicts, the two pages disagree) → **no conclusion**.
  5. More than a quarter of arm B's real-Chrome reads ending in `connection_error` or `timeout` → **no conclusion**.
  crunchbase is reported beside them and does not decide.
- **Rule 2, capterra and cars.com on the baseline (M3.3):** arm A verifies neither page on any read of any day → the loss since 2026-11-09 **lasted through these days** (the run does not say why). Arm A reads one of them (two thirds or more) → **it came back**. Otherwise → **varies by day**, with the per-day counts.
- **Rule 3, builds (per page, arms A, C, N):** the page **separates** when one of A and C reads it and the other does not read it. For a page that separates: N has C's verdict → the difference is **not the testing config** (brand or what else remains); N has A's verdict → **the testing config**; N mixed → no conclusion for that page. A page that does not separate says nothing.
- **Known limits:** one Mac, one proxy batch, one Clash exit; the installed Chrome updates itself, so its version is recorded every day and a move off 157 is said (arms A and B then differ from C and N in version as well as build); arms run one after another, about half an hour a session, not at the same instant; thresholds of two thirds and one third over 6 reads are a choice, not a statistical calculation.

## Runs

One bullet a day. No verdict is written until three days have a session. The tables below are the output of `node research/access/exit-split/daily-table.mjs`, replaced whole after each day: a cell is `verified`, or the read's reason with the real Chrome's gate signals and challenge wait; `real Chrome: …` is how the real-Chrome attempt itself ended when it got no page.

- **2026-11-11 (day 1):** `EXIT_SPLIT_STATE=… EXIT_SPLIT_GRANT=… EXIT_SPLIT_PROXIES=… EXIT_SPLIT_CFT=… research/access/exit-split/daily.sh`, 18:19–18:52Z on 2026-11-10 (02:19–02:52 local on 11-11). Scripts at `4b8fee8b`, product code `8a30d4cc`; run-set's build check (`tsc --build --dry`) up to date in all 8 runs. Proxied: the API through the shell's Clash client on `127.0.0.1:7890`, arm B's Chrome through one datacenter proxy per launch. Installed Chrome 157.0.8103.50, Chrome for Testing 157.0.8103.50. All 8 runs ended with exit code 0. Verified of 16, rounds 1 and 2: A 8 and 6, B 7 and 6, C 10 and 8, N 7 and 6. Arm B launched the real Chrome 26 times (launches 1–26 of the proxy list); 4 of those reads ended in `connection_error` or `timeout`. After this session the branch merged main `7dc9b768`, which adds documents only.

## Tables

Verified per run (of 16):

| Day (local) | A r1 | A r2 | B r1 | B r2 | C r1 | C r2 | N r1 | N r2 | commit |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-11 | 8 | 6 | 7 | 6 | 10 | 8 | 7 | 6 | 4b8fee8b |

### 2026-11-11

| Task | A1 | B1 | C1 | N1 | A2 | B2 | C2 | N2 |
|---|---|---|---|---|---|---|---|---|
| T001 | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | captcha `site_captcha_script+text_verify_you_are_human+text_complete_the_security_check` | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T002 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T005 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T034 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T038 | verified | verified | verified | verified | verified | bot_detected_generic `header_x_datadome` 9.0 s | verified | verified |
| T045 | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited |
| T046 | verified | verified | verified | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | verified | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited |
| T047 | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | verified | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s |
| T048 | cloudflare_challenge `header_cf_mitigated` 9.0 s | access_denied `cf_attention_required+text_you_have_been_blocked` not waited | cloudflare_challenge `header_cf_mitigated` 9.0 s | access_denied `cf_attention_required+text_you_have_been_blocked` not waited | cloudflare_challenge `header_cf_mitigated` 9.1 s | access_denied; real Chrome: connection_error | verified | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T049 | verified | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited | captcha; real Chrome: connection_error | captcha `header_x_datadome+datadome_captcha` not waited | captcha `header_x_datadome+datadome_captcha` not waited |
| T053 | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | verified | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic; real Chrome: timeout | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` |
| T068 | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic; real Chrome: timeout | bot_detected_generic `header_x_datadome` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T071 | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T076 | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | verified | verified | verified | cloudflare_challenge `header_cf_mitigated` 9.0 s | verified | verified |
| B001 | verified | verified | verified | verified | verified | verified | verified | cloudflare_challenge `header_cf_mitigated` 9.1 s |
| B008 | verified | verified | verified | verified | empty_unverified; real Chrome: empty_unverified | verified | verified | verified |

Pooled over 1 day(s): verified / reads.

| Task | A | B | C | N |
|---|---|---|---|---|
| T001 | 0/2 | 0/2 | 0/2 | 0/2 |
| T002 | 2/2 | 2/2 | 2/2 | 2/2 |
| T005 | 2/2 | 2/2 | 2/2 | 2/2 |
| T034 | 2/2 | 2/2 | 2/2 | 2/2 |
| T038 | 2/2 | 1/2 | 2/2 | 2/2 |
| T045 | 0/2 | 0/2 | 0/2 | 0/2 |
| T046 | 1/2 | 2/2 | 1/2 | 0/2 |
| T047 | 0/2 | 0/2 | 1/2 | 0/2 |
| T048 | 0/2 | 0/2 | 1/2 | 0/2 |
| T049 | 1/2 | 0/2 | 0/2 | 0/2 |
| T053 | 0/2 | 0/2 | 1/2 | 0/2 |
| T068 | 0/2 | 0/2 | 0/2 | 0/2 |
| T071 | 0/2 | 0/2 | 0/2 | 0/2 |
| T076 | 1/2 | 0/2 | 2/2 | 2/2 |
| B001 | 2/2 | 2/2 | 2/2 | 1/2 |
| B008 | 1/2 | 2/2 | 2/2 | 2/2 |

Arm B: 26 reads reached the real Chrome; 4 of them ended in connection_error or timeout.
