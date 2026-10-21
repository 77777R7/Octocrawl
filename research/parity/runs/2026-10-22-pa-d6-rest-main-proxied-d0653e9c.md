# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M16,M17,M18 --record research/parity/runs/2026-10-22-pa-d6-rest-main-proxied-d0653e9c.md`
Source commit: `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50` (working tree had uncommitted changes)
Engine: the API on 8793 ran `main` `d0653e9c` (`extract-tf/34`): this worktree's `dist/`, compiled from `d0653e9c` before any D6 change, started with `node --import tsx packages/api/src/cli.ts` with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). The runner ran from a detached checkout of `d0653e9c` whose uncommitted changes were only the three new cases M16–M18 in `research/parity/sites.v1.json` and the `markdownCountMin` check in `research/parity/run-sites.mjs` (the cases as committed on the D6 branches; M17's last check was first written as a `markdownExcludes` of a two-line text and changed to a `markdownCount` before this run). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:05:33.955Z → 2026-10-21T17:05:44.034Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 3 of 3 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 0/3; checks passing: 3/10.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M16 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 1/4 | markdownIncludes "Flight deals from London to Paris" (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content) |
| M17 | https://www.espn.com/nba/standings | 1/4 | table (scrape-formats.markdown); markdownMatches (scrape-formats.markdown); markdownCount (scrape-formats.markdown) |
| M18 | https://www.ft.com/technology | 1/2 | markdownCountMin (scrape-formats.only-main-content) |

Failed checks with the observed value:

- M16 [scrape-formats.only-main-content] markdownIncludes `Flight deals from London to Paris`: absent
- M16 [scrape-formats.only-main-content] markdownMatches `(?:£\d+ per passenger[\s\S]*){5}`: absent
- M16 [scrape-formats.only-main-content] markdownMatches `\]\(https://www\.skyscanner\.net/transport/flights/[A-Z]{3}/[A-Z]{3}/\d{8}`: absent
- M17 [scrape-formats.markdown] table `^$ ^W$ ^L$ ^PCT$ ^GB$ ^HOME$ ^AWAY$ ^DIV$ ^CONF$ ^PPG$ ^OPP PPG$ ^DIFF$ ^STRK$ ^L10$`: 0 tables with this header
- M17 [scrape-formats.markdown] markdownMatches `^\| [^|]*\[Boston Celtics\]\(https://www\.espn\.com/nba/team/[^)]*\) \| \d+ \| \d+ \| `: absent
- M17 [scrape-formats.markdown] markdownCount `^\|\s*\|$`: 2
- M18 [scrape-formats.only-main-content] markdownCountMin `https://www\.ft\.com/content/[0-9a-f-]{36}`: 25

Note (written with the run): this is the second proxied run on `main`; the first, about 25 seconds earlier with the same API and M17 still in its first form, was not kept as a file. It gave the same results for M17 and M18 (M18 25 distinct article links); its M16 got the full page on `browser_local` (Markdown 21,774 characters, 4 `£`, the section's heading but none of its deal cards), failing only the deal-card checks. In this run M16's `browser_local` capture was Skyscanner's bot check ("Are you a person or a robot?", 380 characters of Markdown), which the response reported as `success`: a false success, outside D6 and left as a follow-up. M17 and M18 went to `browser_local` too (plain HTTP escalated). M17's Markdown has the two one-column team tables (`markdownCount` 2) and the statistics tables apart from them; M18's has the stream alone, 25 distinct article links.
