# my-browser lane: real-page acceptance, 2026-10-11

ROADMAP PA item 8, with each task sent as its contract (item 10). Pages read in the person's own Chrome through one scrape each on `lane: "my-browser"`, each carrying its task's predicates as `verify`.

- Command: `node research/access/my-browser-check.mjs --tasks none --login .w2l/access/my-browser-login-round2.json --contract --record research/access/runs/2026-10-11-pa11-my-browser-unjudged-9eb3f69.md`
- Source commit: `9eb3f69e`
- API: http://127.0.0.1:8792, a local server on loopback (`npm run api`). Started 2026-10-11T10:09:14.408Z.
- Machine: darwin 25.6.0; browser as Chrome reported it: Chrome/154.0.8037.98.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.

Verified 9 of 10 pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A. The product's verification agreed with this script's verdict on 10 of 10 pages (10 carried one). The Product column is the answer's `verification.status`.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Product | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | scrape | github.com (behind your login) | login | — | success |  | my_browser | user_browser | no | failed | 7307.514542000004 |  |
| L2 | scrape | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6804.106999999989 |  |
| L3 | scrape | mail.google.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 8328.818667 |  |
| L4 | scrape | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 9054.876625000004 |  |
| L5 | scrape | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 9523.883291000006 |  |
| L6 | scrape | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 7632.8682499999995 |  |
| L7 | scrape | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6621.407209000012 |  |
| L8 | scrape | www.bilibili.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 6193.023458000011 |  |
| L9 | scrape | www.amazon.sg (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 8454.429291999986 |  |
| L10 | scrape | fjpm0c942u1c.jp.larksuite.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | passed | 14528.436875000014 |  |

## Notes (ROADMAP PA item 11: a region wait that judged nothing says why)

**Set-up.**
- The server was at `9eb3f69e`: main with #382, which records a region wait whose view could judge none of the contract's checks, with `unjudged`. The API ran on 8792.
- The pages are the ten of `2026-10-11-pa10-my-browser-contract-e5a28d9-run2.md` (#379): the same git-ignored list, SHA-256 `238a47be6f66d07ec829f93adbfb8fc65916a969c0ffcc18c3d84a97a4ca731f`.
  - L9's check is `S$`. Howard changed it from `Singapore`, which appears only in the footer's country link; the extractor leaves the footer out of the main content. The 增强访问路线同步 window relayed the change.
- Each page went as its own scrape with its task's contract. The waits and readiness below are from each answer (`debug: true`), by counts only.
- Whether Chrome's window was in front during the run was not recorded.

**The waits and readiness, page by page:**

| Page | Verified | Readiness | Region wait | Settle wait |
| --- | --- | --- | --- | --- |
| L1 github.com | no | `not_extracted` (`checks_failed`, `region_ready`) | held, 2 reads, 592 ms | 1,099 ms, steady |
| L2 github.com | yes | `ready` (`verified`) | held, 2 reads, 698 ms | 658 ms, steady |
| L3 mail.google.com | yes | `ready` (`verified`) | **not judged: `html_too_large`**, 1 read, 6 ms | none recorded (steady, no wait) |
| L4 www.linkedin.com | yes | `ready` (`verified`) | held, 2 reads, 597 ms | 573 ms, steady |
| L5 www.linkedin.com | yes | `ready` (`verified`) | held, 2 reads, 580 ms | 1,602 ms, steady |
| L6 x.com | yes | `ready` (`verified`) | held, 2 reads, 634 ms | 2,771 ms, steady |
| L7 x.com | yes | `ready` (`verified`) | held, 2 reads, 616 ms | 2,181 ms, steady |
| L8 www.bilibili.com | yes | `ready` (`verified`) | held, 2 reads, 609 ms | 1,127 ms, steady |
| L9 www.amazon.sg | yes | `ready` (`verified`) | held, 2 reads, 1,986 ms | 2,451 ms, steady |
| L10 larksuite.com | yes | `ready` (`verified`) | held, 2 reads, 818 ms | 747 ms, steady |

**L3 (Gmail).** Its region wait is now recorded: one read, `unjudged: html_too_large`.
- The page's whole HTML was over the view's 5,000,000 characters, which the page does not send. So the Markdown check could not be judged on the live page.
- #379's run had inferred this, without a `region_wait` to show it. This run shows it.
- It was verified on its Markdown, and its readiness is `ready` (`verified`). The unjudged read adds nothing to `waitedMs`.
- It has no settle event. The lane records one only when it waited or the page did not settle, so the page was steady when it came through.

**L1 (github.com).** `not_extracted` (`checks_failed`, `region_ready`), as in #379's run.
- Its check held on the Markdown of the live page's whole document on two reads.
- It failed on the Markdown extracted from the page as shown.
- The 增强访问路线同步 window traced this to GitHub hiding its `<main>` while the tab is hidden. Their fix, on `claude/my-browser-hidden-tab`, is not in `9eb3f69e`.
- Whether the tab was hidden here was not recorded, so it is not isolated in this run.

**Against #379's run (`e5a28d9f`):**
- Verified 9 of 10 against 8. L9 is the difference, and its check changed between the runs (see the set-up), so the gain is the check's.
- The product's verification agreed with the script on 10 of 10 pages in both runs.
