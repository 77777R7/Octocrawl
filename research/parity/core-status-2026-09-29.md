# Core 29 status, 2026-09-29

This record scores the 29 core features of the parity audit against the current code, for the P1 exit in [ROADMAP.md](../../ROADMAP.md). The per-feature evidence is in [core-status-2026-09-29.csv](core-status-2026-09-29.csv): each feature's status now, why, the tests, the real-site cases, the docs, the remaining gaps and an effort estimate. The audit's own files ([core-features.csv](core-features.csv), [feature-matrix.csv](feature-matrix.csv)) still describe the code at `97ef3a4` and are unchanged.

## What was scored

- **Code.** `packages/` and `apps/` as at `7e2a7b3`. The scoring commits `3dae57e`, `a096a85` and `e4b2553` change only `research/`.
- **Tests.** `npx vitest run` on `7e2a7b3`: 108 files, 1274 of 1274 tests passed.
- **Real sites.** `node research/parity/run-sites.mjs --record research/parity/runs/2026-09-29-core29-score.md` on `a096a85`: [58 of 59 cases, 284 of 286 checks](runs/2026-09-29-core29-score.md). The 39 earlier cases all pass again. Of the 20 new cases, only A23 fails.
  - Local-mode API: `W2L_TASK_ROOT=.w2l/api node --import tsx packages/api/src/cli.ts --port 8816`, with `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` from the environment (`127.0.0.1:7890`).
  - Hosted-mode API, for A29: the same command with `W2L_API_TOKEN=<token>` and `--hosted --host 127.0.0.1 --port 8817`.
  - Runner environment: `W2L_API_URL=http://127.0.0.1:8816`, `W2L_HOSTED_API_URL=http://127.0.0.1:8817` and the same `W2L_API_TOKEN`.
- **Code and docs.** Every audit issue was checked in the current code. The CSV cites file:line where it still applies.

[README.md](README.md) defines the points (solid 1, weak 0.6, partial 0.4, missing 0) and one rule: a feature is solid only when its real-site check passes, recorded with command and commit. The roadmap adds that it works, has tests and behaves as documented. This record applies those rules as follows:

- **Solid.** Works on every surface W2L offers the feature on, with tests. No remaining audit issue makes it return wrong data or silently drop input. Its real-site check, meaning the feature-matrix check or the P1 item's acceptance case, passes in the run above. Its docs say what it does. A Firecrawl option W2L refuses with a documented HTTP 400, scheduled after P1, does not block solid; a documented difference from Firecrawl's defaults does not either.
- **Weak.** Works on its main path, but a remaining defect, an unfixed audit issue or a docs contradiction keeps it from solid.
- **Partial.** Parts of the feature exist; what the audit's check needs is missing.
- **Missing.** Not implemented.
- **Paused.** In the roadmap's Paused table (search). Scored as missing.

## Counts and score

| | Solid | Weak | Partial | Missing | Paused |
| --- | --- | --- | --- | --- | --- |
| Audit (`97ef3a4`) | 3 | 6 | 10 | 10 (search included) | — |
| Now | **12** | 9 | 1 | 3 | 4 |

`node research/parity/score.mjs --status research/parity/core-status-2026-09-29.csv` gives:

- Core tier: **0.6138**, tier-weighted and unweighted alike. The audit's was 0.3655.
- All 312 features, tier-weighted: 0.2311 (audit 0.1869). This overall figure re-scores only the 29 core rows. The other 283 features keep their audit statuses, including the four non-core M1 features (links, batch-cancel, error-model, crawl-delay), which were not re-scored here.

## The P1 exit: 12 of 21

The P1 exit needs 21 solid features: M1's 17 core features, the 3 solid at the audit, and basic proxy. **12 are met and 9 are not.**

| Feature | Group | Audit | Now | Met | What blocks it (days) |
| --- | --- | --- | --- | --- | --- |
| scrape-formats.formats-array | M1 | partial | solid | yes | — |
| scrape-formats.markdown | M1 | weak | weak | no | Drop or flag `data:` image URIs; base URL for error-page Markdown; raw fallback when escalation fails; the audit's MDN/HN check (1.5) |
| scrape-formats.json | M1 | weak | weak | no | Accept `title`/`$schema`/`anyOf` and similar keywords; model fallback must not overwrite evidence-backed values under their old evidence; strict-mode schema; evidence for title/URL fills; document the schema subset (2.75) |
| scrape-formats.only-main-content | M1 | partial | weak | no | `onlyMainContent: false` still fails on a page with no main block, contrary to README.md:143; the BBC check (1) |
| scrape-formats.metadata-page | M1 | partial | solid | yes | — |
| scrape-formats.metadata-response-status | M1 | weak | weak | no | Browser lane reports `text/html; rendered` and a synthetic redirect chain; compact/MCP drop `contentType`; docs (1.25) |
| scrape-execution.timeout | M1 | partial | weak | no | Fixed lane caps (10 s headers, 20 s navigation) cut a longer `timeout` short (A23 fails); MCP ignores cancellation; docs (1.25) |
| scrape-execution.wait-for | M1 | partial | solid | yes | — |
| crawl-batch.crawl-start-async | M1 | weak | solid | yes | — |
| crawl-batch.crawl-status | M1 | weak | weak | no | `/fc` reports cancelled as failed and `total` = `completed`, unpaginated with `next` null, undocumented (0.75) |
| crawl-batch.crawl-wait | M1 | partial | weak | no | SDK waiters do not retry a transient error while polling; README/onboarding never mention `waitCrawl` (0.75) |
| crawl-batch.crawl-scrape-options | M1 | partial | solid | yes | — |
| crawl-batch.include-paths | M1 | missing | solid | yes | — |
| crawl-batch.exclude-paths | M1 | missing | solid | yes | — |
| crawl-batch.batch-wait | M1 | weak | weak | no | The same polling retry; docs (0.75) |
| platform.sdk.waiters | M1 | partial | weak | no | The same polling retry (0.5) |
| platform.client.api-key | M1 | partial | solid | yes | — |
| crawl-batch.page-limit | solid at audit | solid | solid | yes | — |
| crawl-batch.batch-start-async | solid at audit | solid | solid | yes | — |
| crawl-batch.batch-status | solid at audit | solid | solid | yes | — |
| scrape-execution.proxy-basic | basic proxy | missing | solid | yes | — (solid as P1 item 9 defines basic proxy; Firecrawl's `proxy: 'basic'` and `proxyUsed` remain missing) |

**Effort to close the nine: about 9.5 days.** The per-feature figures add up to 10.5. One 0.5-day fix, retrying transient errors in the SDK's shared polling helper (`packages/sdk/src/client.ts:295`), is counted three times there; counted once, the total is 9.5. That one fix, plus a docs pass, would move crawl-wait, batch-wait and sdk.waiters. The estimates are this record's, not measurements.

**P2 targets.** map (missing, 4 d), maxAge (missing, 4 d), the published JS SDK (partial, 3 d) and the Python client (missing, 5 d). None changed status since the audit; the SDK gained typed errors and waiters, and `useCached` now takes effect when a crawl resumes. The four search features are paused and have no code.

## New real-site checks

Cases A16–A35 in [sites.v1.json](sites.v1.json) cover the feature-matrix check of each core feature that had no case, or only one adapted to another site. [sites.md](sites.md) lists them. [run-sites.mjs](run-sites.mjs) gained four things for them:

- an `sdk` endpoint that drives the built `@w2l/sdk`;
- `apiEnv`, which points a case at a second API (the hosted one);
- the round-trip time and egress addresses of a scrape, and batch progress polls;
- the checks `eachItem urlPattern`, `itemUrls path` and `hostSpacing`.

In the recorded run, 19 of the 20 pass. A23 fails: `timeout: 20000` on httpbin.org/delay/10, which answers after 10 s, ends `failed`/`timeout` after about 11 s. The HTTP lane gives up on headers after a fixed 10 s (`packages/http-core/src/resilient.ts:60`), and the ladder does not escalate after that timeout.

One part of the audit's check for crawl-batch.crawl-start-async, restarting the API mid-crawl, cannot be a runner case. It ran as the script below on `a096a85`, from the repository root against the local-mode API above.

<details><summary>The script and its output</summary>

```bash
API=http://127.0.0.1:8816
start_api() { W2L_TASK_ROOT="$PWD/.w2l/api" nohup node --import tsx packages/api/src/cli.ts --port 8816 >> .w2l/api.log 2>&1 &
  for i in $(seq 1 60); do curl -s --noproxy '*' -o /dev/null $API/v1/monitors && return 0; sleep 1; done; return 1; }
status() { curl -s --noproxy '*' $API/v1/crawl/$1 | jq -c '{status, pagesFetched, budgetExceeded, attemptId}'; }
ID=$(curl -s --noproxy '*' -X POST $API/v1/crawl -H 'content-type: application/json' -d '{"url":"https://books.toscrape.com/","maxPages":40}' | jq -r .taskId)
for i in $(seq 1 120); do S=$(curl -s --noproxy '*' $API/v1/crawl/$ID); [ "$(echo "$S" | jq -r .pagesFetched)" -ge 8 ] && break; sleep 0.5; done
echo "before SIGTERM: $(status $ID)"
PID=$(pgrep -f 'packages/api/src/cli.ts --port 8816'); kill -TERM $PID; while kill -0 $PID 2>/dev/null; do sleep 0.2; done
echo "task row: $(sqlite3 .w2l/api/$ID/checkpoint.sqlite 'select status from tasks')"
start_api; echo "after restart: $(status $ID)"
for i in $(seq 1 240); do [ "$(curl -s --noproxy '*' $API/v1/crawl/$ID | jq -r .status)" = completed ] && break; sleep 1; done
echo "final: $(status $ID)"
sqlite3 -readonly .w2l/api/$ID/checkpoint.sqlite "select group_concat(status || ':' || (select count(*) from steps s where s.attempt_id = a.id), ', ') from (select * from attempts order by started_at) a"
sqlite3 -readonly .w2l/api/$ID/checkpoint.sqlite 'select count(distinct canonical_url) from steps'
```

Output (2026-09-29T12:08:56Z to 12:09:18Z):

```
before SIGTERM: {"status":"running","pagesFetched":9,"budgetExceeded":null,"attemptId":"4433cb0d-…"}
task row: paused
after restart: {"status":"running","pagesFetched":0,"budgetExceeded":null,"attemptId":"fa42c7b4-…"}
final: {"status":"completed","pagesFetched":40,"budgetExceeded":"pages","attemptId":"fa42c7b4-…"}
interrupted:9, completed:40
40
```

</details>

The shutdown paused the crawl. The restarted API resumed it by itself, and it completed with 40 distinct URLs across both attempts and `budgetExceeded: pages`.

## Not verified

- **Checks not run.** The feature-matrix checks for markdown (the MDN 404 page, news.ycombinator.com) and for onlyMainContent (bbc.com/news/technology). The prompt-only half of the JSON check cannot run: a JSON format without a schema is refused.
- **Surfaces the real-site set does not reach.** It calls REST, `/fc` scrape and the SDK. MCP tools, `/fc` crawl status and the CLIs were exercised only by the unit and integration tests cited in the CSV.
- **A25 depends on the proxy.** It assumes the proxy routes the runner's request and W2L's the same way. The exit address changed between runs (96.45.186.105 in a preliminary run, 23.132.124.134 in the recorded one), and both times it matched W2L's.
- **A35 spacing is W2L's own record.** The spacing comes from the `crawl_delay` events W2L writes; the runner cannot observe W2L's requests.
- **A29 ran on loopback.** The hosted-mode API was on loopback, not a deployment.
- **Tests were read, not re-derived.** The cited tests passed in the full suite. Their assertions were read against the behaviour claimed; they were not re-derived.

## Found in passing (follow-ups, not fixed here)

- **Path filters (ReDoS).** `includePaths` / `excludePaths` regexes run unguarded against link paths the crawled page controls, a ReDoS risk (`packages/runtime/src/frontier.ts`).
- **Hosted crawl limit.** A hosted crawl can bypass the default 100-page limit with `maxPages: null`. Hosted mode is paused.
- **`--token` parsing.** `--token` followed by another flag takes the flag as the token, and a trailing `--token` is ignored (`packages/api/src/listen.ts:73`).
- **Wikipedia main content.** It keeps the language list and the hidden categories (seen in A16's response).
- **Map docs.** `docs/firecrawl-shim.md:19` says Map will not be added; the roadmap schedules it for P2.
- **SDK 404 messages.** `apps/public-web/content/reference.md:38` quotes 404 messages the SDK does not produce for page lists (`packages/sdk/src/client.ts:331`).
