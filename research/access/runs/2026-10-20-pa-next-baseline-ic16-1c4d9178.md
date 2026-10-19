# Access task set run: all, 2026-10-19

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record research/access/runs/2026-10-20-pa-next-baseline-ic16-1c4d9178.md`
- Source commit: `4f359d75`
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8797; access option: `"enhanced"`
- Exit address: not recorded
- Grant: SHA-256 `09fdeafe0cb2c77cbf8c771f596ff9ab5be5fc253322a1d32b682ab0c83bd818`; capabilities: installed_chrome (the grant given to the runner, --grant or W2L_ACCESS_GRANT; the API's own is not read back)
- Run: 2026-10-19T17:50:55.171Z → 2026-10-19T17:54:34.940Z
- Tasks: 16 (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 12 | 0 | 10355 | 25366 | 0 | unknown |

- Paid provider calls (cold): 0; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0000 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 12, not_loaded 0, not_extracted 0, not_served 4, unknown 0; region waits: 12 (held on 12; scrolled on 1, held on 1 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): none

- Rungs started (cold, the ladder's `ladder_channel_started`): http on 16 (time left at its start: median 300000 ms, least 299998 ms); browser_local on 16 (time left at its start: median 299211 ms, least 298587 ms); installed_chrome on 15 (time left at its start: median 297588 ms, least 286499 ms)
- Verified answers by the route that delivered them (cold): installed_chrome 11, browser 1
- Local rungs left out (cold, `ladder_channel_not_served`): none
- Egress proxy refused a connection (cold, `egress_proxy_refused`): none

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9167 | ready (verified); region held in 552 ms |
| T002 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 8869 | ready (verified); region held in 533 ms |
| T005 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10160 | ready (verified); region held in 2723 ms, 2 screens scrolled |
| T034 | cold | yes | success |  | 200 | browser_local | http → browser_local |  | 6355 | ready (verified); region held in 778 ms |
| T038 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9466 | ready (verified); region held in 995 ms |
| T045 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 25366 | not_served (captcha) |
| T046 | cold | no | blocked | captcha | 403 | browser_local | http → browser_local → installed_chrome | markdownCountMin, markdownMatches | 24104 | not_served (captcha) |
| T047 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10355 | ready (verified); region held in 940 ms |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownMatches | 23181 | not_served (cloudflare_challenge) |
| T049 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 13142 | ready (verified); region held in 688 ms |
| T053 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 7319 | ready (verified); region held in 605 ms |
| T068 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local → installed_chrome | markdownMatches, markdownCountMin | 24060 | not_served (bot_detected_generic) |
| T071 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 9214 | ready (verified); region held in 719 ms |
| T076 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 10773 | ready (verified); region held in 659 ms |
| B001 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 5668 | ready (verified); region held in 705 ms |
| B008 | cold | yes | success |  | 200 | browser_local | http → browser_local → installed_chrome |  | 22550 | ready (verified); region held in 3885 ms |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (12 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes for P0.1

- **Server.** `W2L_ACCESS_GRANT=.w2l/access/installed-chrome-grant.json node --import tsx packages/api/src/cli.ts --port 8797` (the form of `research/access/sticky-vs-rotating.sh:17`), with the exit through Clash `127.0.0.1:7890` as the Network line says (the acceptance record 7b56397b's exit), not the script's Webshare forwarder on 8796. Installed Google Chrome 155.0.8059.80 (`--version`), headed, at most 2 windows. No paid route could take part. The API was stopped after the run.
- **Commit.** `4f359d75` is `1c4d9178` (main after #611) plus one commit that adds only the 92-task record of this baseline; the code is that of `1c4d9178`, which the file name carries.
- **Grant.** The file is Howard's installed_chrome attestation of 2026-10-14T09:00:00Z, written "to check the loading-probe fix on the 16 challenge tasks (ADR 0005)" and used by the acceptance record `2026-10-14-installed-chrome-acceptance-7b56397b.md`; reused unchanged here on Howard's decision of 2026-10-20 (its SHA-256 is the Grant line's). It names `installed_chrome` alone.
- **Cost.** $0 (no paid call). Clash exit bandwidth: unknown (not metered).
- **Against the acceptance baseline** (7b56397b final: 11 and 7 of 16; the probe 12 and 12): 12 of 16, the four misses are the DataDome tasks T045, T046 and T068 and the Cloudflare task T048. Lane column: the runner names `browser_local` for the answers the `installed_chrome` rung gave (`channelsTried` shows the rung); whether that column should say `installed_chrome` is a runner question, not a result of this run.
- **Raw run.** `.w2l/access/runs/2026-10-19T17-50-55-171Z/` of the worktree (git-ignored), with `--save-responses`.
