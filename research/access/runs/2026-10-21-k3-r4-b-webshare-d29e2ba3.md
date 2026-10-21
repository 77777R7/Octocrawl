# Access task set run: all, 2026-10-21

K3 round 4, arm B (Webshare, gateway 23.81.42.155); summary and design in [2026-10-21-k3-egress-by-detection-5beacbf3.md](2026-10-21-k3-egress-by-detection-5beacbf3.md). run-set wrote this file to a scratch path outside the repository, so that the next arm run started on a clean tree; it is copied here unchanged apart from this paragraph.

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record /private/tmp/claude-501/-Users-howard07-Code-w2l--claude-worktrees-gracious-ptolemy-2a348e/22c19255-e8ec-4542-95c8-992d4e83aaba/scratchpad/k3/r4-B.md`
- Source commit: `d29e2ba3`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:8796, HTTP_PROXY=http://127.0.0.1:8796, NO_PROXY=localhost,127.0.0.1,::1)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: `"enhanced"`
- Exit address: 73.210.37.128
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-21T05:04:05.898Z → 2026-10-21T05:11:33.630Z
- Tasks: 16 (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 2 | 0 | 16976 | 180006 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 2, not_loaded 0, not_extracted 0, not_served 13, unknown 1; region waits: 1 (held on 1)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none; not known on 1 attempt without a ladder trace

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 15 (time left at its start: median 300000 ms, least 299999 ms); browser_local on 14 (time left at its start: median 293448 ms, least 291339 ms); installed_chrome on 9 (time left at its start: median 285506 ms, least 279888 ms)
- Verified answers by the route that delivered them (cold): http 1, installed_chrome 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 4 (T005: unreachable, network_error, set aside; T034: unreachable, network_error, set aside; T049: rule /, set aside; B008: rule /, set aside); not known on 1 attempt without a robots check

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 24913 | not_served (connection_error) |
| T002 | cold | yes | success |  | 200 | http | http |  | 11070 | ready (verified) |
| T005 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownCountMin, markdownMatches | 6464 | not_served (connection_error) |
| T034 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownCountMin, markdownMatches | 1831 | not_served (connection_error) |
| T038 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16798 | not_served (connection_error) |
| T045 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 21101 | not_served (connection_error) |
| T046 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16976 | not_served (connection_error) |
| T047 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 16674 | not_served (connection_error) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 41854 | not_served (cloudflare_challenge) |
| T049 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 20886 | not_served (connection_error) |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 32242 | ready (verified); region held in 623 ms |
| T068 | cold | no | - | TimeoutError: The operation was aborted due to timeout |  |  | unknown |  | 180006 | unknown |
| T071 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownCountMin, markdownMatches | 12545 | not_served (connection_error) |
| T076 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownCountMin | 10984 | not_served (connection_error) |
| B001 | cold | no | failed | connection_error |  | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 19518 | not_served (connection_error) |
| B008 | cold | no | failed | connection_error |  | browser_local | http → browser_local | markdownMatches, markdownCountMin | 10468 | not_served (connection_error) |
- Task contract (cold): the product's verification agreed with the runner on 15 of 15 attempts that carry one (2 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
