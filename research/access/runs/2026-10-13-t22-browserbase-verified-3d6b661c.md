# T2.2: Browserbase `verified` on the free plan, 2026-10-13

Why: the challenge-pages task list ([docs/pa-challenge-botcheck-tasks.md](../../../docs/pa-challenge-botcheck-tasks.md), T2.2) names a provider's stealth browser, Browserbase `verified`, as the one route not yet measured on the 16 Cloudflare and DataDome tasks. Its precondition says: if `verified` is not on the current plan, record why and skip.

## How it was checked

- Account: Howard's Browserbase organisation on the **Free** plan, its one project ("Personal project"). The key and project ID are in `.w2l/access/competitors.env`, git-ignored; neither is recorded.
- Source: main `3d6b661c`. No Octocrawl code ran: the two calls went straight to Browserbase's API with curl, proxied (`HTTPS_PROXY=http://127.0.0.1:7890`), at about 03:20Z.
- The same session body the adapter sends under a tariff (`packages/bench/src/vendors/browserbase.ts`, `browserbaseSessionBody`): `timeout: 60`, `keepAlive: false`, `proxies: false`.

| Call | Body's browser settings | Answer |
| --- | --- | --- |
| `POST /v1/sessions` | `{"verified": true}` (what `vendor_stealth` sends) | **403** `Forbidden`: "Verified mode is only available on the Enterprise plan". No session was created. |
| `POST /v1/sessions` | `{"advancedStealth": false}` (stealth off) | 201, a session `RUNNING` in `us-west-2`, released at once (`REQUEST_RELEASE`, 200) |

- Cost: no charge. The free plan bills nothing; the one session that ran was released within seconds, inside its free minutes. No grant was written and the ledger was not involved.

## Reading

- `verified` is on Browserbase's Enterprise plan alone, so T2.2 cannot run on this account. Per its precondition it is skipped, with this record as the reason. The key works: a session without `verified` is created.
- The 16 challenge and bot-check tasks keep the reading of 2026-10-12: within ADR 0005's means the Cloudflare and DataDome checks on these sites hold, and the frozen-set gap to the best competitor stays at 12.
- Measuring this route would need an Enterprise plan. Its price is not on Browserbase's pricing page (not checked here), so its cost per verified task is unknown.
