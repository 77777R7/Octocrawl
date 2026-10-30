# Access task set run: all, 2026-10-30

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --no-contract --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-30-hosted-chrome-gate-r2-637af767.md`
- Source commit: `637af767`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the Octocrawl API at W2L_API_URL (the pages are read from its servers; the network and exit lines are the runner's way to it)
- API: https://h44chrome---octocrawl-api-c7fpmz73tq-as.a.run.app (an account key was sent, not recorded); access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-30T03:09:35.687Z → 2026-10-30T03:13:00.235Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 4 | 0 | 12439 | 30181 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 4, not_loaded 0, not_extracted 0, not_served 12, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 299999 ms, least 299991 ms); browser_local on 14 (time left at its start: median 299658 ms, least 298897 ms); hosted_chrome on 14 (time left at its start: median 297910 ms, least 294126 ms)
- Verified answers by the route that delivered them (cold): hosted_chrome 4
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /; B008: rule /)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 30181 | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 15762 | ready |
| T005 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 8838 | not_served (captcha) |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 12439 | ready |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 19575 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 10156 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 9074 | not_served (captcha) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 16565 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 14295 | not_served (cloudflare_challenge) |
| T049 | cold | no | failed | policy_denied |  | http | http | markdownCountMin, markdownMatches | 598 | not_served (policy_denied) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches | 10604 | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownCountMin | 16964 | not_served (bot_detected_generic) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15638 | not_served (cloudflare_challenge) |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 12304 | ready |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 10694 | ready |
| B008 | cold | no | failed | policy_denied |  | http | http | markdownMatches, markdownCountMin | 622 | not_served (policy_denied) |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (written with the record, 2026-10-30)

**What this run is.** Run 2 of ADR 0005's gate on `hosted_chrome` (decision eight of the 2026-10-27 revision: two challenge16 runs, each with verified at or above the baseline and false successes at or below it). Howard scheduled it for 2026-10-30 08:20 (+08:00); that scheduled session stalled at its first command without running anything, and on his instruction the run was made from another session at 03:09 UTC. It ran against the tagged API revision `octocrawl-api-chrome-8ed40c9` (tag `h44chrome`, image `hosted-api:8ed40c92`, digest `sha256:5234b2332cc3…`, no traffic; live traffic stayed on `h42http2`), which calls the `octocrawl-chrome` service revision `octocrawl-chrome-c3-8ed40c9` (image `hosted-chrome:8ed40c92`, digest `sha256:106dc770dbbf…`, Chrome 155.0.8059.79, profile `nodriver-0.50.6-no-allow-origins+webrtc-proxied-udp-only`, 2 vCPU / 4 GiB, max 1 instance, which started at 03:09:55 UTC during the run). Both revisions name source commit `8ed40c92`, the merge of #767: the stability wait no longer treats a document that is still parsing, with no body, as settled, and the settle after a cleared check gets the loading bound. Run 1 ([record](2026-10-29-hosted-chrome-gate-r1-132f6352.md)) ran on tag `h43chrome` (images `338775e6`), without #767, so runs 1 and 2 ran different engine code. The runner's side matches run 1's: `judge.mjs` and the task files are unchanged since run 1's source commit `132f6352` (the same task file SHA-256), and `run-set.mjs` differs only in how a rejudged record words its Target and API lines; a new run is requested, judged and recorded as before.

**Where the pages were read.** On Octocrawl's servers in asia-southeast1. The `http` and `browser_local` rungs left from Cloud Run's own egress. The `hosted_chrome` rung left through Webshare Shared Datacenter proxies (100 in the service's list at its start), one proxy per call: 14 calls, 13 distinct proxies (one, `213.169.210.173:6814`, served T005 and T046). The network and exit lines above are the runner's way from Howard's Mac to the API, not the pages' exit.

**The task contract was not sent (`--no-contract`).** As in run 1: neither tagged revision takes `markdownMatches` or `markdownCountMin` checks, and every challenge16 predicate is one of those two. Unlike run 1, no invocation with the contract was made first: that `h44chrome` refuses them follows from its source commit `8ed40c92` predating the operator switch for them (#777, merged on 2026-10-30 and not deployed), as run 1's 400 `unsupported_parameter` showed on `h43chrome`; it was not observed on `h44chrome`. The runner judged every attempt by the same predicates, with the same `judge.mjs`, as run 1. Without a contract the ladder cannot escalate on `verification_failed`, and the API cannot mark a page that loaded without its data, so a run without one can count a false success that a run with one would not; this run counted none. No region wait ran.

**Counters (D5).** Read before the run: `hostedConfig/hostedChrome` enabled, 20 attempts per account per day, `monthlyCapUsd` 20; `hostedQuotas/2026-10-30-hostedChrome-<Howard's uid>` did not exist yet (0). After the run it read 14: one per task that reached the rung. `hostedChromeSpend/2026-10` read `calls` 32 and `settledMicroUsd` 0 after the run; it was not read before. The other counters imply 18 before it (17 after run 1, per that record's notes, and the 2026-10-29 daily counter ended at 18), which would make its rise 14 as well. The tag revision's logs for the run's minutes show 16 `hosted_usage` lines, 14 `hosted_chrome_read` lines and no `hosted_keyless_usage`, so the account key went with every task. The account key and the proxy password appear in none of the run's files: a string search over the record and the run directory's 27 files found 0 of each.

**Reference for the baseline.** As for run 1, the comparison is the nearest measured result to the ADR's baseline ("the launch this rung uses at the time, on the same kind of exit"): H2b's datacenter round ([record](2026-10-27-h2b-egress-8ece08ab.md), window 2, `installed_chrome` launch `nodriver-0.50.6-no-allow-origins` on a Cloud Run job with a Webshare datacenter exit, task contract sent). On the challenge16 tasks it verified 6 (T002, T005, T034, T046, T076, B001) with 0 false successes, T049 and B008 not sent (robots). Run 1 verified 3 (T002, T034, T053) with 1 false success (T005). This run verified 4 (T002, T034, T076, B001) with 0 false successes: against the H2b reference it is below on verified (4 against 6) and level on false successes (0 against 0). Runs 1 and 2 ran different engine code (#767, above); whether both count toward the gate's two runs is Howard's decision, as is which baseline the gate uses. This record does not declare the gate passed or failed.

**Per task.** The six tasks whose result differs from run 1, from each run's saved responses (the `hosted_chrome` step's trace); one round each, no cause isolated:

| Task | H2b datacenter | Run 1 (`h43chrome`) | Run 2 (`h44chrome`) | Run 2's `hosted_chrome` step, against run 1's |
| --- | --- | --- | --- | --- |
| T005 | verified | false success | blocked, captcha | A DataDome captcha (403; `header_x_datadome`, `datadome_captcha`), not waited on. Run 1's page matched the task's price pattern once, against a minimum of 5 (`markdownCountMin` failed; 1,730 text characters in the extract). |
| T046 | verified (cleared in 6.6 s) | failed, empty_unverified | blocked, captcha | A DataDome captcha (403), not waited on, through the same proxy as T005. Run 1 was still gated after 11.3 s; its layout then failed with a `createTreeWalker` error and the extract read 0 text characters. |
| T053 | not verified, bot_detected_generic | verified | blocked, bot_detected_generic | A 403 access-denied page (`weak_access_denied`, `status_403`). Run 1 loaded the page after a 0.9 s loading wait. |
| T068 | not verified, still gated after 9 s | blocked, captcha | blocked, bot_detected_generic | DataDome (403; `header_x_datadome`), still gated after a 9.0 s wait. Run 1 met a DataDome captcha. |
| T076 | verified (cleared in 5.3 s) | failed, empty_unverified | verified | The Cloudflare check cleared in 3.3 s; the layout then read 1,480 elements and the extract 9,170 text characters. In run 1 the check cleared in 4.0 s and the layout failed with a `createTreeWalker` error, the case #767's commit names (a reload still parsing, with no body, taken as settled). The settle after a cleared check writes no trace event, so this run does not show whether #767's change took part; the two runs also used different proxies. |
| B001 | verified | blocked, cloudflare_challenge | verified | No challenge was recorded and no challenge wait ran; the page rendered with status 200 (4,530 layout elements, 14,791 text characters). Run 1 was still behind a Cloudflare check after 9.1 s. |

The other ten ended as in run 1: T002 and T034 verified; T001 (the site's own captcha page), T038 (DataDome, still gated after 9 s), T045 (DataDome captcha), T047, T048 and T071 (Cloudflare, still gated after about 9 s) blocked; T049 and B008 refused by robots.txt at the `http` rung's robots check, before the page was requested, so no later rung started. Against H2b's datacenter round, this run verified the same tasks except T005 and T046, which both met a DataDome captcha through the same proxy; whether the proxy, the site or the engine decided that is not isolated.

**Differences from the H2b reference, none isolated:** as for run 1, the WebRTC preference; the hosted service's own code path (the API's ladder calling the service per read) rather than run-set against a local API inside one job; one proxy per read chosen by the service; no task contract; one round on a different day.
