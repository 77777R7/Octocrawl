# CapSolver proxyless token test, 2026-10-25

One small live test of Octocrawl's third-party CAPTCHA solver (CapSolver, ADR 0005 `third_party_captcha_solver`) with Octocrawl's Webshare exit out of the path. The question: does CapSolver itself clear Turnstile and reCAPTCHA v2 when our proxy is not in the way? At most 2 paid solves, token types only.

## Run

- Source commit `4a3be9a0` (origin/main after #715, clean; `npx tsc --build` exit 0). Branch `claude/capsolver-proxyless-test` in worktree wizardly-poitras-e148a8, no changes.
- API from source on port 8857 (`W2L_API_PORT=8857 W2L_ACCESS_GRANT=<grant> node --import tsx packages/api/src/cli.ts`, `CAPSOLVER_API_KEY` from `.w2l/access/capsolver.env`, `W2L_SOLVER_PROXY` and `W2L_EGRESS_PROXIES` unset). Stopped afterwards; 8791 not touched.
- Command: `W2L_API_URL=http://127.0.0.1:8857 node research/access/run-set.mjs --tasks research/access/captcha-tasks.v1.json --arm proxyless+solver --set all --only C009,C010 --save-responses --raw-html --access '"enhanced"' --grant ~/Code/w2l/.w2l/access/capsolver-grant-proxyless-2026-10-25.json`. 19:09:14 → 19:10:15 UTC, exit 0.
- Run directory: `.w2l/access/runs/2026-10-25T19-09-14-348Z` in that worktree, copied to `captcha-hold/runs/2026-10-25T19-09-14-348Z` next to this record.
- Grant `~/Code/w2l/.w2l/access/capsolver-grant-proxyless-2026-10-25.json` (git-ignored, 0600), SHA-256 `7b0cf0105f7594fd09c5df24ff71bc3d0d2497c1e304fc04a4d961824d7372d2`: capabilities installed_chrome, third_party_captcha_solver; `solver: {vendor: "capsolver", egress: "none"}` (only AntiTurnstileTaskProxyLess and ReCaptchaV2TaskProxyLess can run); tariff `perSolveUsd` 0.003, `maxSolvesPerCall` 1; budget $0.003 a request, $0.006 a run. Attestation: Howard, 2026-10-25, in chat, relayed by the coordinating session.
- Network: **proxied via Clash** (`HTTPS_PROXY=http://127.0.0.1:7890`) for every rung and for CapSolver's API. No Webshare anywhere: the API's startup line said "no solver exit, so DataDome and Cloudflare challenges are not solved", and each answer's Evidence Record names egress `127.0.0.1:7890`, source `environment`.
- Machine: AC power, lid open (`pmset -g batt`, AppleClamshellState No) at 19:06 UTC.

## CapSolver balance

| When (UTC) | Balance |
| --- | --- |
| 19:07:52 (before) | $9.9988 |
| 19:10:54 (after the run) | $9.9988 |
| 19:11:52 (after the diagnostic below) | $9.9988 |

Delta: $0. Ledger charge: $0. Paid solves: 0 (no CapSolver task was created).

## Result

| Task | Challenge | Rung | CapSolver called | Token | Submitted | Page judged again | Outcome | Seconds added |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C009 2captcha.com Turnstile demo | Turnstile widget, sitekey `3x00000000000000000000FF` | browser_local | yes, trigger `task_contract`, createTask refused `ERROR_INVALID_TASK_DATA` | no (no task) | no | no injection, so no new judgement; verdict stays `task_contract_unmet` | `solver_failed` | 0.52 |
| C009 | | installed_chrome | yes, same refusal | no | no | as above | `solver_failed` | 1.60 |
| C010 2captcha.com reCAPTCHA v2 demo | reCAPTCHA v2 checkbox, sitekey `6LfD3PIbAAAAAJs_eEHvoOl75_83eXSqpPSRFJ_u` | browser_local | yes, trigger `task_contract`, createTask refused `ERROR_INVALID_TASK_DATA` | no (no task) | no | as above | `solver_failed` | 0.64 |
| C010 | | installed_chrome | yes, same refusal | no | no | as above | `solver_failed` | 1.73 |

Both tasks: API status `success`, verified 0 of 2, false success 2 of 2 (the "passed successfully" contract never matched). Wall time 31.5 s (C009) and 29.8 s (C010); the solver's createTask round trips add about 2.1 s and 2.4 s of that. Seconds added are the `captcha_solve` events' `ms`.

Unlike the earlier smoke and re-smoke runs, both pages loaded and the task-contract trigger fired on both rungs.

## Why CapSolver refused (diagnostic, 19:11:33 UTC)

The adapter keeps only a fixed vocabulary from CapSolver's `errorDescription`, and these events carry no hint. To read the refusal, the two task bodies the adapter builds were sent once more to `createTask` straight from a scratch script, through Clash. A refused createTask creates no task and bills nothing. The answers:

- C009 `AntiTurnstileTaskProxyLess`: HTTP 400, `ERROR_INVALID_TASK_DATA`, "invalid task data: invalid websiteKey (3x00000000000000000000FF)". No task.
- C010 `ReCaptchaV2TaskProxyLess` (`isInvisible: false`): HTTP 400, `ERROR_INVALID_TASK_DATA`, "the sitekey is not supported". No task.

Reading:
- C009's widget carries `3x00000000000000000000FF`, one of Cloudflare's published Turnstile test sitekeys (the one that forces an interactive challenge), not a production key. CapSolver rejects it as invalid. Whether 2captcha serves this test key to every visitor or only to some is not known: only this run's browsers were checked.
- C010's sitekey is a real-looking production key, and CapSolver says it does not support it. Why (for example, a refusal of a competitor's demo key) is not known: CapSolver did not say.
- So neither refusal comes from the adapter's request body; both come from the demo pages' sitekeys. No adapter fix is needed to run, but these two demo pages cannot test CapSolver.

## Answer to the question

Not answered. With the Webshare exit out of the path, CapSolver was called on both pages and refused both before solving anything. On these pages it neither cleared nor failed a Turnstile or reCAPTCHA v2 solve. The pages are unfit for testing CapSolver; CapSolver's behaviour on real token widgets is still untested.

## Other findings (not fixed)

1. A refused createTask does not count against `maxSolvesPerCall`. installed_chrome made a second createTask on each page after browser_local's refusal: 4 calls for 2 pages at "at most 1 a page". No money moved (no task, no bill), but the per-page limit counts created tasks, not calls.
2. The harness's solver columns read `paidCalls`, and a refused createTask writes no paid-call row. `attempts.jsonl` therefore says `solver.calls 0, attempted 0` while the trace holds 4 `captcha_solve` events. A report built from it would say the solver was never tried.
3. `capSolverHint` keeps neither "invalid websiteKey" nor "sitekey is not supported", so the record says only `rejected` / `ERROR_INVALID_TASK_DATA` and cannot tell an unsupported site key from a malformed body.
