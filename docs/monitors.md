# Monitors and event delivery

A Monitor reads a source again on a schedule. Delivery sends its events, and a batch's or crawl's webhook events, to your HTTPS endpoint, with retries.

The native SDK includes Crawl pagination/cancellation, Monitor creation/revisions/runs/control, and Delivery destinations/status/retry. [The runnable example](../examples/monitor-workflow.ts) uses a controlled price source, explicit `captureMode`, validated baselines, conditional HTTP requests, and persisted events. [The webhook receiver](../examples/webhook-receiver.ts) stores event receipts and applies a versioned product projection transactionally.

The API, Monitor scheduler and delivery worker share a persistent control database.
`npm run local:mcp:install` manages all three for local MCP users. `w2l-api`
(`npm run api`) runs a delivery worker of its own since job webhooks arrived,
so Monitor and job deliveries leave the API process too; the standalone worker
below is still there for a deployment that wants it separate, and running both
is safe (a delivery is leased and fenced). For a standalone API deployment, run
the Monitor worker in a separate terminal with the same `W2L_TASK_ROOT` as the API:

```bash
export W2L_TASK_ROOT="$PWD/.w2l/api"
npm run monitors:worker
```

The Monitor worker defaults to public-source network policy. For the controlled local source in the onboarding example, explicitly set `W2L_MONITOR_NETWORK_MODE=local` in that worker terminal. A locally running worker does not inherit broader network access from the API or database.

```bash
export W2L_TASK_ROOT="$PWD/.w2l/api"
npm run delivery:worker
```

See [onboarding](onboarding.md) for the HTTPS receiver, authentication, worker configuration, and pending-delivery restart exercise. Gate 2–4 source freeze `99894bd636ecafd254a7c7bc79d26e9a97fa9199` is on `main` through [PR #50](https://github.com/77777R7/w2l/pull/50) and is published as source prerelease [`v0.4.0-rc.1`](https://github.com/77777R7/w2l/releases/tag/v0.4.0-rc.1). Clone `main` or check out that tag. Workspace packages remain private and independent human installation remains pending.

The [Gate 2–4 acceptance record](roadmap/gate-2-4-acceptance.md) links the process-crash, concurrent-claim, public HTTPS and agent clean-install evidence. Gate 2/3 engineering acceptance passed; Gate 4 awaits a non-author human, and Gate 5 external two-week/repeat-use validation has not started. `npm run package:handoff` captures review source with per-file hashes. The existing tested archive is a preserved pre-commit snapshot, not a package of subsequent roadmap edits.

C2 Monitor/Delivery MCP and its local HTTPS first-use workflow are implemented. C3 has a unified process and authenticated Streamable HTTP implementation, experimental and not deployed ([archived setup](archive/hosted-mcp-pilot.md)). B1/B2 and C1 remain in_progress for their broader operational/adoption gates. See the [first-use walkthrough](mcp-first-use.md) and [dated local evidence](evidence/c2-c3-mcp-local-2026-09-23.md).
