# G3 real-site run: access sessions and egress pool, one window (2026-10-07)

ROADMAP PA item 3. The egress pool and the task cookie session (PRs #239, #242, #247) were run against real sites for the first time, through a real forward proxy; PR #247 had recorded "Real multi-exit behaviour has been run only against local fake proxies". Four batches, one window, source `0f1bf8f`. This record covers the clauses the code can show today and lists the clauses it cannot; item 3 is not accepted by it (see the verdict).

## How it was run

- 2026-10-07 15:23–15:28 UTC, source `0f1bf8f` (clean), one local API on port 8797, fresh task root (`W2L_TASK_ROOT`), `W2L_ACCESS_GRANT={"tier":"standard","capabilities":["egress_sessions"]}`, `W2L_PER_HOST_CONCURRENCY=1`, `W2L_PER_HOST_MIN_DELAY_MS=1200` (phase 1 batch 1 ran before the pacing was set), Chrome not involved (lane `http` throughout).
- Proxied through the pool only: `HTTPS_PROXY`/`HTTP_PROXY` unset for the API, so every page left through `W2L_EGRESS_PROXIES`. The real exit is the machine's forward proxy `127.0.0.1:7890`; `127.0.0.1:9` is a port nothing listens on, standing in for a dead proxy. No proxy provider with several exits was available, so the pool had one working exit at most.
  - Phase 1: `W2L_EGRESS_PROXIES=http://127.0.0.1:9,http://127.0.0.1:7890`.
  - Phase 2: `W2L_EGRESS_PROXIES=http://127.0.0.1:7890`.
- Start: `node --import tsx packages/api/src/cli.ts` with the variables above (after `npx tsc --build`); interrupt: `kill -TERM <pid>`; restart: the same command on the same task root.
- Batches: `POST /v1/batches` with `{urls, formats:["markdown"], maxConcurrency:2, maxAge:0}`; checks from `GET /v1/batches/:id`, `GET /v1/batches/:id/items?debug=true` (traces `egress_proxy`, `egress_switched`, `session_cookies`; `evidenceRecord.proxy`), `GET /v1/batches/:id/errors`, and the task's `checkpoint.sqlite` (`steps` rows with a result per URL, `attempts`).
- Raw outputs, the driver script and the API logs: `.w2l/access/runs/2026-10-07-g3-0f1bf8f/` (not committed).

## Results

| Batch | URLs | Pool | What was done | Result |
| --- | --- | --- | --- | --- |
| 1 (`03cebc2a`) | 40: books.toscrape.com catalogue pages 1–40 | dead, 7890 | ran to the end | 40/40 success, all through `127.0.0.1:7890`; one `egress_switched` `{from: 127.0.0.1:9, to: 127.0.0.1:7890, reason: unreachable, switches: 1}` before the first page; one session id on all 40 pages |
| 2 (`a0ba8b8b`) | 84: books 1–50, quotes.toscrape.com pages 1–10, scrapethissite.com forms pages 1–24 | dead, 7890 | SIGTERM after 11 pages, restart | after SIGTERM: task `paused`, attempt `interrupted` with `pages_fetched 11`; after restart: `completed`, second attempt `pages_fetched 73`; 84 `steps` rows with a result, one per URL, none duplicated; `egress.json` held `127.0.0.1:7890` at the interrupt and every page of both attempts left through it (the dead proxy was not probed again); 84/84 success |
| 3 (`b1688acc`) | 8: httpbin.org `/cookies/set?g3=one`, six `/get?i=N`, `/cookies` | 7890 | SIGTERM after 2 pages, restart | `cookie-session.<route>.json` present at the interrupt with the session id; after restart the same id on all 8 pages (`session_cookies` on `/cookies`: `requestsWithCookies 1`); the `/cookies` page read after the restart returned `{"cookies": {"g3": "one"}}`; 8/8, no duplicate rows, attempts `interrupted 2` then `completed 6` |
| 4 (`c4cd6289`) | 4: httpbin.org `/status/429?n=1,2`, `/get?a=1,2` | 7890 | ran to the end | the two 429 pages `blocked`, `rate_limit`, HTTP 429 in `/errors`; the two others success; no `egress_switched` in any trace or the API log; the batch stayed on `127.0.0.1:7890` |

Against item 3's clauses:

- Sessions have a lifecycle (created, reused, expired, restored from a checkpoint): shown for the task cookie session. Created at the batch's start, reused by every page, written to the task directory once a cookie exists (batch 3), restored with the same id and cookies after a restart (batch 3), removed when the run ends (all four). Not shown: revoked (no route revokes a task session; cancelling the task removes it).
- A list task that fails at page N resumes there with no lost or duplicated records: shown at URL granularity (batch 2: 11 then 73, 84 rows, none twice). See "Not covered" for a page inside one list step.
- The user brings one proxy or a list: shown with a list of two (batch 1 and 2). `HTTPS_PROXY` keeps working: not exercised here, the environment variables were unset; the G1 records ran with them set.
- A session binds egress, cookies and profile for one site and task; failed egresses cool down; switching is bounded and happens on an explicit failure: the binding is per task (`egress.json`) and held across the restart (batch 2); the dead exit was left after one probe (batch 1, 2) and not retried within the run; the switch count is in the trace. The 10-minute cooldown and the two-switch cap were not reached in this run: with one working exit there was nothing to switch to a second time.
- A 429 is never answered by switching egress and continuing: shown (batch 4).
- Records name the egress: `evidenceRecord.proxy` is `127.0.0.1:7890` on every page; the route and the switch are in the trace only.

When batch 2 was resumed, the session id changed (one id on the 11 pages before the interrupt, another on the 73 after). None of the three sites sets a cookie, so the jar never changed and no session file was written; a resume then starts a new empty session, as PR #242 states. Nothing was lost by it, but a reader comparing session ids across a restart will see two.

## Not covered

- A list step's page N: a `paginate` action runs inside one scrape of one URL, and the checkpoint is per URL (`packages/contracts/src/checkpoint.ts`), so a failure at page N of a list step refetches the whole URL on resume. This run resumed at URL granularity only. Showing the clause as written needs a checkpoint inside the list step.
- A challenge at page N pauses, is handled or handed over, is verified at page N and continues: a challenge ends the item `blocked`; the handoff route works after the batch has finished and replaces the item, it does not continue the list. Not run.
- `access` fields for session, egress and location on every result: the Evidence Record has `proxy` (host:port) and no session, egress or location field (ROADMAP's Evidence Record section marks them "Planned with PA"); the session id is in the `session_cookies` trace only. Not run.
- Several real exits: one working exit. Rotation across working exits, a switch to a second working exit, the cooldown ending and the two-switch cap were not exercised on real sites; `packages/api/test/egressPool.test.ts` covers them against local fake proxies.
- Per-host pacing, robots.txt and budgets staying put across an egress change: not measured here. The scheduler is shared across egresses in code (`packages/api/src/engine.ts`, `originScheduler`); no test or run shows it across a switch.
- A logged-in session: mode `authed` never uses the pool; no login task was run.
- Nothing moving between executors inside an established interactive session: no interactive session was run.
- A browser session kept across steps (managed sessions): `captureManagedSession` opens and closes a browser per URL; no live context across steps exists. Not run.

## Verdict

Item 3 is not accepted by this record. The clauses the code implements today hold on real sites through a real proxy: pool binding, one probe-driven switch, resume without loss or duplication at URL granularity, a cookie session restored across a restart, and a 429 that never moves the task. The clauses in "Not covered" need code before a record can show them: a checkpoint inside a list step, pause and continue at page N after a challenge, and session, egress and location fields in the Evidence Record's `access` block; a run with a proxy provider offering several exits is also still owed.
