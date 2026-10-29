# Access task set run: all, 2026-10-29

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --no-contract --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-29-hosted-chrome-gate-r1-132f6352.md`
- Source commit: `132f6352`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the Octocrawl API at W2L_API_URL (the pages are read from its servers; the network and exit lines are the runner's way to it)
- API: https://h43chrome---octocrawl-api-c7fpmz73tq-as.a.run.app (an account key was sent, not recorded); access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-29T04:49:44.378Z → 2026-10-29T04:53:25.810Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 3 | 1 | 15507 | 24836 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 4, not_loaded 2, not_extracted 0, not_served 10, unknown 0; region waits: 0 (held on 0)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 299999 ms, least 299986 ms); browser_local on 14 (time left at its start: median 299592 ms, least 298931 ms); hosted_chrome on 14 (time left at its start: median 297711 ms, least 293165 ms)
- Verified answers by the route that delivered them (cold): hosted_chrome 3
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /; B008: rule /)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 24836 | not_served (captcha) |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 17769 | ready |
| T005 | cold | no (false success) | success |  | 200 | browser_local | http → browser_local → hosted_chrome | markdownCountMin | 12294 | ready |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 15965 | ready |
| T038 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 19126 | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 9553 | not_served (captcha) |
| T046 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 22163 | not_loaded (empty_unverified, little_text) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15507 | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownMatches | 15048 | not_served (cloudflare_challenge) |
| T049 | cold | no | failed | policy_denied |  | http | http | markdownCountMin, markdownMatches | 693 | not_served (policy_denied) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → hosted_chrome |  | 15989 | ready |
| T068 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → hosted_chrome | markdownMatches, markdownCountMin | 9090 | not_served (captcha) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15967 | not_served (cloudflare_challenge) |
| T076 | cold | no | failed | empty_unverified | 200 | browser_local | http → browser_local → hosted_chrome | markdownCountMin | 11433 | not_loaded (empty_unverified, little_text) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → hosted_chrome | markdownCountMin, markdownMatches | 15173 | not_served (cloudflare_challenge) |
| B008 | cold | no | failed | policy_denied |  | http | http | markdownMatches, markdownCountMin | 552 | not_served (policy_denied) |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes (written with the record, 2026-10-29)

**What this run is.** Run 1 of ADR 0005's gate on `hosted_chrome` (decision eight of the 2026-10-27 revision: two challenge16 runs, each with verified at or above the baseline and false successes at or below it). Howard asked for it on 2026-10-29. It ran against the tagged API revision `octocrawl-api-chrome-338775e` (tag `h43chrome`, image `hosted-api:338775e6`, no traffic; live traffic stayed on `h42http2`), which calls the `octocrawl-chrome` service revision `octocrawl-chrome-c2-338775e` (image `hosted-chrome:338775e6`, Chrome 155.0.8059.79, profile `nodriver-0.50.6-no-allow-origins+webrtc-proxied-udp-only`, 2 vCPU / 4 GiB, max 1 instance).

**Where the pages were read.** On Octocrawl's servers in asia-southeast1. The `http` and `browser_local` rungs left from Cloud Run's own egress. The `hosted_chrome` rung left through Webshare Shared Datacenter proxies (100 US IPs), one proxy per call: 14 calls, 13 distinct proxies (one, `67.227.113.60:5600`, served T005 and T048). The network and exit lines above are the runner's way from Howard's Mac to the API, not the pages' exit.

**The task contract was not sent (`--no-contract`).** Hosted mode refuses `markdownMatches` and `markdownCountMin` checks (ADR 0006: a regular expression cannot be bounded in time), and every challenge16 predicate is one of those two. A first invocation with the contract got a 400 `unsupported_parameter` on all 16 tasks before any page was read, and spent no `hosted_chrome` attempt (the daily counter stayed at 3); its git-ignored run directory is `.w2l/access/runs/2026-10-29T04-48-43-303Z`. Without a contract the ladder cannot escalate on `verification_failed`, and the API cannot mark a page that loaded without its data, so a run without one can count a false success that a run with one would not. The runner judged every attempt by the same predicates either way.

**Counters (D5).** `hostedQuotas/2026-10-29-hostedChrome-<Howard's uid>` went from 3 to 17 and `hostedChromeSpend/2026-10` `calls` from 3 to 17: one per task that reached the rung. `settledMicroUsd` stayed 0. The account key and the proxy password appear in none of the run's files (checked by string search over the record and the run directory).

**Reference for the baseline.** No `hosted_chrome` launch has served yet, so the ADR's baseline ("the launch this rung uses at the time, on the same kind of exit") has no measured value. The nearest measured result is H2b's datacenter round ([record](2026-10-27-h2b-egress-8ece08ab.md), window 2, `installed_chrome` launch `nodriver-0.50.6-no-allow-origins` on a Cloud Run job with a Webshare datacenter exit, task contract sent): on the challenge16 tasks it verified 6 (T002, T005, T034, T046, T076, B001) with 0 false successes, T049 and B008 not sent (robots). Against that reference this run is below on both counts (3 against 6 verified, 1 against 0 false successes). Which baseline the gate uses is Howard's decision; this record does not declare the gate passed or failed.

**Differences from that reference, none isolated:** the WebRTC preference; the hosted service's own code path (the API's ladder calling the service per read) rather than run-set against a local API inside one job; one proxy per read chosen by the service; no task contract; one round on a different day.
