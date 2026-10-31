# Access task set run: all, 2026-10-31

- Command: `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access "enhanced" --client-timeout-ms 330000 --save-responses --record research/access/runs/2026-10-31-hosted-chrome-check-b-local-4df8feed.md`
- Source commit: `4df8feed` (working tree had uncommitted changes)
- Network: proxied (HTTPS_PROXY=http://127.0.0.1:7890, HTTP_PROXY=http://127.0.0.1:7890, NO_PROXY=localhost,127.0.0.1,::1,.local)
- Target: the local Octocrawl API
- API: http://127.0.0.1:8787; access option: `"enhanced"`
- Exit address: not recorded
- Grant: none given to the runner (--grant or W2L_ACCESS_GRANT)
- Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)
- Run: 2026-10-31T00:08:53.519Z → 2026-10-31T00:08:53.636Z
- Tasks: 16 from `research/access/tasks.v1.json` (set `all`, only T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008); task file SHA-256 at fetch time: `f83483b8dfb81f7af14625fd9e3ed1ffede374076500a942eb787eb3724fcd3f`; method in the header of run-set.mjs
- Denominator: planned 16, attempted 16, not run 0; an attempt not run counts as not verified

| Attempts | Verified | False success | p50 ms | p95 ms | External cost per 1,000 verified (USD) | Egress cost per 1,000 verified (USD) |
| --- | --- | --- | --- | --- | --- | --- |
| cold: 16 | 0 | 0 | 2 | 18 | unknown | unknown |

- Paid provider calls (cold): unknown; tasks verified with a paid call's page as the answer: unknown; charged by the spend ledger: unknown (a provider that states no price is charged its sessions' measured time, and the bytes and solves it reported, under the grant's tariff, else its price ceiling: an estimate from the tariff, not its bill)

| Task | Attempt | Verified | Status | Reason | HTTP | Lane | Channels tried | Failed predicates | Wall ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches, markdownMatches | 18 |
| T002 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches, markdownMatches | 3 |
| T005 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 3 |
| T034 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 3 |
| T038 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| T045 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 3 |
| T046 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| T047 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| T048 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches, markdownMatches | 2 |
| T049 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| T053 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches | 2 |
| T068 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches, markdownCountMin | 2 |
| T071 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| T076 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin | 2 |
| B001 | cold | no | - | unsupported_parameter |  |  | unknown | markdownCountMin, markdownMatches | 2 |
| B008 | cold | no | - | unsupported_parameter |  |  | unknown | markdownMatches, markdownCountMin | 2 |

Suspected cause: not isolated for any task (a run through the product cannot isolate it; see the method).
