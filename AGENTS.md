# Instructions for coding agents

## What to work on

Read the "Current phase" section of [ROADMAP.md](ROADMAP.md) before starting. Work only on items of the current phases, or on what the person asking explicitly requests. The roadmap's "Paused" table names paused features precisely; they are not worked on unless the person asks, and if a task seems to require one, say so instead of starting it. Firecrawl-compatible features that the table does not name, such as the P1 items, are in scope.

A change is done when it moves the current phase's exit condition. In P1 that means a core feature becomes solid (it works, has tests, passes its real-site test and behaves as documented) or a real-site test passes. A merged PR, a green test run or a new evidence document is not by itself progress on the roadmap.

## Parity work

- Reproduce a reported gap with a failing test before changing code: a local fixture, plus the matching real-site case in [research/parity/sites.md](research/parity/sites.md) where one exists. The audit's first pass was wrong in 90 places, so a gap nobody has reproduced is not yet a task.
- The comparison is frozen at firecrawl-js v4.42.0. Do not follow newer Firecrawl behaviour.
- Record every real-site run with its command and source commit.

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
