# H2: the published JS SDK and Python client run hosted jobs (2026-10-21)

ROADMAP PH stage H2. [A1](2026-10-20-h2-a1-clients-d094e319.md) checked three MCP clients. This run checks the two published library clients against live hosted jobs, with each client's default User-Agent. It also covers R7: whether Cloudflare refuses a client's User-Agent, as it did Python urllib's default with error 1010.

## Setup

- **Server:** the live hosted API, revision `octocrawl-api-invite-7f935dc` (main `7f935dc5`), and worker `octocrawl-jobs-w9-dd21862`.
  - Jobs are on and invite only; the list holds Howard's account (`qJygDXq6…`) alone.
  - The repository was at `5beacbf3` when this ran.
- **Key:** issued for Howard's account for this run (`scripts/hosted/issue-key.mjs`, digest `7e7f7594…`), HTTP lane only, and revoked right after.
- **Runner:** this Mac, through its proxy (`HTTPS_PROXY`; `NODE_USE_ENV_PROXY=1` for Node). The clients' User-Agent headers were left at their defaults.
- **Clients:** installed from the registries into fresh directories under the session scratchpad: npm `@octocrawl/sdk@0.7.0`, and PyPI `octocrawl-client==0.7.0` in a virtualenv.

## Results

| Client | Runtime | Call | Job | Result | Server record |
| --- | --- | --- | --- | --- | --- |
| `@octocrawl/sdk` 0.7.0 | Node v26.8.1 | `batchAndWait([example.com, books.toscrape.com], { fastMode: true, maxCredits: 5 })` | `ee523214…` | 2 items, both `success`, in 9 s | completed, 2 pages, 0 errors, 2 credits, `maxCredits` 5, origin `js-sdk@0.7.0` |
| `@octocrawl/sdk` 0.7.0 | same | `crawlAndWait('https://books.toscrape.com/', { maxPages: 3, fastMode: true, sitemap: 'skip' })` | `98022f6d…` | 3 pages, 0 errors, in 10 s | completed, 3 pages, 3 credits |
| `octocrawl-client` 0.7.0 | Python 3.14.7 | `batch([...], fast_mode=True, max_credits=5, wait_timeout=180)` | `7ad4c5a5…` | completed, 2 items, both `success`, `credits {used: 2, maxCredits: 5}`, in 4 s | (the client's own report) |
| `octocrawl-client` 0.7.0 | same | `crawl('https://books.toscrape.com/', max_pages=3, fast_mode=True, sitemap='skip')` | `c89095e2…` | completed, 3 items: `/`, `catalogue/category/books_1/`, `catalogue/category/books/travel_2/`, in 6 s | (the client's own report) |

The JS script read `status` where the SDK names the field `report`, so its own output has no status for these two jobs. The server records in the table come from Firestore (`hostedJobs/{id}`).

## What this shows

- **Both published clients work against hosted jobs unchanged.** That covers start, waiting, and paging the items. The hosted `queued` status is not terminal to either client, so both kept waiting.
- **R7 does not touch the published clients.** Neither default User-Agent was refused. The Python client sends its own User-Agent over httpx; urllib's default, which Cloudflare refused, is not used.
- **`maxCredits` reached the server from both clients 0.7.0.** The JS SDK spreads unknown options into the body, and the Python client maps `max_credits` to `maxCredits`. The SDK's TypeScript types in 0.7.0 do not declare it: a TypeScript caller gets a type error, although the call works at runtime. M6 (#656) adds it to the types.
- **No duplicate pages from the Python client's crawl.** It joins `/pages` and `/errors`; hosted `/pages` leaves failed and duplicate items out (`hostedJobRoutes.ts` `list`), so a failed page is not counted twice. This run had no failed pages, so that case was read from the code, not observed.

## Not covered

- **Listing jobs:** neither client has a method for `GET /v1/jobs`.
- **Webhooks:** no webhook start was made through either client.
- **The repository's unreleased SDK:** only the published 0.7.0 packages ran.
