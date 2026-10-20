# PA E7: one controlled Steel paid-call chain through a crash, 2026-10-20

What this checks (docs/pa-enhancement-tasks.md, E7): a paid Steel call whose process is killed while its session is live
is found again by the run that resumes the task, its session released, and its charge taken from what Steel billed; the
task's `paid_calls` rows, its attempts' `chargedUsd` and Steel's own session records agree.

- Source commits: run 1 `ca406b1d`, run 2 `a4204401` (branch `claude/pa-e-paid-persist`, PR for PA E1–E5).
- Network: direct (`HTTPS_PROXY`/`HTTP_PROXY` unset). The Steel API and the CDP connection both went direct.
- Grant: `~/Code/w2l/.w2l/access/steel-grant.json`, SHA-256 `67acb9bc515429e9c1258253f2da648bea1738a41dbcd77c8455526b323cd239`; capabilities `compatible_transport`, `vendor_remote_browser`, `vendor_stealth` (no `vendor_residential_proxy`, checked by the script before it built the rung); Steel tariff `perHourUsd 0.1`, `maxSessionMs 120000`, `minBilledMs 1`, `billingIncrementMs 1`. Price ceiling per call $0.003333.
- Budget: task `maxCostUsd` $0.05, one page (`https://example.com/`, `maxDepth 0`, `maxPages 1`).
- Spend: four Steel sessions, each billed $0.001667 by Steel's `GET /v1/sessions/{id}/cost` (one browser minute each): **$0.006668** in all. One duplicate-create probe created no session ($0).

## Method

A scratch script (outside the repository; text below) builds the real Steel rung with `buildChannels` under the grant,
and runs it as the only rung of a `LadderRunner` inside a `CrawlOrchestrator` over a `SqliteTaskStore`.

1. `MODE=crash`: the store kills the process with SIGKILL 4 s after the paid call's row turns `submitted` (Steel created
   the session, named from the call's `paidCallId`). The session is then live at Steel.
2. Steel is asked directly (`GET /v1/sessions/{id}`) what it holds for the session.
3. `MODE=resume`: the same task is resumed with `steelPaidCallReconciler`; the ladder then reads the page again.
4. Steel is asked again for both sessions and their `/cost`.

```
MODE=crash  TASK_DIR=<dir> TSX_TSCONFIG_PATH=<paths to packages/*/src> node --import tsx steel-live.mts
MODE=resume TASK_DIR=<dir> RESUME=<taskId> TSX_TSCONFIG_PATH=... node --import tsx steel-live.mts
```

## Results

### Run 1 (`ca406b1d`, 06:36:11Z–06:37:18Z): found the session, but recorded $0

| Row | State | chargedUsd | Steel session | Steel status before resume | Steel `/cost` asked later |
| --- | --- | --- | --- | --- | --- |
| attempt 1, call 1 (crashed) | settled | **0.0** | `e7c6200e-882d-5fcd-91fb-4af27014bb93` | live, 12448 ms, `/cost` 409 ("available after the session has been released") | $0.001667, 1 browser minute |
| attempt 2, call 1 | settled | 0.000561 (tariff-measured) | `c35d590c-e08c-5fc0-b99f-05f5fc398725` | — | $0.001667, 1 browser minute |

- Steel created the session under the UUIDv5 the call asked for (the returned id equals the name).
- The resume found it by that name, released it (`releaseReason: user_requested`), and read `/cost` at once. Steel answered
  200 with `totalCost` 0 for it, and the call was settled at $0, though Steel bills that session $0.001667 when asked
  later. That is an unknown charge recorded as a known zero, which E forbids. Fixed in `a4204401`: a cost is final only
  when it is above 0 and bills browser time; until then it is read again (waits 1, 2, 4, 8, 15 s), and a cost never
  final leaves the call `unknown`.

### Run 2 (`a4204401`, 06:38:21Z–06:38:54Z): settled at what Steel billed

| Row | State | chargedUsd | Steel session | Steel status before resume | Steel `/cost` |
| --- | --- | --- | --- | --- | --- |
| attempt 1, call 1 (crashed) | settled | **0.001667** | `4a1c5f78-a576-5dbf-9ab7-a3c93e509866` | live, 5416 ms | $0.001667, 1 browser minute, released `user_requested` |
| attempt 2, call 1 | settled | 0.000499 (tariff-measured) | `5f29e40b-2e66-5a56-b263-8e3fbdb939a9` | — | $0.001667, 1 browser minute |

- The interrupted attempt's `chargedUsd` is $0.001667, its call's row; the task's status `paidCalls`:
  `knownChargedUsd 0.00216575, unknownExposureUsd 0, reservedUsd 0, refundableUsd 0, calls { settled: 2 }`.
- The page: `success`, lane `provider`, HTTP 200.
- After the run Steel listed no live session (`GET /v1/sessions?status=live`: empty).

### Other Steel answers seen

- `GET /v1/sessions/{random UUID}`: 404 "Session not found". The reconciler's `released` rests on this answer for the
  call's first session name; not exercised live here (the crash came after the session existed).
- `POST /v1/sessions` with the `sessionId` of a released session (`4a1c5f78-…`): HTTP 504 after a wait; no session was
  created (that id stayed `released`, created 06:38:23Z, and no session was live afterwards). Whether Steel refuses a
  reused name with a definite status is unknown; it did not open a second session under it.

## Found

- The grant's Steel tariff charges by the millisecond (`billingIncrementMs 1`), but Steel bills each session by the
  started minute: the second call of each run was charged $0.000561 and $0.000499 by the ledger, and Steel billed
  $0.001667 for each. The tariff's ceiling ($0.003333 for 120 s) still bounds one minute's bill, so no cap was passed;
  the measured charges understate Steel's bill. Not changed here.

## The script

```ts
/**
 * PA E7 live check, one controlled Steel call chain through the product code (scratch, outside the repo).
 * MODE=crash: a crawl of example.com whose only rung is the real Steel channel under the grant; the process kills
 *   itself 4 s after the call's row turns `submitted` (Steel created the session, named from the paidCallId).
 * MODE=resume: the same task resumed with the real Steel reconciler, then the ladder reads the page again.
 */
import { readFileSync } from 'node:fs'
const W = '/Users/howard07/Code/w2l/.claude/worktrees/pa-b-doc-capture-2463a5/packages'
const { DEFAULT_CRAWL_BUDGET } = await import(`${W}/contracts/src/index.ts`)
const { accessGrantFromText, accessGrantRef } = await import(`${W}/http-core/src/index.ts`)
const { CrawlOrchestrator } = await import(`${W}/runtime/src/orchestrator.ts`)
const { SqliteTaskStore } = await import(`${W}/runtime/src/sqliteStore.ts`)
const { buildChannels } = await import(`${W}/bench/src/ladderCli.ts`)
const { LadderRunner } = await import(`${W}/bench/src/routing/ladder.ts`)
const { LadderScrapeAtom } = await import(`${W}/bench/src/scrapeAtom.ts`)
const { steelPaidCallReconciler } = await import(`${W}/bench/src/vendors/paidSessions.ts`)

const env = process.env
const grantText = readFileSync('/Users/howard07/Code/w2l/.w2l/access/steel-grant.json', 'utf8')
const grant = accessGrantFromText(grantText)
if (grant.capabilities.includes('vendor_residential_proxy')) throw new Error('grant names vendor_residential_proxy')
const channels = buildChannels('standard', { enhanced: true, keys: { steel: env.STEEL_API_KEY! }, vendorPolicy: { authorized: grant.capabilities }, vendorTariffs: grant.tariffs, vendorGrant: accessGrantRef(grant) })
const steel = channels.filter((channel: { vendorId?: string }) => channel.vendorId === 'steel')
if (steel.length !== 1) throw new Error(`expected one steel rung, got ${channels.map((c: { id: string }) => c.id)}`)

const taskDir = env.TASK_DIR!
const store = SqliteTaskStore.open(taskDir)
const wrapped = env.MODE !== 'crash' ? store : new Proxy(store, {
  get(target: any, property, receiver) {
    if (property === 'putPaidCall') return async (call: any) => {
      await target.putPaidCall(call)
      process.stderr.write(`row ${call.paidCallId} ${call.state} session=${call.providerSessionId}\n`)
      if (call.state === 'submitted') setTimeout(() => process.kill(process.pid, 'SIGKILL'), 4_000)
    }
    const value = Reflect.get(target, property, receiver)
    return typeof value === 'function' ? value.bind(target) : value
  },
})
const runner = new LadderRunner(steel, { mode: 'standard', enhanced: true })
const report = await new CrawlOrchestrator({ store: wrapped, atom: new LadderScrapeAtom(runner), workerCount: 1, ...(env.MODE === 'resume' ? { reconcilePaidCall: steelPaidCallReconciler({ apiKey: env.STEEL_API_KEY! }) } : {}) })
  .run({ seedUrl: 'https://example.com/', taskDir, maxDepth: 0, budget: { ...DEFAULT_CRAWL_BUDGET, maxCostUsd: 0.05, maxPages: 1 }, resumeFrom: env.RESUME ?? null })
const id = report.taskId
console.log(JSON.stringify({ report, rows: await store.listPaidCalls(id), attempts: await store.listAttempts(id) }, null, 1))
await store.close()
for (const channel of channels) await channel.close?.()
```
