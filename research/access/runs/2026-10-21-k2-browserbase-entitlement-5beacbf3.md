# K2: Browserbase `verified` entitlement, 2026-10-21

Why: the PA enhancement task list ([docs/pa-enhancement-tasks.md](../../../docs/pa-enhancement-tasks.md), K2, Howard's decision 6) asks to re-check whether this account may use Browserbase's `verified` mode. On 2026-10-13 it was refused ([2026-10-13-t22-browserbase-verified-3d6b661c.md](2026-10-13-t22-browserbase-verified-3d6b661c.md)); the plan quoted Browserbase's docs as saying Scale has Verified. Scope: entitlement only, no plan bought, no paired experiment.

## How it was checked

- Account: Howard's Browserbase organisation, its one project ("Personal project", created 2026-10-13). The key and project ID are in `.w2l/access/competitors.env`, git-ignored; neither, nor any session or owner id, is recorded here.
- Source: main `5beacbf3`. No Octocrawl code ran: curl straight to `https://api.browserbase.com`, proxied (`curl -x http://127.0.0.1:7890`), 2026-10-21 03:38–03:39Z. Raw answers were kept in a scratch directory outside the repository and deleted.
- Session bodies: the one the adapter sends under a tariff (`packages/bench/src/vendors/browserbase.ts`, `browserbaseSessionBody`): `projectId`, `timeout: 60`, `proxies: false`, `keepAlive: false`, `browserSettings.solveCaptchas: false`, plus either `verified: true` (what the `vendor_stealth` grant sends) or `advancedStealth: false` (stealth off).

| Call | Answer |
| --- | --- |
| `GET /v1/projects` | 200, one project; `concurrency: 3`, `defaultTimeout: 300`. No plan field. |
| `GET /v1/projects/{id}` | 200, same fields. No plan field. |
| `GET /v1/projects/{id}/usage` | 200, `{"browserMinutes":1,"proxyBytes":0}` before the sessions, `{"browserMinutes":2,"proxyBytes":0}` after |
| `POST /v1/sessions` with `verified: true` | **403** `{"statusCode":403,"error":"Forbidden","message":"Verified mode is only available on the Enterprise plan"}`. No session was created. |
| `POST /v1/sessions` with `advancedStealth: false` | 201, session `RUNNING` in `us-west-2`; released at once (`POST /v1/sessions/{id}` `REQUEST_RELEASE`, 200), then `GET` showed `COMPLETED`, about 1.3 s after it started, `proxyBytes: 0` |

- Plan: the API does not return the plan name. The dashboard was not opened (it needs Howard's sign-in). The 2026-10-13 record says Free; nothing found here says it changed, but today's plan is **unknown** from this run.
- Cost: the one session that ran counted one browser minute (`browserMinutes` 1 → 2) and no proxy bytes. In money: $0 if the account is still on the Free plan, which bills nothing; otherwise unknown. Well under the $0.20 cap set for this check.

## Browserbase's documentation

Read 2026-10-21 without signing in, proxied. The public pages and the API disagree:

- [Agent Identity overview](https://docs.browserbase.com/platform/identity/overview.md): "Browserbase offers Verified on the Scale plan." It suggests contacting hello@browserbase.com for a trial.
- [Plans](https://docs.browserbase.com/account/billing/plans.md), "Identity & bot detection": Free No, Developer Basic, Startup Basic, Scale Verified. [Plan management](https://docs.browserbase.com/account/billing/plan-management.md) says to contact Browserbase to confirm Verified eligibility, and that Verified is enabled per project.
- [Pricing](https://www.browserbase.com/pricing): Scale lists Verified agents and captcha solving; "Enterprise" appears only as a label on the Scale card. No page read says Enterprise-only; the API's 403 does.
- Plans as listed: Free $0, 1 browser hour, concurrency 3, no proxies; Developer $20/month, 100 hours, $0.12/hour over, concurrency 25; Startup $99/month, 500 hours, $0.10/hour over, concurrency 100; Scale custom price (contact sales), concurrency 250+. Billing is by the minute with a one-minute minimum per session.
- How Verified is billed: **unknown**. No page lists a Verified surcharge or rate; Scale is priced per contract.
- The project's `concurrency: 3` matches the Free plan's listed limit. That is an inference, not a plan read from the account.

## Trial request to Browserbase

Read from Howard's mailbox on 2026-10-21; dates and status only.

| Date | Status |
| --- | --- |
| 2026-10-13 | Howard asked Browserbase for a short Verified trial (the 16 challenge pages, one run plus one repeat on another day, about 32 sessions) and a rough Scale price. |
| 2026-10-15 | Browserbase support answered that the request was passed to its sales team; Howard acknowledged the same day. |
| 2026-10-21 | No answer from sales yet. The only later Browserbase mail (2026-10-19) is a marketing follow-up with no word on the trial or pricing; nothing in spam. |

So no trial has been granted and no Scale price is known.

## Comparison with 2026-10-13

| | 2026-10-13 | 2026-10-21 |
| --- | --- | --- |
| `verified: true` | 403, "Verified mode is only available on the Enterprise plan" | 403, the same message word for word |
| stealth off | 201, released | 201, released |
| Plan | Free | unknown (API has no plan field; dashboard not opened; `concurrency: 3` matches Free) |
| Plan the docs name for Verified | not checked | Scale (docs and pricing page); the API message still says Enterprise |

## Reading

- `verified` is still unavailable on this account: the API refuses it with the same Enterprise-plan message as eight days ago. The key works; a session without `verified` is created and released.
- Per K2 and decision 6, no paired experiment is run and no plan is bought. The 16 challenge and bot-check tasks keep their current reading.
- Whether buying a plan would unlock `verified` is open: the docs say Scale (custom price, contact sales, eligibility confirmed by Browserbase), the API says Enterprise. Neither Developer nor Startup lists Verified, so a self-serve upgrade would not unlock it by the docs. Its cost per verified task stays unknown.
