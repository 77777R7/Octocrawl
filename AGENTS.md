# Instructions for coding agents

## What to work on

Read the "Current phase" section of [ROADMAP.md](ROADMAP.md) before starting. Work only on items of the current phases, or on what the person asking explicitly requests. The roadmap's "Paused" table names paused features precisely; they are not worked on unless the person asks, and if a task seems to require one, say so instead of starting it. Firecrawl-compatible features that the table does not name, such as the P1 items, are in scope.

A change is done when it moves the current phase's exit condition. In P1 that means a core feature becomes solid (it works, has tests, passes its real-site test and behaves as documented) or a real-site test passes. A merged PR, a green test run or a new evidence document is not by itself progress on the roadmap.

## Parity work

- Reproduce a reported gap with a failing test before changing code: a local fixture, plus the matching real-site case in [research/parity/sites.md](research/parity/sites.md) where one exists. The audit's first pass was wrong in 90 places, so a gap nobody has reproduced is not yet a task.
- The comparison is frozen at firecrawl-js v4.42.0. Do not follow newer Firecrawl behaviour.
- Record every real-site run with its command and source commit.

## Real-site runs

- Start the local API with `npm run api` (port 8787, `W2L_API_PORT` to change), then run `node research/parity/run-sites.mjs --batch L --record research/parity/runs/<YYYY-MM-DD>-<label>-<commit>.md`.
- Local mode follows `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` from the shell. Say in every record whether the run was proxied or direct; a site can pass one way and fail the other.
- Run `research/**/*.py` in a virtualenv (for example `.w2l/pyenv`), never with system `pip`.

## Evidence honesty

W2L sells traceable data, so its own reports must be traceable too.

- Unknown is not zero. Leave unmeasured values null or "unknown"; never fill them with 0, an estimate or a value from another source.
- Keep every failed, blocked or incomplete item in the denominator. Do not replace or drop URLs after a test set is frozen.
- Report what a run actually showed, with the command and source commit. Do not describe unverified behaviour as working.
- Files under `docs/evidence/` and dated reports under `research/` are records of past runs. Do not edit their findings; write a new dated record instead.

## Data handling

The seed user's workbook, raw captures and batch outputs stay under `.w2l/` (git-ignored). Never commit them. `research/coos-pilot/` holds only public URLs, counts and scripts.

## Scope

- Keep changes to what the task needs. Report nearby bugs, cleanup ideas and refactors as follow-ups in your summary instead of making them.
- Edit files surgically; do not rewrite a whole file for a small change.
- Keep scratch scripts and ad-hoc checks outside the repository (for example under `/tmp`) and delete them when done. Add tests where the task needs them, sized like the neighbouring test files.
- Do not add new status or evidence documents unless asked.

## Commands

```bash
npm ci
npx playwright install chromium
npm run typecheck
npm test
```

`npm test` passes offline. Tests that call live websites are named `*.live.test.ts` and run under `npm run test:live` (today `packages/api/test/monitor.live.test.ts`); they need the network and can fail when a site changes or is down, so say so when reporting their results rather than treating a failure as a regression.

A test that bounds elapsed time goes in a `*.perf.test.ts` file (or, for a real browser or HTTP wait, a file `vitest.config.ts` runs in its timed group), not among the parallel tests; see the Testing section of [CONTRIBUTING.md](CONTRIBUTING.md).

## Branches

- Start every task with `git fetch` and a branch from current `origin/main`. Do not keep building on a long-lived branch: one PR per work group, and no branch more than one group behind main. A branch that drifted 223 commits behind main once needed a 62-file merge and was abandoned.
- Several agent sessions work on this repository at once, each in its own worktree under `.claude/worktrees/`. Do not edit, merge or rebase another session's branch or worktree.

## Commits

Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `research:`) and sign off every commit (`git commit -s`, see [CONTRIBUTING.md](CONTRIBUTING.md)).

## Public preview deploys

Deploy only when the person asks. The Cloud Run service routes traffic to tagged revisions, so `gcloud run deploy` alone leaves the old revision serving. After each deploy run `gcloud run services update-traffic <service> --to-revisions=<new>=100 --update-tags=<tag>=<new> --project="$W2L_PROJECT_ID"`, then confirm the live URL serves the new revision. Keep the previous tag as the rollback. Pass `--project` on every `gcloud` call, because no default project is set.
