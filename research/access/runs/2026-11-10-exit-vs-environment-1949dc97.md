# M1: exit or environment? Local real Chrome through hosted's datacenter proxies, 2026-11-10

Label: `research`. Task list: [docs/enhanced-access-tasks.md](../../../docs/enhanced-access-tasks.md), M1.

**The question.** On the 16 challenge pages hosted `hosted_chrome` verified 5 and 6, and local `installed_chrome` verified 11, 14 and 13. The two differ in two things at once: the exit (hosted: Webshare shared datacenter proxies, US; local: this Mac's own exit) and the environment (hosted: Chrome 155 under Xvfb on Cloud Run, UTC, no GPU; local: Chrome on macOS with a display). No run has changed one and kept the other. This run does: the Mac's real Chrome, once on its usual exit and once through the same datacenter proxies hosted uses.

## Design and decision rule (written before any run; not changed afterwards)

- **Arm A (same-day baseline):** local API on this Mac, `installed_chrome` on the exit the API gives it (the shell's `HTTPS_PROXY`, a Clash client on `127.0.0.1:7890`).
- **Arm B:** the same API process, the same Chrome, the same grant. Only the real Chrome's exit changes: each Chrome launch goes through the next proxy of Webshare's shared datacenter list (100 US addresses), one proxy per read, as `hosted_chrome` chooses one per read. The `http`, `http_compat` and `browser_local` rungs leave by the API's own route in both arms, as hosted's ordinary rungs do not use the proxies either.
- **How:** `installed_chrome` refuses a proxy that needs a login (`packages/bench/src/subjects/installedChrome.ts:152`), so `W2L_EGRESS_PROXIES` cannot carry this rung with Webshare's logins, and it would move every rung. Instead `W2L_CHROME_PATH` names `research/access/exit-split/chrome.sh`, which replaces only `--proxy-server` in arm B with a port of `research/access/exit-split/forward.mjs` (one local port per proxy, seeded shuffle). No product code changes.
- **Same proxies as hosted:** the local list and the secret `w2l-hosted-chrome-proxies` (mounted by `octocrawl-chrome`) hold the same 100 lines (sorted SHA-256 equal, checked 2026-11-10; no entry printed).
- **Pages:** all 16 of `challenge16` (`research/access/subsets.v1.json`), none dropped or replaced.
- **Rounds:** 3 per arm, alternating A1, B1, A2, B2, A3, B3, `access: "enhanced"`, cold, through `research/access/run-set.mjs`.
- **A page passes in an arm** when at least 2 of its 3 rounds are verified (run-set's `verified`: read and every predicate passed).
- **Focus pages:** capterra (T047), cars.com (T071), crunchbase (T048): the pages local reads and `hosted_chrome` does not.
- **Rule:**
  1. B passes capterra and cars.com → the datacenter exit is enough for them on a real desktop Chrome: the hosted gap on these pages is **environment**. An ISP exit is not the next step; M2 and then H2/H3 are.
  2. B fails both and what it gets is a challenge that does not clear, while A passes them the same day → **exit**: H1 (ISP exit) is first after an unfreeze.
  3. B fails them with block pages (`cf_attention_required` or a 403 block, no challenge) → **exit refused**, also H1.
  4. Anything else (one passes and one fails, A fails them too, mixed signals) → **no conclusion**, said as such.
  5. If more than a quarter of arm B's attempts die on connection errors (no HTTP answer through the proxy), the arm says nothing about the sites → **no conclusion**.
- **Scope of the answer:** the three focus pages on one Mac and one proxy batch. It does not say what an ISP exit would do, and it does not measure hosted's environment (that is M2).
- **Known differences left in:** arm B's Chrome reaches the proxies through whatever route this Mac has to them; the Mac's Chrome is the installed stable (157 on the day), hosted pins 155; routing history is shared by both arms in one API process.

## Run

- Product code: `1949dc97` (origin/main on 2026-11-10). The runs name `2d040fc4`, which adds only this record's design and `research/access/exit-split/` on top of it. `npx tsc --build` before the API started; run-set's build check said up to date in all six runs, `dirty: false`.
- API: `W2L_ACCESS_GRANT=.w2l/access/installed-chrome-grant.json` (SHA-256 `09fdeafe0cb2…`, capabilities: installed_chrome) `W2L_CHROME_PATH=research/access/exit-split/chrome.sh EXIT_SPLIT_STATE=<.w2l scratch> EXIT_SPLIT_SIZE=100 node --import tsx packages/api/src/cli.ts`, port 8787.
- Forwarder: `EXIT_SPLIT_PROXIES=.w2l/access/webshare-dc-proxies.txt EXIT_SPLIT_LOG=<.w2l scratch>/forward.jsonl node research/access/exit-split/forward.mjs` (ports 18900–18999). Before the run, ports 18900 and 18999 were checked: the exit api.ipify.org saw was the upstream proxy's own address; a headless Chrome through the wrapper in arm B left from the proxy of port 18900.
- Command: `EXIT_SPLIT_STATE=<.w2l scratch> EXIT_SPLIT_GRANT=.w2l/access/installed-chrome-grant.json research/access/exit-split/run.sh`, which for each round and arm runs `node research/access/run-set.mjs --set all --only <challenge16> --access '"enhanced"' --client-timeout-ms 330000 --save-responses --grant <grant> --arm <arm>-r<round>`.
- Network: proxied. The API's environment had `HTTPS_PROXY=http://127.0.0.1:7890` (Clash on this Mac), so `http`, `browser_local` and arm A's `installed_chrome` left through Clash. Arm B's `installed_chrome` left through the forwarder to one Webshare US datacenter proxy per launch, reached from this Mac directly (the forwarder does not use Clash).
- Machine: Howard's Mac, Google Chrome 157.0.8103.50 (installed by Chrome's own update on 2026-11-10 at 10:31 local; 157.0.8103.39 at 04:30; 156.0.8078.81 before).
- Time: 2026-11-10 05:05–05:25 UTC, order A1, B1, A2, B2, A3, B3. Run directories (git-ignored): `.w2l/access/runs/2026-11-10T05-05-36-693Z` … `2026-11-10T05-22-21-385Z`.
- Real-Chrome launches: 78, 39 per arm (13 per run: the 13 tasks whose cheaper rungs did not verify). Arm B used proxies 1–39 of the shuffled list, none twice.

## Results

Verified per run (of 16): A1 9, B1 7, A2 8, B2 6, A3 7, B3 8.

Pages that pass (at least 2 of 3): arm A 8 (T002, T005, T034, T038, T046, T053, B001, B008); arm B 6 (T002, T005, T034, T046, B001, B008). T002, T005 and T034 were verified before the real Chrome in every run.

Each cell is the run's verdict; for a page not verified, the `installed_chrome` attempt's `blockReason` (or failure), its gate signals and when its challenge wait ended.

| Task | A1 | B1 | A2 | B2 | A3 | B3 |
|---|---|---|---|---|---|---|
| T001 | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | captcha `site_captcha_script+text_verify_you_are_human+text_complete_the_security_check` | cloudflare_challenge `header_cf_mitigated` 9.1 s | captcha `site_captcha_script+text_verify_you_are_human+text_complete_the_security_check` |
| T002 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T005 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T034 | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) | verified (no Chrome) |
| T038 | verified | verified | verified | bot_detected_generic `header_x_datadome` 9.0 s | verified | captcha `header_x_datadome+datadome_captcha` |
| T045 | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` |
| T046 | verified | verified | verified | verified | verified | verified |
| T047 | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.1 s |
| T048 | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `cf_attention_required` 9.0 s | connection_error | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T049 | verified | captcha `header_x_datadome+datadome_captcha` | captcha `header_x_datadome+datadome_captcha` | connection_error | captcha `header_x_datadome+datadome_captcha` | verified |
| T053 | verified | bot_detected_generic `weak_access_denied+status_403` | verified | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | verified |
| T068 | bot_detected_generic `header_x_datadome` 9.1 s | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s | timeout | bot_detected_generic `header_x_datadome` 9.0 s | bot_detected_generic `header_x_datadome` 9.0 s |
| T071 | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.0 s | cloudflare_challenge `header_cf_mitigated` 9.1 s | cloudflare_challenge `header_cf_mitigated` 9.0 s |
| T076 | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` | bot_detected_generic `weak_access_denied+status_403` |
| B001 | verified | verified | verified | verified | verified | verified |
| B008 | verified | verified | verified | verified | verified | verified |

Connection errors in arm B: 2 of 39 `installed_chrome` attempts failed with `connection_error` and 1 with `timeout` (B2: T048, T049, T068), under the quarter in the rule. Inside arm B's three run windows the forwarder logged 1,267 connections: 1,229 answered (200, or 302 to a plain-http request); 19 CONNECTs the upstream proxy refused (10 with 407, 9 with 502); 2 plain-http requests answered 407; 17 timed out reaching the proxy.

## Verdict by the rule

**No conclusion (rule 4).** Arm A, the same-day baseline, did not pass capterra (T047), cars.com (T071) or crunchbase (T048) either: on every run of both arms they got a Cloudflare challenge (`header_cf_mitigated`; crunchbase once `cf_attention_required`) that had not cleared at the last look, about 9 s. With A failing them, the run cannot say whether the datacenter exit or the environment keeps `hosted_chrome` from them.

## What else the run showed (outside the rule)

- **The local baseline fell the same day Chrome updated.** The weekly rerun of 2026-11-09 (`research/access/runs/2026-11-09-weekly-free-b6e94b5c.md`, on branch `claude/pa-weekly-2026-11-09`, source `b6e94b5c`, Chrome 156.0.8078.81, the same grant and the same Clash exit) verified 13 of 16, including T047, T048, T049, T053, T071 and T076. Today arm A verified 7–9 and none of T047, T048, T071 or T076. Chrome moved from 156 to 157 between the two, and the day and the engine commit changed too, so this run does not show which of them, or a change on the sites' side, caused it. A probe of Chrome 157 launched with the rung's flags (`DETECTION_FLAGS`, a fixed debugging port) read `navigator.webdriver` false, a Chrome/157 user agent, 5 plugins and `en-US, en`: nothing visible there explains it.
- **Datacenter exit against the same Chrome, pages that differ:** tripadvisor (T038) passed 3 of 3 on A and 1 of 3 on B (DataDome: `header_x_datadome`, once a DataDome captcha); IMF (T053) 2 of 3 on A, 1 of 3 on B (403, `weak_access_denied`). studylib (T001) showed a site captcha page on B twice and a Cloudflare challenge on A every time. These are small numbers (3 rounds) and only lean towards the datacenter exit costing DataDome pages.
- **Same in both arms:** idealista (T045) DataDome captcha 6 of 6; economist (T068) DataDome 6 of 6; stackoverflow (T076) 403 `weak_access_denied` 6 of 6.
