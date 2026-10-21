# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M16,M17,M18 --record research/parity/runs/2026-10-22-pa-d6-rest-main-direct-d0653e9c.md`
Source commit: `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50` (working tree had uncommitted changes)
Engine: the API on 8793 ran `main` `d0653e9c` (`extract-tf/34`): this worktree's `dist/`, compiled from `d0653e9c` before any D6 change, started with `node --import tsx packages/api/src/cli.ts` with the proxy variables removed. The runner ran from a detached checkout of `d0653e9c` whose uncommitted changes were only the three new cases M16–M18 in `research/parity/sites.v1.json` and the `markdownCountMin` check in `research/parity/run-sites.mjs` (the cases as committed on the D6 branches; M17's last check was first written as a `markdownExcludes` of a two-line text and changed to a `markdownCount` before this run). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:06:31.863Z → 2026-10-21T17:06:39.488Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 0 of 3 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/3; checks passing: 4/10.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M16 | https://www.skyscanner.net/routes/lond/pari/london-to-paris.html | 3/4 | markdownMatches (scrape-formats.only-main-content) |
| M17 | https://www.espn.com/nba/standings | 1/4 | table (scrape-formats.markdown); markdownMatches (scrape-formats.markdown); markdownCount (scrape-formats.markdown) |
| M18 | https://www.ft.com/technology | 0/2 | field status (FS); markdownCountMin (scrape-formats.only-main-content) |

Failed checks with the observed value:

- M16 [scrape-formats.only-main-content] markdownMatches `(?:£\d+ per passenger[\s\S]*){5}`: absent
- M17 [scrape-formats.markdown] table `^$ ^W$ ^L$ ^PCT$ ^GB$ ^HOME$ ^AWAY$ ^DIV$ ^CONF$ ^PPG$ ^OPP PPG$ ^DIFF$ ^STRK$ ^L10$`: 0 tables with this header
- M17 [scrape-formats.markdown] markdownMatches `^\| [^|]*\[Boston Celtics\]\(https://www\.espn\.com/nba/team/[^)]*\) \| \d+ \| \d+ \| `: absent
- M17 [scrape-formats.markdown] markdownCount `^\|\s*\|$`: 2
- M18 [FS] field `status`: failed
- M18 [scrape-formats.only-main-content] markdownCountMin `https://www\.ft\.com/content/[0-9a-f-]{36}`: 0

Note (written with the run): M16 got the full page on `browser_local` (Markdown 21,762 characters, 4 `£`): the deals section's heading and text, none of its deal cards. M17 as in the proxied run. M18 `failed`/`connection_error`: www.ft.com could not be reached direct from this network on 2026-10-22 (plain `curl` direct timed out too), so M18 says nothing about the extraction here; it is read proxied.
