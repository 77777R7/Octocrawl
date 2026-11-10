# M3.4 follow-up: do the M3.2 pages follow the brand or the field-trial testing config? 2026-11-11

Label: `research`. Task list: [docs/enhanced-access-tasks.md](../../docs/enhanced-access-tasks.md), M3.4. Follows the
[probe](2026-11-11-m34-chrome-branding-probe-f3f01baf.md), which found two kinds of difference between the
installed Chrome 157 and Chrome for Testing 157: the client-hint brand, and what Chrome for Testing's field-trial
testing config adds. `--disable-field-trial-config` removes the second kind.

## Design and decision rule (written 2026-11-10T17:46:05Z, before any run; not changed afterwards)

- **Arm C157:** Chrome for Testing 157.0.8103.50.
- **Arm C157N:** the same binary behind a wrapper script that adds `--disable-field-trial-config`.
- **Arm S157:** the installed Google Chrome 157.0.8103.50.
- **Pages:** crunchbase (T048), stackoverflow (T076), B&H (B001): the three pages M3.2 saw following the build.
- **Rounds:** 2, in the order C157, C157N, S157. Two reads per arm and page.
- **Rule, per page:** the page *separates* today if one of C157 and S157 verifies both reads and the other verifies
  none. If it separates and C157N matches C157 on both reads → not the testing config (the brand, or the other
  differences that remain). If it separates and C157N matches S157 on both reads → the testing config. Anything
  else → no conclusion for that page.

## Run

- **When:** 2026-11-10T17:46:09Z–17:49:17Z (01:46–01:49 CST on 2026-11-11), six runs back to back.
- **Machine and exit:** Howard's Mac (darwin, arm64). Proxied: the API and the real Chrome went out through the
  shell's Clash proxy (`127.0.0.1:7890`), one exit for all six runs.
- **Source:** `run-set.mjs` recorded commit `f50c1b5d` (this branch: `f3f01baf` plus research files), tree not
  dirty, in all six.
- **API:** `W2L_ACCESS_GRANT=<installed-chrome grant> W2L_CHROME_PATH=research/access/exit-split/chrome.sh
  EXIT_SPLIT_STATE=<state dir> node --import tsx packages/api/src/cli.ts` on port 8787, one process, stopped
  afterwards. `<state dir>/chrome` named the build for each run (for C157N, the wrapper script).
- **Each run:** `node research/access/run-set.mjs --set all --only T048,T076,B001 --access '"enhanced"'
  --client-timeout-ms 330000 --save-responses --grant <grant> --arm <build>-r<round>`.
- **Warm-up:** both Chrome for Testing variants were started once on `about:blank` before the first run.
- **Which build launched:** the wrapper's log has 5 launches of `Google Chrome for Testing`, 5 of the flag wrapper
  and 6 of `Google Chrome`. Two page reads never reached the real Chrome (see below).
- **Run directories** (under `.w2l/access/runs/`, git-ignored): `2026-11-10T17-46-09-905Z` (C157-r1),
  `2026-11-10T17-46-40-304Z` (C157N-r1), `2026-11-10T17-47-10-911Z` (S157-r1), `2026-11-10T17-47-50-220Z`
  (C157-r2), `2026-11-10T17-48-16-446Z` (C157N-r2), `2026-11-10T17-48-43-455Z` (S157-r2).

## Results

What the request returned; in brackets, what the real-Chrome attempt returned and how long it took.

| Page | C157-r1 | C157N-r1 | S157-r1 | C157-r2 | C157N-r2 | S157-r2 |
|---|---|---|---|---|---|---|
| T048 crunchbase | verified (real Chrome not reached: the headless `browser_local` rung read it) | `access_denied` (block page, 3.0 s) | `cloudflare_challenge` (17.5 s) | verified (5.3 s) | verified (real Chrome not reached: `browser_local` read it) | `cloudflare_challenge` (12.1 s) |
| T076 stackoverflow | verified (9.8 s) | verified (7.9 s) | verified (8.1 s) | verified (7.3 s) | `cloudflare_challenge` (11.5 s) | verified (7.4 s) |
| B001 B&H | verified (6.6 s) | `cloudflare_challenge` (11.8 s) | verified (5.9 s) | verified (5.5 s) | verified (5.6 s) | verified (5.9 s) |

Verified of 6 reads: C157 6, C157N 3, S157 4. The `http` rung was refused on every read (crunchbase with the block
page, the other two with a challenge).

## Verdict

**No conclusion on any of the three pages.**

- **T048** separates by the rule (C157 2 of 2, S157 0 of 2), and C157N is mixed (1 of 2). Counting only the reads
  the real Chrome made, there is less still: C157 1 of 1, C157N 0 of 1, S157 0 of 2.
- **T076** and **B001** do not separate today: C157 and S157 both verified both reads. In M3.2, about eleven hours
  earlier, the installed Chrome was refused on T076 in both rounds and Chrome for Testing was challenged on B001 in
  all four runs.

## What else the run showed

Outside the rule, and from two reads per cell:

- The pattern M3.2 called the branding did not hold for two of its three pages on the next reading. Which build a
  site lets in changed within a day on the same Mac and exit, so a build-against-build difference from two rounds
  is not stable evidence. That is the case M4 was written for (reads spread over at least three days).
- crunchbase was read by the headless `browser_local` rung in 2 of 6 requests, and answered it with a challenge or
  the block page in the other 4. In the M1 and M3 records that rung never read it.
- C157N failed one read on each page, a different round each time (3 of 6 verified, against 6 of 6 for C157).
  Three failures out of six is not enough to say the flag makes things worse.
- The installed Chrome met a challenge on crunchbase that did not clear (17.5 s and 12.1 s); C157N met the block
  page once and reported it in 3.0 s without waiting, as R1.4 intends.
