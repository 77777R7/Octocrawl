# List handoff check, 2026-10-08

ROADMAP PA item 3, the last clause: a list stopped at a check at page N is handed to the person, verified at page N, and continues.

- Command: `node research/access/list-handoff-check.mjs --handoff --wait-ms 600000 --record research/access/runs/2026-10-09-list-handoff-f3e382d.md`
- Source commit: `f3e382d`
- API: http://127.0.0.1:8797. Network: the API process's own route, as each item's `access.egress` states (the driver's shell had HTTPS_PROXY=127.0.0.1:7890).
- Candidates: `research/access/list-challenge-candidates.v1.json`, 5 frozen before the run, 5 run; `maxPages` 5.
- Handoff: asked for every list stopped at a check at page 2 or later, `waitMs` 600000.

| Task | Host | Before: status / stop | Pages / items read | Check at page >= 2 | After the handoff | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| T033 | www.amazon.com | failed (action_failed) / — | — / — | no | — | — |
| T051 | www.indeed.com | blocked (cloudflare_challenge) / challenge at page 2 (cloudflare_challenge) | 1 / 16 | yes | blocked, continued null, items 16, person's pages 0 | not verified |
| T020 | www.newegg.com | success / end | 1 / 0 | no | — | — |
| T044 | www.rightmove.co.uk | failed (action_failed) / — | — / — | no | — | — |
| T041 | www.zillow.com | blocked (captcha) / challenge at page 1 (captcha) | 0 / 0 | no | — | — |

Verified only as the driver's header states; a status alone never verifies. Raw items: `GET /v1/batches/<id>/items?debug=true` on the API's task root (not committed): T033 `ad9912fa-7519-418a-967d-ed4bec95b825`, T051 `79cb5a5d-f900-4374-acb5-e8058858b3b5`, T020 `dd4c03ac-3ddc-4202-a75c-e0abc2b3126b`, T044 `ad9a561d-e23a-4943-b573-bc79c406af9f`, T041 `4e13a4dd-069c-4a56-957b-c10a97cb3f47`.

## Notes

- Run on 2026-10-08 UTC (2026-10-09 local, the file's date), proxied: the API on 8797 ran with the environment proxy `127.0.0.1:7890` (Clash, TUN on). Chrome's remote debugging was already on (port 9222).
- T051, what the person saw (their account, not something Octocrawl read): the page of the check opened in their Chrome; Indeed asked them to sign in; after signing in it sent them to `onboarding.indeed.com` (a résumé upload page), off the list; they pasted the check page's URL back into that tab. The tab's later state is not recorded.
- Why this handoff was not through is not known. The driver at `f3e382d` did not keep the handoff's answer (`through`, its reason); the next commit prints and records it. Possible causes in the code, neither shown: the reader ends after 60 s with no new page once the check's page is read, which keeps the item stopped for a later handoff; or the 10-minute wait ran out.
- The other four did not reach a handoff: amazon and rightmove failed the paginate step (`action_failed`); newegg's `itemSelector` matched none of its products in the browser (0 items, the step ended at page 1 as `end`), so the candidate file's selector was wrong for it; zillow showed its check on page 1, where no page is read before it.
