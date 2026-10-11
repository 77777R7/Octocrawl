# Access task set run: all, 2026-10-11

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --save-responses --record research/access/runs/2026-10-12-pa-gate-signals-enhanced-56f9a0d1.md`
- Source commit: `56f9a0d1` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8798; access option: `"enhanced"`
- Exit address: 103.142.140.130
- Run: 2026-10-11T17:59:56.372Z → 2026-10-11T18:05:25.238Z
- Tasks: 16 (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `cb4172278158579cb72ae79c155ac7e2eea7dc90849b4206db92213d612fb16c`; method in the header of run-set.mjs

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 0 | 0 | 19912 | 38661 | unknown | unknown |

- Paid provider calls (cold): 14; tasks verified with a paid call's page as the answer: 0; charged by the spend ledger: $0.0075 (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

- Readiness (cold, ADR 0007): ready 0, not_loaded 0, not_extracted 0, not_served 16, unknown 0; region waits: 1 (held on 0; scrolled on 1, held on 0 of them)

- Rungs the ladder passed over (cold, its `ladder_channel_skipped` events): robots_override on T049 (provider, steel), B008 (provider, steel)

- robots.txt (cold): disallowed on 2 (T049: rule /, set aside; B008: rule /, set aside)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms | Paid calls | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22997 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T002 | cold | no | blocked | cloudflare_challenge | 200 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 22446 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T005 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 31895 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T034 | cold | no | blocked | bot_detected_generic | 200 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 38661 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T038 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 21042 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T045 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19401 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T046 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 19881 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T047 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17697 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T048 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownMatches | 19912 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T049 | cold | no | blocked | bot_detected_generic | 403 | browser_local | http → browser_local | markdownCountMin, markdownMatches | 2434 |  | not_served (bot_detected_generic) |
| T053 | cold | no | blocked | bot_detected_generic | 403 | provider | http → browser_local → provider | markdownMatches | 22502 | steel: blocked/bot_detected_generic (answer) | not_served (bot_detected_generic) |
| T068 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownMatches, markdownCountMin | 18765 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T071 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 20331 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| T076 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider |  | 18960 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B001 | cold | no | blocked | cloudflare_challenge | 403 | provider | http → browser_local → provider | markdownCountMin, markdownMatches | 17872 | steel: blocked/cloudflare_challenge (answer) | not_served (cloudflare_challenge) |
| B008 | cold | no | blocked | bot_detected_generic | 405 | browser_local | http → browser_local | markdownMatches, markdownCountMin | 13375 |  | not_served (bot_detected_generic); region not held in 9720 ms, 1 screen scrolled |
- Task contract (cold): the product's verification agreed with the runner on 16 of 16 attempts that carry one (0 passed)

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).

## Notes

- G1 of [docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md), T1.2: the 16 tasks two full enhanced runs of 2026-10-11 answered with `cloudflare_challenge` or `bot_detected_generic`, run with `--save-responses` so the gate's `signals` are kept (under the run's git-ignored `responses/`). Two rounds minutes apart on the same code: standard (no grant; [record](2026-10-12-pa-gate-signals-standard-56f9a0d1.md)) and enhanced (the 10-11 Steel grant, no proxy, no solving: 14 paid calls, every one blocked, $0.0075 by the ledger; [record](2026-10-12-pa-gate-signals-enhanced-56f9a0d1.md)). Local rungs through the machine's forward proxy (a data-centre exit).
- The gate's signals, by lane, and the vendor they name:

| Task | Standard: answer | Standard: signals | Enhanced: answer | Enhanced: signals | Vendor |
| --- | --- | --- | --- | --- | --- |
| B001 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare |
| B008 | bot_detected_generic 405 | browser_local: weak_enable_javascript weak_security_check | bot_detected_generic 405 | browser_local: weak_enable_javascript weak_security_check | unknown (no vendor header: weak_enable_javascript, weak_security_check) |
| T001 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare |
| T002 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 200 | provider: cf_challenge_platform_script | Cloudflare |
| T005 | bot_detected_generic 403 | browser_local: header_x_datadome | bot_detected_generic 200 | provider: header_x_datadome | DataDome |
| T034 | bot_detected_generic 200 | browser_local: header_x_datadome | bot_detected_generic 200 | provider: header_x_datadome | DataDome |
| T038 | bot_detected_generic 403 | browser_local: header_x_datadome | bot_detected_generic 403 | provider: header_x_datadome | DataDome |
| T045 | bot_detected_generic 403 | browser_local: header_x_datadome | bot_detected_generic 403 | provider: header_x_datadome | DataDome |
| T046 | bot_detected_generic 403 | browser_local: header_x_datadome | bot_detected_generic 403 | provider: header_x_datadome | DataDome |
| T047 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare |
| T048 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: cf_attention_required | Cloudflare |
| T049 | bot_detected_generic 403 | browser_local: header_x_datadome | bot_detected_generic 403 | browser_local: header_x_datadome | DataDome |
| T053 | bot_detected_generic 403 | browser_local: weak_access_denied status_403 | bot_detected_generic 403 | provider: weak_access_denied status_403 | unknown (no vendor header: status_403, weak_access_denied) |
| T068 | bot_detected_generic 403 | browser_local: header_x_datadome | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare + DataDome |
| T071 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare |
| T076 | cloudflare_challenge 403 | browser_local: header_cf_mitigated | cloudflare_challenge 403 | provider: header_cf_mitigated | Cloudflare |

- Attribution from the signals alone (the layer is T1.3's question): Cloudflare on 8 tasks (B001, T001, T002, T047, T048, T068, T071, T076: the `cf-mitigated` header, or the challenge platform script and the "Attention required" page on Steel's browser), DataDome on 7 (T005, T034, T038, T045, T046, T049, and T068 on the local browser, which met Cloudflare on Steel's: economist.com runs both), no vendor header on 2: B008 (imdb, a 405 with only weak wording) and T053 (imf.org, a bare 403 "access denied"). Every one of the 16 was blocked on the HTTP rung already (`failureClass: bot_gate`), on the local browser, and, where the ladder went on, on Steel's browser; B008 and T049 did not reach Steel (a 405 the ladder does not step past; T049's robots override on the local rung).
- Not isolated: whether the block is the exit, the TLS fingerprint, the browser's own marks or the vendor's page-side checks is what T1.3's library probe asks next.
