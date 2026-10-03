# Live checks 2026-10-04: list records (interaction group I4)

Code: `38f2081` (branch `claude/i4-list-records`, on the I3 branch `claude/i3-lists` at `e6d33b2`, not yet on `main`). Server: `npm run api` (port 8787), scratch task root, no saved logins. Network: proxied (127.0.0.1:7890).
Command: `node research/parity/run-sites.mjs --batch list-records --record research/parity/runs/2026-10-04-i4-list-records-38f2081.md` ([record](2026-10-04-i4-list-records-38f2081.md)).
Cases: LR01 to LR06 in [sites.v1.json](../sites.v1.json), batch `list-records`, frozen before this first run.

Result: 6 of 6 cases, 27 of 27 checks.

Run 2, after the review fixes (records as a reader sees them, limits, a failed later step, duplicates; see the commit after the first run's): `991549b`, the same command, [record](2026-10-04-i4-list-records-991549b.md): 6 of 6 cases, 27 of 27 checks, the same counts as the first run.

Run 3, after the re-review fixes (lead warnings, page merge by the items' whole text, SVG text): `a9d917c`, the same command, [record](2026-10-04-i4-list-records-a9d917c.md): 6 of 6 cases, 27 of 27 checks.

| Case | Page | How | Records | Pages | Incomplete | First record |
| --- | --- | --- | --- | --- | --- | --- |
| LR01 | books.toscrape.com, Mystery | paginate + list (title, url, price, availability) | 32 | 2 | 0 | Sharp Objects, its catalogue URL made absolute |
| LR02 | quotes.toscrape.com/js/ | paginate + list (text, author, tags) | 100 | 10 | 0 | Albert Einstein's quote |
| LR03 | scrapethissite.com hockey teams | paginate + list (name, year, wins, losses) | 582 | 24 | 0 | Boston Bruins, 1990, 44, 24 |
| LR04 | webscraper.io ajax, laptops | paginate (in place) + list (title, price, description) | 117 | 20 | 0 | Asus VivoBook X441NA-GA190, $295.99 |
| LR05 | quotes.toscrape.com/ | list alone, default onlyMainContent | 10 | 1 | 0 | `success`, not `empty_unverified` |
| LR06 | news.ycombinator.com | list alone (title, url, site) | 30 | 1 | 0 | a story with its external URL |

Not shown here:
- A record with a missing field: LR06's note expected an Ask HN story without a site, and the front page had none at the time of the run, so every record was complete. Missing values (null, named in `missing`, counted in `incomplete`) are shown on local pages (`packages/extract-tf/test/list.test.ts`).
- The list format over the HTTP lane on a page of records that has no article is shown on a local page (`packages/bench/test/listFormat.integration.test.ts`); LR05 and LR06 were answered by whichever rung the ladder chose (see each case's `channelsTried` in the record).
