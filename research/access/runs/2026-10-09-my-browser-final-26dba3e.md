# my-browser lane: real-page acceptance, 2026-10-09

ROADMAP PA item 8. Pages read in the person's own Chrome through one batch on `lane: "my-browser"`.

- Command: `node research/access/my-browser-check.mjs --tasks none --login .w2l/access/my-browser-login.json --record research/access/runs/2026-10-09-my-browser-final-26dba3e.md`
- Source commit: `26dba3e`
- API: http://127.0.0.1:8796, a local server on loopback (`npm run api`). Started 2026-10-09T06:12:04.228Z.
- Machine: darwin 25.6.0; browser as Chrome reported it: Chrome/154.0.8037.98.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.
- Batch `dd11d5df-396c-4f93-9085-f10065c69bd3`: completed, 10/10 pages.

Verified 4 of 10 batch pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | batch | github.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 3953 |  |
| L2 | batch | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 3203 |  |
| L3 | batch | mail.google.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 12105 |  |
| L4 | batch | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 4041 |  |
| L5 | batch | www.linkedin.com (behind your login) | login | — | failed | timeout | my_browser | — | no | 8616 | my_browser_not_read |
| L6 | batch | x.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 3351 |  |
| L7 | batch | x.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 3276 |  |
| L8 | batch | www.bilibili.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2932 |  |
| L9 | batch | www.amazon.sg (behind your login) | login | — | success |  | my_browser | user_browser | yes | 3433 |  |
| L10 | batch | fjpm0c942u1c.jp.larksuite.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 8229 |  |
