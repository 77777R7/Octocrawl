# The installed Chrome over raw CDP, with the DevTools port closed to pages, 2026-10-14

Label: `library_probe`. This is not the product path. A review of PR #491 on 2026-10-13 pointed out a risk in the measured launch. `--remote-allow-origins=*` together with a DevTools port on `127.0.0.1` could let the page being read, a stranger's site, open the browser's DevTools WebSocket and drive the browser, for example to read `file://` paths. Temporary profiles do not guard against that. This record tests the risk and a narrower launch, then checks that the narrower launch keeps the pass rate.

## How it was run

- Script: `research/access/probe-cdp.mjs` as added in the same PR. The runs used the same code before its header was updated.
- Installed Google Chrome 155.0.8059.40, headed, a fresh temporary profile per URL, the Clash data-centre exit `127.0.0.1:7890`.
- Machine: Howard's Mac (arm64).
- The two launches compared:
  - **as measured on 2026-10-13:** nodriver's flags, `--remote-allow-origins=*`, `--remote-debugging-host=127.0.0.1` and a fixed port.
  - **narrowed:** the same flags without `--remote-allow-origins` (`ALLOW_ORIGINS=none`). The port is a free one the operating system hands out, picked by the script and passed to Chrome with the host flag (`RANDOM_PORT=1`). Ports in use on this machine are excluded: 8787, 8791, 8792, 8794, 8795, 8797, 8798 and 8812–8814.

## The attack test (T002, ember-energy.org)

`ATTACK_TEST=1`: once the page was read, script running in the page itself tried two things.

1. Open the browser's DevTools WebSocket, given its full URL. The script handed the URL in; a page would have to find it.
2. `fetch` `http://127.0.0.1:<port>/json/version`, where that URL is listed.

| Launch | Port | Page opens the DevTools WebSocket (URL known) | Page reads `/json/version` | Node's own connection | T002 |
| --- | --- | --- | --- | --- | --- |
| as measured (`--remote-allow-origins=*`) | 65245 | **opened** | blocked (TypeError, CORS) | works | passed |
| narrowed (no `--remote-allow-origins`) | 65438 | **refused** | blocked | works | passed |

- **The risk is real.** With `*`, a page that has the DevTools WebSocket URL can drive the browser.
- **Finding the URL is the obstacle.** This test found no way for the page to read it: `/json/version` is blocked by CORS. The URL ends in a random browser id. Whether another way exists was not tested.
- **The narrowed launch closes the risk.** Without `--remote-allow-origins`, Chrome refuses the page's connection, which carries the page's Origin. Node's built-in WebSocket sends no Origin, so the driver's own connection is still accepted.

## The 16 tasks with the narrowed launch

Two runs, written at 16:11:53Z and 16:14:12Z on 2026-10-13 (UTC; 2026-10-14 in the operator's time zone, which this file is named after). They are set beside the two runs of the measured launch from earlier the same day ([first](2026-10-13-library-probe-cdp-16-b8d4efaa.md), [repeat](2026-10-13-library-probe-cdp-repeat-44e9498e.md)). ✓ means the task's data checks held on the visible text.

| Task | Measured, run 1 | Measured, run 2 | **Narrowed, run 1** | **Narrowed, run 2** |
| --- | --- | --- | --- | --- |
| T001 | ✓ | ✓ | ✓ | ✓ |
| T002 | ✓ | ✓ | ✗ challenge | ✓ |
| T005 | ✗ | ✗ | ✗ | ✗ |
| T034 | ✓ | ✓ | ✓ | ✓ |
| T038 | ✓ | ✓ | ✓ | ✓ |
| T045 | ✗ | ✗ | ✗ | ✗ |
| T046 | ✓ | ✓ | ✓ | ✓ |
| T047 | ✓ | ✓ | ✓ | ✓ |
| T048 | ✓ | ✗ | ✓ | ✓ |
| T049 | ✓ | ✓ | ✓ | ✓ |
| T053 | ✓ | ✓ | ✓ | ✓ |
| T068 | ✗ | ✗ | ✗ | ✗ |
| T071 | ✓ | ✓ | ✓ | ✓ |
| T076 | ✓ | ✓ | ✓ | ✓ |
| B001 | ✓ | ✓ | ✓ | ✓ |
| B008 | ✓ | ✗ | ✓ | ✓ |
| **Data checks held** | **13** | **11** | **12** | **13** |

- **The narrowed launch keeps the pass rate:** 12 and 13, against 13 and 11. Twelve tasks held in both narrowed runs. T002 held in one, the run-to-run variance the earlier runs showed on T048 and B008.
- **The port need not be a fixed, guessable number.** On 2026-10-13, port 0 held Cloudflare's challenge in 9 tries; there Chrome picks the port and writes it to `DevToolsActivePort`. A free port picked by the driver and passed explicitly with the host flag passed here. So what mattered was how the port is given, not that it was the same number each time. Why is still not isolated.
- **Not shown:**
  - another way for a page to find the DevTools URL;
  - other Chrome versions;
  - the Webshare exit with this launch;
  - headless.
