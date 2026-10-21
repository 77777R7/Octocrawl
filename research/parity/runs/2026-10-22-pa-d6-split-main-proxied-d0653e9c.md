# Real-site run 2026-10-21

Command: `node research/parity/run-sites.mjs --only M17 --record research/parity/runs/2026-10-22-pa-d6-split-main-proxied-d0653e9c.md`
Source commit: `d0653e9c6ceb154848ddc9b80bb2c7f118f09e50` (working tree had uncommitted changes)
Engine: the API on 8793 ran `main` `d0653e9c` (`extract-tf/34`): this worktree checked out at `d0653e9c`, `npx tsc --build`, started with `HTTPS_PROXY`/`HTTP_PROXY` set to the local Clash proxy (`http://127.0.0.1:7890`). The runner ran from the same checkout with one uncommitted change, M17 in `research/parity/sites.v1.json` as committed on the D6 split-tables branch at `5bd45799` (header check taking a column name written as its sort link). Times are UTC; the local date (UTC+8) was 2026-10-22.
Run: 2026-10-21T17:37:59.412Z → 2026-10-21T17:38:05.278Z against http://127.0.0.1:8793
Network: NO_PROXY set in the runner's environment; 1 of 1 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 0/1; checks passing: 1/4.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M17 | https://www.espn.com/nba/standings | 1/4 | table (scrape-formats.markdown); markdownMatches (scrape-formats.markdown); markdownCount (scrape-formats.markdown) |

Failed checks with the observed value:

- M17 [scrape-formats.markdown] table `^$ ^\[?W(?:\]\([^)]*\))?$ ^\[?L(?:\]\([^)]*\))?$ ^\[?PCT(?:\]\([^)]*\))?$ ^\[?GB(?:\]\([^)]*\))?$ ^\[?HOME(?:\]\([^)]*\))?$ ^\[?AWAY(?:\]\([^)]*\))?$ ^\[?DIV(?:\]\([^)]*\))?$ ^\[?CONF(?:\]\([^)]*\))?$ ^\[?PPG(?:\]\([^)]*\))?$ ^\[?OPP PPG(?:\]\([^)]*\))?$ ^\[?DIFF(?:\]\([^)]*\))?$ ^\[?STRK(?:\]\([^)]*\))?$ ^\[?L10(?:\]\([^)]*\))?$`: 0 tables with this header
- M17 [scrape-formats.markdown] markdownMatches `^\| [^|]*\[Boston Celtics\]\(https://www\.espn\.com/nba/team/[^)]*\) \| \d+ \| \d+ \| `: absent
- M17 [scrape-formats.markdown] markdownCount `^\|\s*\|$`: 2

Note (written with the run): repeats M17 on `main` with the corrected header check; the `rest-main` records of the same night ran M17's first form. M17 went to `browser_local` (plain HTTP escalated). The Markdown has the two one-column tables of team names (`markdownCount` 2) and the statistics in separate tables, so no row holds a team and its record.
