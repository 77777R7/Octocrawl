# my-browser lane: real-page acceptance, 2026-10-11

ROADMAP PA item 8, with each task sent as its contract (item 10). Pages read in the person's own Chrome through one scrape each on `lane: "my-browser"`, each carrying its task's predicates as `verify`.

- Command: `node research/access/my-browser-check.mjs --tasks none --login .w2l/access/l1-github.json --contract --record research/access/runs/2026-10-11-pa10-my-browser-l1-hidden-tab-5fcc1ac.md`
- Source commit: `5fcc1ac1`
- API: http://127.0.0.1:8796, a local server on loopback (`npm run api`). Started 2026-10-11T10:20:48.097Z.
- Machine: darwin 25.6.0; browser as Chrome reported it: Chrome/154.0.8037.98.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.

Verified 1 of 1 pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A. The product's verification agreed with this script's verdict on 1 of 1 pages (1 carried one). The Product column is the answer's `verification.status`.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Product | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | scrape | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 40627.231125 | page_read_hidden |

## How L1 was read

L1 is github.com's signed-in home, item 8's acceptance page, with its check `Dashboard`. In `2026-10-11-pa10-my-browser-contract-e5a28d9-run2.md` and in #384's run on main `9eb3f69e`, it read `not_extracted` (`checks_failed`, `region_ready`).

Here, at `5fcc1ac1` (#385's branch: a tab out of sight is waited for before the page is read as it shows):

- The read's `user_browser_read` event says `tabHidden: true` and `hiddenWaitMs: 30383`. The tab stayed out of sight through the 30 s wait, though the lane activates it. The person's Chrome window was behind another app.
- So the whole document was read, with a `page_read_hidden` warning. Its Markdown held the check, so the page was verified.
- This is the first recorded observation that L1's tab was out of sight when it was read. Two read-only CDP checks earlier the same day had found the page's `<main>` `display: none` in a background tab and shown in a foreground one. Together they explain the earlier failures.
- Not exercised on this real page: a tab that comes in front during the wait and is then read as it shows. That path is covered by unit tests only.
