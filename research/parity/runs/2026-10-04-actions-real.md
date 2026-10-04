# Live checks 2026-10-04: page actions on real sites not made for scraping practice

The P5 "Browser actions pipeline" row asks for 10 real pages that need an interaction to show their data. The I2 run ([2026-10-03-i2-actions.md](2026-10-03-i2-actions.md)) passed 10 such pages, but all on three sites, two of them made for scraping practice; a cookie wall and a tabbed table on a site not made for practice were never run. This set covers 10 other sites.

Server: `npm run api` on port 8787, a scratch task root, no saved logins. Every run was **proxied** (the shell's `HTTPS_PROXY`, 127.0.0.1:7890), and the proxy's exit was in Singapore (`loc=SG` from Cloudflare's trace). No run was direct.

## The test set

Cases AR01 to AR10 in [sites.v1.json](../sites.v1.json), batch `actions-real`. They were frozen in commit `18bcf2b` before the first run.

| Case | Page | Steps | What shows only after them |
| --- | --- | --- | --- |
| AR01 | ourworldindata.org life expectancy chart | click the Table tab, wait for a row | the data table (no table on the page before) |
| AR02 | hub.docker.com nginx | click the Tags tab, wait for a table | the image tags table |
| AR03 | npmjs.com react | click the Versions tab, wait for a table | the version tables |
| AR04 | jsdelivr.com react | click the Files tab | the package's file list |
| AR05 | github.com topic javascript | loadMore "Load more…" twice | repositories past the first 20 |
| AR06 | aljazeera.com news | loadMore "Show more" twice | stories past the first 19 |
| AR07 | npr.org news | loadMore "Load more stories" twice | stories past the first 24 |
| AR08 | dev.to | scrollToEnd three times | posts drawn as the feed scrolls |
| AR09 | gov.uk find your local council | write a postcode, press Enter | the council's page (Westminster) |
| AR10 | hn.algolia.com | write a query in the search box | results drawn in place |

Before freezing, each page was read without steps (`onlyMainContent: false`) and with them, to confirm that each case's marker was missing without the steps. The case notes record what was seen.

### Candidates probed and not used

These were probed before freezing and left out. None was in a frozen set.

- **Data already in the page without a click** (a hidden tab): nuget.org versions, the bls.gov chart table, the marketplace.visualstudio.com version history. W2L reads hidden content, so these do not need an interaction to give their data.
- **Not in-place loading**: the straitstimes.com "Load more" button moves to the next page (`?page=3`), so it is pagination.
- **Refused by W2L's checks** (`policy_denied`): heise.de, spiegel.de, smithsonianmag.com, imdb.com search, worldometers.info.
- **Stopped by the site** (`blocked`): channelnewsasia.com, macrotrends.net, stockanalysis.com, oecd.org. stackoverflow.com answered that the proxy's IP address is blocked. npmjs.com was `blocked` once while probing and read on every other try, including both runs below.
- **No interaction to test**: zeit.de showed its articles from the Singapore exit with no wall; lemonde.fr and gov.uk show a cookie banner beside content that is already there; nba.com and mlb.com standings switch by link.
- **Cookie walls.** The only walls found that hide the content from this exit were golem.de and derstandard.at. Both are "pay or accept" walls inside a cross-origin consent iframe (Sourcepoint). They offer "accept all tracking" or a subscription, and no reject. golem's consent host (`cmp-cdn.golem.de`) is itself refused by W2L's checks. Howard decided to leave cookie walls out of this set rather than have W2L accept tracking. **No cookie wall was run.**

## Runs

Each run used `node research/parity/run-sites.mjs --batch actions-real --record <record>` against the API on the commit named.

| Run | Source commit | Record | Result |
| --- | --- | --- | --- |
| 1 | `18bcf2b` (the frozen set) | [2026-10-04-actions-real-proxied-18bcf2b.md](2026-10-04-actions-real-proxied-18bcf2b.md) | 9 of 10 cases fully passing, 39 of 42 checks |
| 2 | `cf1acee` (two fixes below) | [2026-10-04-actions-real-proxied-cf1acee.md](2026-10-04-actions-real-proxied-cf1acee.md) | 9 of 10 cases fully passing, 39 of 42 checks |

## What failed, and why

**AR07 (npr.org)** failed in both runs. The step was `failed/action_failed`: the loadMore click timed out after 60 s.

- Playwright's call log shows the cause: `<div class="tp-modal">…</div> intercepts pointer events`. A Piano (tinypass) subscription modal covers the page a moment after it loads.
- A person would close it first. The modal is drawn by a cross-origin iframe, and no step in the frozen case closes it.
- The case stays as it was, and the failure stays in the denominator.

Probing NPR also showed two things in W2L itself, fixed in `cf1acee` with tests that fail on the code before it:

- **The loadMore button showed up after the step had already given up.** NPR draws "Load more stories" inside a container that its script shows a moment after load. Run straight after load, loadMore found the button hidden and ended the list unclicked (`end`, 0 rounds). Before, a hidden control was waited for only after a click; it is now waited for before the first click too, within the same 10 s. Fixture `/shown` in `listActions.integration.test.ts`.
- **The timeout error did not name what blocked the click.** Its message kept only Playwright's first line, `locator.click: Timeout 60000ms exceeded.` It now adds the call log's last report of what covers the control. In run 2, AR07 says `(<div class="tp-modal">…</div> intercepts pointer events)`. Fixture `/covered` in `browserActions.integration.test.ts`.

## Not shown here

- Any direct (unproxied) run, and any exit other than Singapore. Geo-targeted consent walls (the EU's) do not show from this exit.
- A cookie wall, and a frame of another origin: W2L's steps act on the top document only.
- The P5 row's exit as a whole: this record says what these runs showed, not whether the row is done.
