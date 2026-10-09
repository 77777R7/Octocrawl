# my-browser lane: real-page acceptance, 2026-10-09

ROADMAP PA item 8. Pages read in the person's own Chrome through one batch on `lane: "my-browser"`.

Round 2 of the final acceptance. Round 1 (`2026-10-09-my-browser-final-26dba3e.md`, kept in the denominator) read nine of the ten pages but five checks named text its extracted Markdown drops (a sidebar, tabs, a title). Before this run, the checks were changed to text that page structure keeps and that shows only when signed in, decided from round 1's headings and word counts, not its content: github.com `Dashboard`, Gmail `lunhoward306`, x.com/home `Your Home Timeline`, x.com/notifications `Notifications`; www.linkedin.com/mynetwork/ was replaced by `/mynetwork/grow/`, where it always leads. The Lark wiki's check (`内容规划`, its title) was kept: round 1 extracted Lark's keyboard-shortcut panel, not the document, and a check that passed on that would not show the document was read. www.amazon.sg is the address page (not signed in; it shows delivery to Singapore); the table labels every page "behind your login". The person allowed the seven sites in 4 s (server log).

- Command: `node research/access/my-browser-check.mjs --tasks none --login .w2l/access/my-browser-login-round2.json --record research/access/runs/2026-10-09-my-browser-final-round2-b6c7524.md`
- Source commit: `b6c7524`
- API: http://127.0.0.1:8796, a local server on loopback (`npm run api`). Started 2026-10-09T06:21:38.210Z.
- Machine: darwin 25.6.0; browser as Chrome reported it: Chrome/154.0.8037.98.
- Network: the pages went out through Chrome's own network settings, not Octocrawl's; Octocrawl fetched nothing for them.
- Windows and Linux: not checked.
- Batch `9ef687f9-8011-4a5e-90aa-1e792c46db4a`: completed, 10/10 pages.

Verified 9 of 10 batch pages (a page is verified only when it was read and every predicate of its task passed). The G0 baseline column is Octocrawl's own lanes in window A.

| Task | Route | Page | Part | G0 baseline | Status | Reason | Lane | Completion | Verified | Wall ms | Warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | batch | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2962 |  |
| L2 | batch | github.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2643 |  |
| L3 | batch | mail.google.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 10732 |  |
| L4 | batch | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 3355 |  |
| L5 | batch | www.linkedin.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2944 |  |
| L6 | batch | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 3844 |  |
| L7 | batch | x.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2743 |  |
| L8 | batch | www.bilibili.com (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2920 |  |
| L9 | batch | www.amazon.sg (behind your login) | login | — | success |  | my_browser | user_browser | yes | 2842 |  |
| L10 | batch | fjpm0c942u1c.jp.larksuite.com (behind your login) | login | — | success |  | my_browser | user_browser | no | 9026 |  |
