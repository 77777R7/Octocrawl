# Instructions for coding agents

## What to work on

Read the "Current phase" section of [ROADMAP.md](ROADMAP.md) before starting. Work only on items of the current phase, or on what the person asking explicitly requests. Items in the roadmap's "Paused" table are not worked on unless the person asks; if a task seems to require one, say so instead of starting it.

A change is done when it serves the current phase's exit condition: the seed user can use the result. A merged PR, a green test run or a new evidence document is not by itself progress on the roadmap.

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

Two tests call live websites (`packages/api/test/monitor.test.ts`, `packages/api/test/session.test.ts`) and can fail without network access; say so when reporting results rather than treating it as a regression.

## Commits

Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `research:`) and sign off every commit (`git commit -s`, see [CONTRIBUTING.md](CONTRIBUTING.md)).
