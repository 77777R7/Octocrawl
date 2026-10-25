# F4 shadow decisions against the ladder's own, 2026-10-25

- What this is: a read-only analysis of saved runs. No site was fetched and nothing was paid ($0).
- Question (Howard, 2026-10-25): where F4's `decideNext` (`packages/bench/src/routing/decideNext.ts`, shadow since #634) chose something other than the ladder, what happened next, and should F4 drive the loop?
- Source commit of the analysis: `4dc53ac0` (main). `decideNext.ts` has one commit in its history (`f6b22840`, #634), so every run below wrote its shadow decisions with the same function. The ladder around it differs by run commit, as listed.
- Method: every `ladder_action_decision` event in every saved response (`responses/<task>-<temperature>.json`, field `response.ladderTrace`) of the run directories below was read. Each event was joined with what the same trace shows after it: the `ladder_channel_started` and `verification_checked` events of later rungs, and the runner's `attempts.jsonl` outcome for the attempt (verified, false success, wall ms, charged USD, paid calls). "Later rung passed" means a later `verification_checked` with status `passed`. The script is a scratch script kept outside the repository (shared notes folder of the session, `f4-shadow-collect.py`), as AGENTS.md asks.
- What the data cannot show: what a shadow choice would have led to. The ladder did not take it, so a shadow `wait_retry_after`, a shadow `next_rung` where the ladder stopped, or a shadow `wait_same_session` has no observed outcome. Those are marked unknown below. Only a shadow `stop` where the ladder went on can be judged, because the ladder's later rungs are in the trace.

## Data

| Source | Path (read only) | Run directories | With decisions | Attempts with decisions | Decisions | Shadow ≠ actual | Attempts with a difference | Run commits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K1 archive | `~/Code/w2l/.w2l/access/archive/2026-10-23-k1/access/runs` | 88 | 47 | 913 | 1,851 | 246 | 220 | `1753ecbd`, `6de7c370`, `5832a10f`, `8b4f324a`, `322de68e`, `b233d232`, `fb2db7cc`, one without a summary |
| Weekly rerun 2026-10-21 | `.claude/worktrees/pa-weekly/.w2l/access/runs` | 5 | 2 | 63 | 141 | 8 | 7 | `db80379b` |
| Combined grant, window 1 | `.claude/worktrees/vigilant-poincare-a52edb/.w2l/access/runs/2026-10-25T*` | 19 | 15 | 372 | 754 | 104 | 87 | `22bf90e7` |
| All | | 112 | 64 | 1,348 | 2,746 | 358 | 314 | |

The 48 directories without a decision are Firecrawl and ZenRows arms (no Octocrawl ladder), K1's control arm, two runs before the wiring (`fd59157a`) and page-cache hits.

Agreement: 2,388 of 2,746 decisions (87%). The ladder's actual action is only ever `next_rung` (1,366), `stop` (1,348) or `keep_591_fallback` (32): it has no wait, re-extract, handoff (none occurred) or paginate action of its own.

Shadow choices over all 2,746 decisions: `stop` 1,490, `next_rung` 1,138, `wait_retry_after` 85, `keep_591_fallback` 32, `wait_same_session` 1, and `reextract`, `handoff`, `paginate_or_incomplete` 0. Those last three branches were never chosen in any saved run, so nothing here says how they would behave.

## Differences by branch

Counts are decisions; an attempt can carry more than one (358 differing decisions in 314 attempts). The outcome columns use the first differing decision of each attempt (314), so that one attempt is counted once.

| Shadow → actual | Reason (F4's) | Decisions | Attempts (first difference) | Of those: verified after the ladder went on | Shadow would have been |
| --- | --- | --- | --- | --- | --- |
| `stop` → `next_rung` | `source:empty_unverified` | 170 | 156 | 55 | worse on 55, cheaper on 101 |
| `stop` → `next_rung` | `login_wall:no_authorization` | 52 | 32 | 9 | worse on 9, cheaper on 23 |
| `stop` → `next_rung` | `source:connection_error` | 28 | 18 | 2 | worse on 2, cheaper on 16 |
| `wait_retry_after` → `stop` | `retry_after` | 85 | 85 | (ladder stopped) | unknown |
| `next_rung` → `stop` | `geo_blocked` | 12 | 12 | (ladder stopped) | unknown |
| `next_rung` → `stop` | `bot_gate` | 10 | 10 | (ladder stopped) | not allowed: the rung is skipped by policy |
| `wait_same_session` → `stop` | `not_loaded` | 1 | 1 | (ladder stopped) | unknown |

### 1. Shadow `stop`, ladder `next_rung` (250 decisions, 206 attempts)

F4 stops on any `failed` result that has no routing failure class (`source:<failureReason>`) and on a login wall without an authorised session. The ladder goes on to the next free rung in both cases, and the next rungs verified 66 of these 206 attempts.

| Reason | Attempts | Verified later | Which rung verified (decisions) | Tasks verified later (attempts) |
| --- | --- | --- | --- | --- |
| `source:empty_unverified` | 156 | 55 | http → browser_local 45, http → installed_chrome 9, browser_local → installed_chrome 2, http → provider 1 | T011 11, T036 11, T039 9, T055 9, T025 4, T016 4, T031 3, T033 3, T006 1 |
| `login_wall:no_authorization` | 32 | 9 | http → browser_local 9 | T059 9 |
| `source:connection_error` | 18 | 2 | http → browser_local 2 | T002 1, T052 1 |

- `empty_unverified` on the http rung is a page that needs scripts (a shell), not the source failing. The browser rung reads it. 101 of these attempts are the same reason on rungs where nothing later verified (T010, T012, T030, T031 and others).
- On T059 the http rung reported a login wall and browser_local then verified the page, 9 times: the http rung's `login_wall` was not the site's final answer.
- What a shadow stop would have saved on the 140 attempts that did not verify later: 28 paid calls charged $0.0853 by the spend ledger (the grant's tariff, not a bill; no paid rung runs before the decision's rung, so all of the attempt's charge is after it), and wall time after the decision of median 13.4 s, p90 53.5 s, 3,608 s in all. 27 of those 140 ended as false successes (T010 19, T031 4, T012 4, each a browser_local page that the runner did not verify); a stop would have answered `failed`/`empty_unverified` instead of those.
- What it would have lost: 66 verified answers (55 + 9 + 2). Their later rungs took median 5.3 s and one paid call ($0.0033).

Verdict for this branch: F4's `stop` is worse here. It would trade 66 verified answers for $0.0853 and about an hour of wall time across 140 attempts.

### 2. Shadow `wait_retry_after`, ladder `stop` (85 decisions, 85 attempts)

- Six tasks: T042 18, T078 18, T037 16, T018 13, T007 13, T008 7. All on the http rung, all HTTP 429.
- None of the 85 carried a Retry-After header the engine read. Every `retryAt` is 0.25 s after the fetch: the engine's own default when a 429 has no Retry-After (`?? 250` in `resilientHttp.ts`, `browserLocal.ts`, `provider.ts`). So F4's reason `retry_after` names a wait the site never asked for.
- 13 of the 85 (T018, wayfair) are a PerimeterX captcha served with status 429 (`blockReason` `captcha`, signals `px_captcha_script`, `status_429`). That is a gate, not a rate limit. F4 checks the 429 before the gate.
- Outcome of a wait: unknown. No run waited and retried. In other attempts in the same data, T007 verified 5 times and T018 5 times on the enhanced arms' http lane (combined window 1 credits the Steel grant's compatible transport for both), and T008 verified 9 times. That suggests that a different transport answers, not that waiting does, but it is not shown for these attempts.

Verdict: unknown. A 250 ms wait on a 429 that sent no Retry-After is cheap, but no data says it helps. A captcha served as 429 should not be read as a rate limit.

### 3. Shadow `next_rung`, ladder `stop` (22 decisions, 22 attempts)

- `geo_blocked`, T013, 12 attempts (enhanced arms, browser_local). Every one followed #591's initial-headers fallback: http timed out, the ladder ran its one bounded local browser fallback and returned that answer, as #591 intends. F4 looked at the fallback's page as an ordinary rung and asked for the next one in the arm's order (installed_chrome on the installed_chrome arms, 6 attempts; the Steel provider on the Steel-grant arm, 4; the combined arm, 2). Outcome unknown. T013 was verified on none of its 24 Octocrawl attempts in this data, and on 2 of 5 Firecrawl attempts.
- `bot_gate`, T049 5 and B008 5, Steel-grant arms, browser_local. In all 10 the next rung is the Steel provider, and the ladder skipped it (`ladder_channel_skipped`: a local rung set a robots.txt rule aside under a recorded robots override, and a vendor rung takes no override). F4's `next` input is the next rung in order, not the next rung the ladder may use. Driving here would have asked for a rung the policy forbids.

Verdict: 10 not allowed; 12 unknown.

### 4. Shadow `wait_same_session`, ladder `stop` (1)

- T019, standard arm, commit `5832a10f`, browser_local after #591's fallback. The region wait had held 9,482 ms of the 10,000 ms limit, so F4 could have waited at most 518 ms more. The answer was a false success (status success, `markdownCountMin` failed). Outcome of the extra wait: unknown.

## Recommendation

**Do not let F4 drive the loop yet, for any branch, flag or not.**

- Where F4 agrees with the ladder (2,388 decisions), driving with it changes nothing.
- Where it differs and the outcome can be seen (250 shadow `stop`s), it is worse: 66 of 206 attempts verified only because the ladder went on.
- Where it differs and the outcome cannot be seen (85 `wait_retry_after`, 12 `next_rung` after the #591 fallback, 1 `wait_same_session`), there is no evidence either way.
- 10 `next_rung`s point at a rung the robots policy skips.
- `reextract`, `handoff` and `paginate_or_incomplete` were never chosen in 2,746 decisions.

Changes to make in shadow first, each with a failing test, then one more shadow pass (the weekly rerun is enough, $0 on its free arms):

1. `failed` with `empty_unverified` or `connection_error` on a rung that has a next free rung → `next_rung`, not `stop` (66 lost verified answers in this data). `empty_unverified` needs scripts. `connection_error` may be the lane: T002 and T052 passed on browser_local.
2. A `login_wall` seen by the http rung, with a browser rung next → `next_rung` (T059, 9 attempts). Keep `stop` for a login wall seen by a browser rung.
3. Pass decideNext the next rung the ladder may actually use, after the robots-override and filter skips (10 attempts).
4. After #591's fallback, return the fallback's own decision, `stop`, as the ladder does (13 attempts: 12 `next_rung`, 1 `wait_same_session`).
5. Check a gate before a 429 (13 attempts), and do not call the engine's default 250 ms a Retry-After: keep `wait_retry_after` for a server-sent Retry-After or a 429 without a gate.

After that, the only branch with a case for driving behind a flag is `wait_retry_after`. It is the one branch where the ladder does nothing (85 attempts end at once), it is free, and a flag-gated rerun of the six tasks would measure it. Every other branch would either agree with the ladder or has no data.
