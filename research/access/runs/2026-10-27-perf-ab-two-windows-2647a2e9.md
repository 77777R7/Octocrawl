# Speed A/B, two windows: 2026-10-26 and 2026-10-27

- Windows `.w2l/access/perf/2026-10-26-w1` (runner `1cc21f4d`, base `cb498544`) and `.w2l/access/perf/2026-10-27-w2` (runner `2647a2e9`, base `cb498544`); each window's own record has its conditions.
- Command: `node research/access/speedReport.mjs .w2l/access/perf/2026-10-26-w1 .w2l/access/perf/2026-10-27-w2 --out research/access/runs/2026-10-27-perf-ab-two-windows-2647a2e9.md`, each note below passed as a `--note`. First calls only.
- Records: window A research/access/runs/2026-10-26-perf-ab-w1-1cc21f4d.md, window B research/access/runs/2026-10-27-perf-ab-w2-2647a2e9.md, the probes research/access/runs/2026-10-26-perf-ab-probes-eb6cb933.md and the O1 acceptance check research/access/runs/2026-10-27-perf-o1-challenge16-2647a2e9.md. Base `cb498544` against new main `135254e7` in both windows; between them main has exactly #720 (O4), #722 (O1), #721 (O6) and #723 (O7), measured together. Proxied through Clash in both.
- The installed_chrome pair is the only one both windows ran, and the clean comparison. The combined pair ran in window A only and is confounded by Steel, degraded on both of its arms that day: 12 of 32 provider calls failed before a session existed with `fetch failed` at about 10 s, 3 ended at `Execution deadline exceeded` after 30 s, every release new's O7 events timed (9, on T012, T013, T030, T031, T043, T046, T068, T069, B003) hit its 5 s deadline and was recorded `released: false` (base's releases were not timed before O7), every charge on both arms was at the price ceiling, and 15 of the 20 sessions ran to their 120 s timeout by Steel's own list. That list was read once, read-only, at 14:35 UTC on 2026-10-26 and is saved beside window A's raw runs as `.w2l/access/perf/2026-10-26-w1/steel-sessions-read-20261026T1435Z.txt` (SHA-256 0f012ef91b70624bf78b49bb28fd87f78c521f28bf1cd024ac8982f1d27802c8). Steel lists 5 of the 20 as user_requested, so `released: false` overstates some of them: a reporting gap. The ic_compat pair (installed_chrome with compatible_transport, Howard's change for window B) ran in window B only. Both are single-window results.
- Order: window A listed base first, window B new first, so each pair ran in both orders in every block across the two windows. Window B followed CAPTCHA window 2 (06:20–07:54 UTC), which visited 40 of K1's 90 hosts, and the challenge16 probe; what visited these sites in the hours before window A was not checked. Window B's first run (installed_chrome@new, T001–T023) is marked dirty by an uncommitted edit to research/access/speedReport.mjs only; see its record.
- installed_chrome, verified: 68 → 68 (window A) and 70 → 68 (window B); no gain or regression held in both windows. The 7 unstable tasks (T005, T008, T046, T048, T053, T059, T066) are traced in the window records to visit order in a block, a site's 429, a browser_local connection error and checks served to one visit and not the next. T048 in window A is also a possible O1 loss, not isolated: new stopped at its cap (9.0 s) where base cleared in 2.1 s.
- installed_chrome, time: challenge_wait summed 188.7 → 71.1 s (−117.6 s) and 136.7 → 65.6 s (−71.1 s), O1's measured effect, about −1.3 and −0.8 s a task averaged over 92. The paired median moved −175 and −150 ms. p50 all −1027 and +184 ms, p95 all −5244 and +354 ms: the windows disagree, so neither percentile is shown to move. The tail is set by the same tasks on both arms (T010, T012, T030, T031 and a few more at 22–35 s), whose time is spent outside the four changes. Wall total 857.5 → 683.8 s (−173.7 s) and 974.1 → 796.2 s (−177.9 s); 102.4 s of window B's is one task, T052, where base's installed_chrome rung ran 106 s past its last trace event to a 127.9 s timeout, a tail that ic_compat's (new's) T052 shows too, so it is in both engines and not one of the four changes.
- O1 acceptance (challenge16, bar 12/16): not met in either probe on either side; window A's probe new 9, base 10, window B's new 11, base 11 with the same tasks. Across both windows and probes, base cleared 56 Cloudflare or bot checks, none after 8.1 s, and none of its 22 captcha waits or 17 other 19 s waits cleared: base's longer wait earned no page after 8.1 s in these runs. Whether a longer wait would have cleared the visits new left gated at its cap where other arms cleared in 2.0–4.8 s (window A T047, T048; window B T001, T048 on ic_compat) is unknown, so a page lost to the cap is not ruled out.
- O4: robots.txt fetches per task did not fall in either window (installed_chrome 193 → 193 and 194 → 196 reads of 30 ms or more), so the per-origin, per-User-Agent cache removed no fetch in K1, whose tasks are one origin each, read by rungs with different User-Agents; the robots seconds (−13.7 and −4.7 s) are the network's.
- O6 (estimated at 0 for these runs, which send no `timeout`): it acted on T013 in both windows. After the http rung's header timeout, base's ladder stopped at browser_local's geo_restricted and new's went on; installed_chrome was geo_restricted too (no gain, 2.6–3.6 s more across the two windows), and in window A combined new verified T013 through Steel.
- O7: only window A ran Steel, on the confounded combined pair; its timed steps are in that record, and its 30 s CDP connect cap is not measured cleanly here.
- ic_compat (window B only): verified 67 → 68, p95 all −3.8 s. Against installed_chrome on the same side, compat changed the time of five tasks, not the verified count: http_compat ran in place of the http rung on T007, T009, T018, T029 and T057 and delivered all five (new 40.0 → 11.7 s summed), the same five that window A's combined arms delivered by http_compat. The four tasks verified by one of installed_chrome@new and ic_compat@new and not the other (T001, T031, T048, T066) did not go through http_compat.
- Not done: O2 (Steel prewarm) and O3 (region-wait memory); the analysis's "O1–O4" estimates include both. Region waits summed are 194.9 → 161.0 s and 183.0 → 177.0 s on the installed_chrome pair, which none of the four changes touches.
- Correction to window A's record, found in review on 2026-10-27 (that record is left as written): its Steel note says new's `session_released` events show releaseMs 5000–5003 "on all 11". The raw responses hold 9 such events (the nine tasks above), all releaseMs 5000–5003 and `released: false`; T005 and T053 ended at `Execution deadline exceeded` with no release event. Its Steel list was read but not saved then; it is saved now (above).

## Per arm and window, first calls, all 92 tasks

| Arm | Verified w1 / w2 | In both | False success w1 / w2 | p50 all w1 / w2 | p95 all w1 / w2 | p50 verified w1 / w2 | p95 verified w1 / w2 | Steel w1 / w2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| installed_chrome_base | 68 / 70 | 66 | 3 / 2 | 6729 / 6829 | 26725 / 28847 | 6373 / 6760 | 16377 / 16680 | $0.0000 / $0.0000 |
| installed_chrome | 68 / 68 | 65 | 1 / 2 | 5702 / 7013 | 21481 / 29201 | 5702 / 7021 | 15887 / 15335 | $0.0000 / $0.0000 |

## Base against new, per window

| Pair | Δ p50 all w1 / w2 | Δ p95 all w1 / w2 | Paired median Δ w1 / w2 | Gains held in both | Regressions held in both | Unstable |
| --- | --- | --- | --- | --- | --- | --- |
| installed_chrome | -1027 / +184 | -5244 / +354 | -175 / -150 | 0 | 0 | 7 (T005, T008, T046, T048, T053, T059, T066) |

## Pairs run in one window only (single window: not a two-window result)

| Pair | Window | Verified base → new | p50 all base → new | p95 all base → new | Gains / regressions (that window) |
| --- | --- | --- | --- | --- | --- |
| combined | 1 (2026-10-26) | 71 → 65 | 6861 → 6014 | 52056 → 46340 | 2 / 8 |
| ic_compat | 2 (2026-10-27) | 67 → 68 | 6468 → 6273 | 26471 → 22684 | 3 / 2 |

## Key phases per window, seconds summed

| Arm | challenge_wait w1 / w2 | robots w1 / w2 | region_wait w1 / w2 | provider outside lane w1 / w2 | provider rung clock w1 / w2 |
| --- | --- | --- | --- | --- | --- |
| installed_chrome_base | 188.7 / 136.7 | 98.6 / 124.7 | 194.9 / 183.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| installed_chrome | 71.1 / 65.6 | 84.9 / 120.0 | 161.0 / 177.0 | 0.0 / 0.0 | 0.0 / 0.0 |

## challenge_wait outcomes, both windows

| Arm | Gate · outcome | n (w1 + w2) | p50 ms | max ms |
| --- | --- | --- | --- | --- |
| installed_chrome_base | bot_detected_generic · cleared | 7 | 3546 | 6600 |
| installed_chrome_base | bot_detected_generic · still_gated | 4 | 19065 | 19067 |
| installed_chrome_base | captcha · still_gated | 7 | 19059 | 19067 |
| installed_chrome_base | cloudflare_challenge · cleared | 14 | 4155 | 4915 |
| installed_chrome_base | cloudflare_challenge · still_gated | 2 | 19063 | 19063 |
| installed_chrome | bot_detected_generic · cleared | 5 | 3339 | 6167 |
| installed_chrome | bot_detected_generic · still_gated | 4 | 9030 | 9036 |
| installed_chrome | captcha · not_waited | 9 | 0 | 0 |
| installed_chrome | cloudflare_challenge · cleared | 14 | 3954 | 5062 |
| installed_chrome | cloudflare_challenge · still_gated | 3 | 9035 | 9036 |

## Against the analysis's estimates (p95 all, s)

Estimates from `.w2l/perf/2026-10-26-speed-root-cause.md` section 3, simulated per task on the combined windows of 2026-10-25/26 (runner `22bf90e7`, engine main `4dc53ac0`). "O1–O4" there includes O2 (Steel prewarm) and O3 (region-wait memory), neither of which was done; O1 and O4 are the parts that shipped, and O6 and O7 were estimated at 0 and unknown for these runs (run-set sends no `timeout`).

| Arm | Estimate O1–O4 (w2; w1) | Estimate O1 alone (w2; w1) | Estimate O4: p50 | Measured base → new w1 | Measured base → new w2 | Measured p50 base → new w1 / w2 |
| --- | --- | --- | --- | --- | --- | --- |
| combined (window 1 only) | 53 → 27 (42 → 29) | 53 → 43 (42 → 37) | 6.4 → 5.8 (7.0 → 6.1); p95 −1 | 52.1 → 46.3 | - → - | 6.9 → 6.0 / - → - |
| installed_chrome | 26 → 18 | 26 → 24.5 | - | 26.7 → 21.5 | 28.8 → 29.2 | 6.7 → 5.7 / 6.8 → 7.0 |

Reference, not run here: Firecrawl Cloud in the same 92 tasks, p50 / p95 all 3232 / 10989 ms (2026-10-25) and 3479 / 10213 ms (2026-10-26), from `research/access/runs/2026-10-26-combined-two-windows-22bf90e7.md`.

## Per task, both windows (w1/w2: y = verified, F = false success, n = not, - = not run)

| Task | Part | installed_chrome_base | installed_chrome |
| --- | --- | --- | --- |
| T001 | frozen | y/y | y/y |
| T002 | frozen | y/y | y/y |
| T003 | frozen | y/y | y/y |
| T004 | frozen | n/n | n/n |
| T005 | frozen | y/y | n/y |
| T006 | frozen | y/y | y/y |
| T007 | frozen | y/y | y/y |
| T008 | unstable | y/n | y/y |
| T009 | frozen | y/y | y/y |
| T010 | frozen | F/F | F/F |
| T011 | frozen | y/y | y/y |
| T012 | frozen | F/F | n/n |
| T013 | frozen | n/n | n/n |
| T014 | frozen | n/n | n/n |
| T015 | healthy | y/y | y/y |
| T016 | healthy | y/y | y/y |
| T017 | frozen | y/y | y/y |
| T018 | frozen | y/y | y/y |
| T019 | frozen | y/y | y/y |
| T020 | healthy | y/y | y/y |
| T021 | frozen | y/y | y/y |
| T022 | frozen | y/y | y/y |
| T023 | frozen | y/y | y/y |
| T024 | healthy | y/y | y/y |
| T025 | frozen | y/y | y/y |
| T026 | frozen | y/y | y/y |
| T027 | healthy | n/n | n/n |
| T029 | frozen | y/y | y/y |
| T030 | frozen | n/n | n/n |
| T031 | unstable | F/n | n/n |
| T033 | healthy | y/y | y/y |
| T034 | frozen | n/y | n/y |
| T035 | healthy | y/y | y/y |
| T036 | healthy | y/y | y/y |
| T037 | frozen | y/y | y/y |
| T038 | frozen | n/n | n/n |
| T039 | healthy | y/y | y/y |
| T040 | healthy | y/y | y/y |
| T041 | healthy | y/y | y/y |
| T042 | frozen | n/n | n/n |
| T043 | frozen | n/n | n/n |
| T044 | healthy | y/y | y/y |
| T045 | frozen | n/n | n/n |
| T046 | frozen | n/y | n/n |
| T047 | frozen | y/y | y/y |
| T048 | frozen | y/y | n/y |
| T049 | frozen | y/y | y/y |
| T050 | frozen | n/n | n/n |
| T051 | healthy | y/y | y/y |
| T052 | healthy | y/n | y/n |
| T053 | frozen | n/y | y/y |
| T055 | frozen | y/y | y/y |
| T056 | frozen | y/y | y/y |
| T057 | frozen | y/y | y/y |
| T058 | healthy | y/y | y/y |
| T059 | healthy | n/y | y/n |
| T060 | frozen | y/y | y/y |
| T061 | healthy | y/y | y/y |
| T062 | healthy | y/y | y/y |
| T063 | healthy | y/y | y/y |
| T064 | frozen | n/n | n/n |
| T065 | frozen | y/y | y/y |
| T066 | frozen | y/y | y/F |
| T067 | healthy | y/y | y/y |
| T068 | frozen | n/n | n/n |
| T069 | frozen | n/n | n/n |
| T070 | frozen | y/y | y/y |
| T071 | frozen | y/y | y/y |
| T072 | healthy | y/y | y/y |
| T073 | unstable | y/y | y/y |
| T074 | healthy | y/y | y/y |
| T075 | frozen | y/y | y/y |
| T076 | frozen | y/y | y/y |
| T077 | healthy | y/y | y/y |
| T078 | frozen | n/n | n/n |
| T079 | healthy | y/y | y/y |
| T080 | healthy | y/y | y/y |
| T081 | frozen | n/n | n/n |
| B001 | blind | y/y | y/y |
| B002 | blind | y/y | y/y |
| B003 | blind | n/n | n/n |
| B004 | blind | y/y | y/y |
| B005 | blind | y/y | y/y |
| B006 | blind | y/y | y/y |
| B007 | blind | y/y | y/y |
| B008 | blind | y/y | y/y |
| B009 | blind | n/n | n/n |
| B010 | blind | y/y | y/y |
| B011 | blind | y/y | y/y |
| B012 | blind | y/y | y/y |
| B013 | blind | y/y | y/y |
| B014 | blind | y/y | y/y |
