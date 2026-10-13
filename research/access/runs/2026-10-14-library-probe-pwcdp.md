# The installed Chrome, narrowed launch, driven by Playwright over CDP, 2026-10-14

Label: `library_probe`. This is not the product path. ADR 0005's `installed_chrome` route was measured with Chrome driven over raw CDP from Node ([narrowed launch](2026-10-14-library-probe-cdp-safe-launch.md)). Octocrawl's browser lane is built on Playwright. This record checks whether the same Chrome, launched the same way but driven by Playwright's `connectOverCDP`, keeps the pass rate. If it does, the route can reuse the browser lane instead of a second driver.

## How it was run

- Script: `research/access/probe-pwcdp.mjs` (added in the same PR).
  - It launches Chrome exactly as the narrowed launch did: nodriver 0.50.6's flags, no `--remote-allow-origins`, a free port picked by the script and passed with `--remote-debugging-host=127.0.0.1`, and a fresh temporary profile per URL.
  - Playwright (1.64, from the probe's own scratch install) then connects with `chromium.connectOverCDP` and reads in the window Chrome opened (`browser.contexts()[0].pages()[0]`). It sets no viewport, User-Agent, locale or timezone of its own.
- Installed Google Chrome 155.0.8059.40, headed, through the Clash data-centre exit `127.0.0.1:7890`.
- Machine: Howard's Mac (arm64).
- Two runs, written at 16:39:29Z and 16:42:31Z on 2026-10-13 (UTC; 2026-10-14 in the operator's time zone, which this file is named after).
- The same 16 tasks and data checks as the raw-CDP runs. ✓ means the task's data checks held on the visible text.

## The 16 tasks

| Task | Raw CDP, narrowed, run 1 | Raw CDP, narrowed, run 2 | **Playwright over CDP, run 1** | **Playwright over CDP, run 2** |
| --- | --- | --- | --- | --- |
| T001 | ✓ | ✓ | ✓ | ✓ |
| T002 | ✗ challenge | ✓ | ✓ | ✓ |
| T005 | ✗ | ✗ | ✗ | ✗ |
| T034 | ✓ | ✓ | ✓ | ✓ |
| T038 | ✓ | ✓ | ✓ | ✓ |
| T045 | ✗ | ✗ | ✗ | ✗ |
| T046 | ✓ | ✓ | ✓ | ✓ |
| T047 | ✓ | ✓ | ✓ | ✓ |
| T048 | ✓ | ✓ | ✗ challenge | ✗ challenge |
| T049 | ✓ | ✓ | ✓ | ✓ |
| T053 | ✓ | ✓ | ✓ | ✓ |
| T068 | ✗ | ✗ | ✗ | ✗ |
| T071 | ✓ | ✓ | ✓ | ✓ |
| T076 | ✓ | ✓ | ✓ | ✓ |
| B001 | ✓ | ✓ | ✓ | ✓ |
| B008 | ✓ | ✓ | ✓ | ✓ |
| **Data checks held** | **12** | **13** | **12** | **12** |

## What this shows

- **What gets through is decided by the launch, not the driver.** Playwright over CDP held 12 tasks in both runs. Raw CDP with the same launch held 12 and 13. Headed stock Playwright, which launches its own Chromium with its own flags, held 1 ([2026-10-13](2026-10-13-library-probe-stealth-16-8c91ac43.md)).
- **One task differs in both runs: T048 (crunchbase).** It held in both raw-CDP runs here, and in one of the two measured on 2026-10-13. Under Playwright it showed its challenge both times.
  - Two runs cannot tell whether this is Playwright's connection or the variance T048 already showed.
  - The product acceptance runs (ADR 0005) will show it again.
- **So the route reuses the browser lane.** The `installed_chrome` rung is Octocrawl's browser lane on this launch, reading in Chrome's own window and default context. It inherits the lane's robots.txt, rate limits, budget and Evidence Record, instead of adding a second CDP driver.
- **Not shown:**
  - the product rung itself. It adds the browser lane's own steps: an ad-host block list through `Network.setBlockedURLs`, and reading `navigator.userAgent` in Chrome's window on `about:blank` before navigating. ADR 0005's acceptance runs measure those;
  - the Webshare exit;
  - other Chrome versions.
