# Healthy 25 after the T016 fix: `main` `fb2db7cc` against the pinned control `2ffd7f25`, 2026-10-22

**What:** a supplementary run of the 25 healthy tasks, asked for by Howard on 2026-10-22. It checks that with the T016 fix (#671, `33f2c174`), the candidate's healthy 25 is no longer below the same-window main control. That control is the done criterion "健康 25 题不低于同窗口 main" of `docs/pa-enhancement-tasks.md`.
- In both K1 windows, the candidate was one task below the control, on T016 (`research/access/runs/2026-10-22-k1-two-windows-b233d232.md`). Those windows pinned runner packages equal to `322de68e`, so they predate the fix.
- This is a new record. The K1 window records are unchanged.

**Answer:**
- **The candidate's healthy 25 is at or above the control's: 22 of 25 against 20 of 25.**
- **T016 is verified on both arms.** Candidate: `browser_local`, 8,454 ms. Control: `browser_local`, 8,112 ms.
- This is one run per arm on one day. The two tasks where the candidate leads (T020, T067: the control got a `cloudflare_challenge`) are not isolated as an engine difference.

## Conditions

| Item | Value |
| --- | --- |
| Candidate | `main` `fb2db7cc` (#680), which includes #671 (`33f2c174`) and #679 (`dbb1fbab`). It was the head of `origin/main` when the run was pinned (12:02 UTC). #681 (`ff1e636e`) landed afterwards; it touched records and the K1 drivers only, not the engine, so the candidate was kept. This record is committed on a branch from `ff1e636e`. The answers' Evidence Records say `extract-tf/39` on all 25 |
| Control | `2ffd7f2536d84184f0d1caf24cdd724b81ed7dad`, in its own checkout (`.claude/worktrees/k1-control-2ffd7f25`). The answers' Evidence Records say `extract-tf/30` on all 25 |
| Build | `npm ci` and `npx tsc --build` in the candidate checkout, and `npx tsc --build` in the control checkout, just before the run. The runner's line for every block, on both arms: "Engine build: up to date (this checkout's packages/*/dist against its source, `tsc --build --dry` at the start)". That check reads the runner's own checkout, which is the candidate's. It cannot see the control's API, which was built separately |
| Arms | Both free: no grant, no paid route, access `"standard"`, maxAge 0, each task's own contract and timeout. These are the K1 windows' standard-arm settings. The runner (`research/access/run-set.mjs` at `fb2db7cc`) is the same for both; only the API differs |
| APIs | Candidate on `127.0.0.1:8841`, control on `127.0.0.1:8842`. Each had its own `W2L_TASK_ROOT` under `.w2l/access/k1h/2026-10-22/` and `W2L_SOURCE_COMMIT` set to its commit. Both were stopped after the run (ports checked free) |
| Interleaving | The 25 healthy tasks in task-file order, in 5 blocks of 5. Blocks 0, 2 and 4 ran candidate then control; blocks 1 and 3 ran control then candidate |
| Network | **Proxied**: HTTPS_PROXY=http://127.0.0.1:7890 (Clash), HTTP_PROXY the same, NO_PROXY=localhost,127.0.0.1,::1,.local. The exit address sampled at the start of every run was `103.142.140.131` |
| Time | 2026-10-22, 12:03:07–12:05:55 UTC. pmset showed no sleep during the run |
| Cost | $0 (no paid route). Clash bandwidth: not measured |
| Raw runs | `.w2l/access/runs/2026-10-22T12-03-07-005Z` … `2026-10-22T12-05-46-174Z` (10 runs) and the runner's own records `.w2l/access/k1h/2026-10-22/<arm>-b<n>.md` (git-ignored) |

The driver was a scratch zsh script outside the repository. Its effect:

```sh
export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 NO_PROXY=localhost,127.0.0.1,::1,.local
W=.w2l/access/k1h/2026-10-22
W2L_TASK_ROOT=$PWD/$W/api-candidate W2L_SOURCE_COMMIT=$(git rev-parse HEAD) node --import tsx packages/api/src/cli.ts --port 8841 &   # candidate checkout at fb2db7cc
(cd .claude/worktrees/k1-control-2ffd7f25 && W2L_TASK_ROOT=… W2L_SOURCE_COMMIT=$(git rev-parse HEAD) node --import tsx packages/api/src/cli.ts --port 8842) &
# for each block b of 5 healthy tasks, in the alternating order above, for each arm:
W2L_API_URL=http://127.0.0.1:<8841|8842> W2L_EGRESS_ECHO_URL=https://api.ipify.org \
  node research/access/run-set.mjs --set all --only <the block's 5 ids> --access '"standard"' --save-responses --record $W/<arm>-b<b>.md
```

## Results (first calls, 25 tasks each; nothing not run)

| Arm | Planned | Attempted | Verified | False success | p50 / p95 wall ms |
| --- | --- | --- | --- | --- | --- |
| Candidate `fb2db7cc` | 25 | 25 | **22** | 0 | 2504 / 7049 |
| Control `2ffd7f25` | 25 | 25 | 20 | 1 (T039) | 1979 / 8112 |

- Both arms failed T027 (`http_error`), T039 and T052. On T039 the candidate got a `captcha`; the control answered success with a failed predicate, so it counts as a false success. On T052 both got a `cloudflare_challenge`.
- The arms differ on T020 and T067: verified on the candidate, `cloudflare_challenge` on the control.

## Per task

| Task | Block | Candidate | Candidate lane | Candidate ms | Control | Control lane | Control ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T015 | 0 | yes | http | 2142 | yes | http | 1871 |
| T016 | 0 | yes | browser_local | 8454 | yes | browser_local | 8112 |
| T020 | 0 | yes | browser_local | 7049 | no (cloudflare_challenge) | browser_local | 1979 |
| T024 | 0 | yes | http | 2055 | yes | http | 1892 |
| T027 | 0 | no (http_error) | http | 2434 | no (http_error) | http | 1422 |
| T033 | 1 | yes | http | 3306 | yes | http | 3143 |
| T035 | 1 | yes | http | 1881 | yes | http | 1713 |
| T036 | 1 | yes | browser_local | 6546 | yes | browser_local | 5981 |
| T039 | 1 | no (captcha) | browser_local | 2844 | FALSE | browser_local | 12141 |
| T040 | 1 | yes | http | 1194 | yes | http | 1398 |
| T041 | 2 | yes | http | 1698 | yes | http | 1520 |
| T044 | 2 | yes | http | 2725 | yes | http | 2648 |
| T051 | 2 | yes | browser_local | 5020 | yes | browser_local | 5549 |
| T052 | 2 | no (cloudflare_challenge) | browser_local | 4437 | no (cloudflare_challenge) | browser_local | 4329 |
| T058 | 2 | yes | http | 809 | yes | http | 934 |
| T059 | 3 | yes | browser_local | 4044 | yes | browser_local | 3117 |
| T061 | 3 | yes | http | 2329 | yes | http | 3040 |
| T062 | 3 | yes | browser_local | 6225 | yes | browser_local | 6054 |
| T063 | 3 | yes | http | 948 | yes | http | 1175 |
| T067 | 3 | yes | browser_local | 4198 | no (cloudflare_challenge) | browser_local | 2185 |
| T072 | 4 | yes | http | 3506 | yes | http | 1213 |
| T074 | 4 | yes | http | 750 | yes | http | 829 |
| T077 | 4 | yes | http | 2260 | yes | http | 1604 |
| T079 | 4 | yes | http | 2230 | yes | http | 1870 |
| T080 | 4 | yes | http | 2504 | yes | http | 2295 |
