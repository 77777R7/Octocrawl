# Diagnosis: the Steel pages that were false successes in the 92-task run, 2026-10-09

**What was checked.** In `2026-10-09-pa4-steel-all-06b9354.md`, five tasks were false successes: T006, T010, T014, T021 and B003. The question was why their data failed the predicates:
- whether the page was captured before its data loaded;
- whether the data was in the page but left out of the Markdown;
- whether the data was not in the page at all.

**Conditions.**
- The source was `06b9354`, with the proxied network as in the run above (`HTTPS_PROXY=http://127.0.0.1:7890`). Requests to the local API went direct.
- The checks were made one request at a time with Node's `fetch` and with `curl`, not with run-set.mjs.
- **Local browser checks:** a local API on port 8792 at `06b9354`, with no grant (`W2L_API_PORT=8792 npm run api`).
- **Steel checks:**
  - API: on port 8798, with the Steel grant of the run above (`W2L_API_PORT=8798 W2L_VENDORS=steel W2L_ACCESS_GRANT=.w2l/access/steel-grant.json npm run api`).
  - Temporary patch: the working tree carried one change that was never committed. In `packages/bench/src/vendors/cdp.ts`, `navigateOnce` waited at least 8 s for the page to settle (`minMs: 8_000, maxMs: 10_000`) instead of at most 1.5 s.
  - Requests: each sent `access: "enhanced"`. Six requests reached Steel, at most $0.0033 each by the ledger's ceiling.

## T010: the table never rendered, whatever the wait

This was checked on the local browser, at `https://data-explorer.oecd.org/s/1xl`.

| `waitFor` | Status | Markdown chars | Markdown tables | `<table>` / `role="grid"` in the rendered HTML |
| --- | --- | --- | --- | --- |
| 0 | failed / empty_unverified | 1028 | 0 | not requested |
| 8000 | success | 2187 | 0 | not requested |
| 10000 | success | — | — | 0 / 0 |
| 25000 | success | 2556 | 0 | 0 / 0 |

- Steel's page in the 92-task run was the same 2187 characters as the 8000 ms row.
- The short link redirected to a `vis?…` page, and none of these waits rendered a table on it.
- So the false success did not come from capturing the page too early. The cause is not isolated: the view may need an interaction, or Firecrawl may have been served something else.

## B003, T014, T006, T021: Steel with an 8 s settle

| Task | In the 92-task run (1.5 s settle) | With the 8 s settle |
| --- | --- | --- |
| B003 (Tesla inventory) | success, 79 chars: "Inventory Search Results Fetching..." | failed / empty_unverified, 22177 chars, 0 prices |
| T014 (Home Depot drills) | success, 2581 chars, 0 prices | success, 2840 chars, 0 prices |
| T006 (Amazon home) | success, 3 prices (5 needed) | success, 3 prices |
| T021 (eBay laptops) | success, 2 prices (3 needed) | failed / http_error, 177 chars |

**Prices in Steel's page against its Markdown.** T014 and T006 were requested a second time with `formats: ["markdown", "rawHtml"]`. The price pattern of their predicate was counted in the page's visible text (scripts and styles removed) and in the Markdown:
- **T014:** 1.1 MB of HTML. The visible text holds 1 price, a card promotion ("Get $5 off"); the Markdown holds 0.
- **T006:** 2.6 MB of HTML. The visible text holds 3 prices, all of them promotional text ("Under $10", "under $50", "under $25"); the Markdown holds the same 3.

## Findings

1. **B003 was captured mid-load.** The 1.5 s settle took a loading state for the page. With a longer settle, the page grew from 79 to 22177 characters and was then judged `empty_unverified`. So a longer wait made it an honest failure, not a verified result.
2. **For T014 and T006, the listing's prices were not in the page Steel rendered at all.** They were absent even after the 8 s settle, so the extractor did not drop them. These two false successes are not an extraction gap. That corrects the reading given before this diagnosis.
   - Not isolated: whether the prices load only on scroll, or whether the sites serve Steel's data-centre browser a page without them.
3. **T021 was not stable through Steel.** It came back as eBay's error page on this request, so it could not be compared.
4. **T010 is not a timing problem.** See the section above.
5. **The earlier record of the escalation run** (`2026-10-09-pa4-steel-gap-escalation-f160f02.md`) called T021 and T043 an extraction gap. That was not checked: T021 could not be re-read here, and T043 was not re-read.
