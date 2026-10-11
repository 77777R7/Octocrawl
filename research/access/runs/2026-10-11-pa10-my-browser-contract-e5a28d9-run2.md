# my-browser lane: real-page acceptance, 2026-10-11

ROADMAP PA item 8, with each task sent as its contract (item 10). Pages read in the person's own Chrome through one scrape each on `lane: "my-browser"`, each carrying its task's predicates as `verify`.

- Command: `node research/access/my-browser-check.mjs --tasks none --login .w2l/access/my-browser-login-round2.json --contract --record research/access/runs/2026-10-11-pa10-my-browser-contract-e5a28d9-run2.md`
- Source commit: `e5a28d9f`
- API: http://127.0.0.1:8796, a local server on loopback (`npm run api`). Started 2026-10-11T07:48:25.246Z.
- Machine: darwin 25.6.0; browser as Chrome reported it: Chrome/154.0.8037.98.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.

Verified 8 of 10 pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A. The product's verification agreed with this script's verdict on 10 of 10 pages (10 carried one). The Product column is the answer's `verification.status`.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Product | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | scrape | github.com (behind your login) | login | — | success |  | my_browser | user_browser | no | failed | 7977.449833999388 |  |
| L2 | scrape | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 7151.243041999638 |  |
| L3 | scrape | mail.google.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 9152.06616699975 |  |
| L4 | scrape | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 9432.778541999869 |  |
| L5 | scrape | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6774.29570800066 |  |
| L6 | scrape | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 8035.834625000134 |  |
| L7 | scrape | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6395.383458999917 |  |
| L8 | scrape | www.bilibili.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6102.186417000368 |  |
| L9 | scrape | www.amazon.sg (behind your login) | login | — | success |  | my_browser | user_browser | no | failed | 8275.06029099971 |  |
| L10 | scrape | fjpm0c942u1c.jp.larksuite.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 9620.643667000346 |  |

## Runs before this one

The same pages, the same command with `--contract`, all on 2026-10-11:

- At `38ae236d` (main `f1432dab` and the check's `--contract`): L1 and L2 were read; L3 (mail.google.com) never answered, and the check's request was cut by fetch's five-minute header timeout before it wrote a record. Two reads of L3 alone afterwards each ended `failed`/`timeout` at 604 s (`my_browser_not_read`).
  - Cause: since #315 the lane copied the page as shown with `DOMParser`, which a page that requires Trusted Types refuses a plain string. Every read threw and was tried again until the read's ten-minute wait ran out. That Gmail enforces Trusted Types is inferred from this behaviour, reproduced on a local page served with `require-trusted-types-for 'script'`.
  - Fixed in #378, merged into this run's commit (`e5a28d9f`). L3 was read here in 9.2 s.
  - The check no longer sets a client timeout.
- At `e5a28d9f`, a first run: every page answered HTTP 409, "Chrome did not accept the connection". The API had been restarted, and Chrome's "Allow remote debugging?" was not clicked in time. Its record, `2026-10-11-pa10-my-browser-contract-e5a28d9.md`, is kept.

## Pages not verified

- **L1 (github.com) and L9 (www.amazon.sg):** read `success`, the contract failed, product and script agreeing. Both were verified in round 2 of item 8's final acceptance (`2026-10-09-my-browser-final-round2-b6c7524.md`, before #315).
  - Their readiness is `not_extracted` (`checks_failed`, `region_ready`): the checks held on the Markdown of the live page's whole document (the region wait, 2 judged reads) and failed on the Markdown extracted from the page as shown.
  - Not isolated.
  - github.com's signed-in home keeping content in a `<main>` it does not show on a wide window is the cost already recorded for #315 (`2026-10-10-pa7-my-browser-13e2174.md`).
- **L3 (mail.google.com):** has no `region_wait`: the region was not judged on the live page. It was verified on its Markdown.
  - A likely cause, not measured: the region wait does not judge a page whose HTML is over 5,000,000 characters (`MAX_VIEW_HTML`), and records no `region_wait` then.
  - An error in the region wait's own read would still have left one, with `judged: 0`.
