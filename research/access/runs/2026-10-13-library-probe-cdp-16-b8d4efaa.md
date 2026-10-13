# The installed Chrome over raw CDP from Node, on the 16 challenge and bot-check tasks, 2026-10-13

Label: `library_probe`. This is not the product path. The earlier probe that day ([record](2026-10-13-library-probe-stealth-16-8c91ac43.md)) found nodriver, a Python tool under AGPL, reaching 11 of the 16 tasks through the data-centre exit. Stock Playwright, headed, reached 1. This probe asks whether the same approach works from Node, with no Python and no AGPL code, and whether it works headless.

## How it was run

- Script: `research/access/probe-cdp.mjs`, added with this record, with no dependencies. It launches the installed Google Chrome 155.0.8059.40 with the flags nodriver 0.50.6 uses, and a fresh temporary profile per URL. It drives the browser over CDP from Node's built-in WebSocket:
  - `Page.navigate`;
  - then `Runtime.evaluate` with `userGesture` each second, to read the HTML, the visible text and the title.
  - It sends no `Runtime.enable` and uses no Network domain.
- Judging is the same as the earlier probes:
  - a page is read once no challenge wording remains, at most 20 s after navigation;
  - the data checks are each task's own (`research/access/tasks.v1.json` at `b8d4efaa`), run on the visible text.
- Egress: the Clash forward proxy `127.0.0.1:7890`, a data-centre exit, the one nodriver reached 11 through.
- Machine: Howard's Mac (arm64), macOS.

## Finding the launch that works (T002, ember-energy.org)

The first version launched Chrome with `--remote-debugging-port=0`, which lets Chrome pick a port and write it to `DevToolsActivePort`. Cloudflare's challenge held on T002, which nodriver passed again through the same exit at the same time. Variants, each on T002 through Clash, headed:

| Variant | Runs | Result |
| --- | --- | --- |
| port 0 (first version) | 1 | challenge held |
| port 0, the HTML read through `DOM.getOuterHTML` as nodriver reads it | 1 | challenge held |
| port 0, first read 8 s after navigation | 1 | challenge held |
| port 0, both of the above | 1 | challenge held |
| port 0, Chrome opens the URL from its command line, no CDP for 10 s | 1 | challenge held |
| port 0, Chrome opens the URL from its command line, CDP connected at once | 1 | challenge held |
| port 0, Chrome given a clean environment (HOME, PATH, LANG, TMPDIR) | 1 | challenge held |
| port 0 with `--remote-debugging-host=127.0.0.1` | 2 | challenge held |
| **`--remote-debugging-host=127.0.0.1` with a fixed port, as nodriver launches** | 3 | **passed** |
| a fixed port without the host flag | 2 | Chrome opened no port on 127.0.0.1 (no result) |

So the reading method and CDP traffic during the challenge are not the cause. The launch is: the challenge held even when nothing connected over CDP. Host and fixed port could not be separated, and why they matter is not known.

## Results, all 16 tasks, the nodriver-style launch

Headed at 14:48Z, headless (`--headless=new`) at 14:53Z, both on 2026-10-13. ✓ means the data checks held; ✗ is followed by what was read.

| Task | Host | nodriver, Clash (earlier) | Node CDP, headed | Node CDP, headless |
| --- | --- | --- | --- | --- |
| T001 | studylib.net | ✓ | ✓ | ✗ challenge |
| T002 | ember-energy.org | ✓ | ✓ | ✗ challenge |
| T005 | etsy.com | ✗ | ✗ (home page, checks failed) | ✗ |
| T034 | etsy.com | ✓ | ✓ | ✗ |
| T038 | tripadvisor.com | ✗ thin | ✓ | ✗ |
| T045 | idealista.com | ✗ | ✗ | ✗ |
| T046 | g2.com | ✓ | ✓ | ✗ |
| T047 | capterra.com | ✓ | ✓ | ✗ block page |
| T048 | crunchbase.com | ✗ block page | ✓ | ✗ block page |
| T049 | yelp.com | ✓ | ✓ | ✗ |
| T053 | imf.org | ✓ | ✓ | ✓ |
| T068 | economist.com | ✗ | ✗ (page, checks failed) | ✗ challenge |
| T071 | cars.com | ✓ | ✓ | ✗ block page |
| T076 | stackoverflow.com | ✓ | ✓ | ✗ challenge |
| B001 | bhphotovideo.com | ✓ | ✓ | ✗ challenge |
| B008 | imdb.com | ✓ | ✓ | ✗ 403 |
| **Data checks held** | | **11** | **13** | **1** |

Each page that passed was read and checked: its title and final URL match the task's page. T048 is crunchbase's company profile for OpenAI, which no arm on any exit had reached before.

## Reading, not isolated

Each arm ran once, so day-to-day variance is not measured.

- **From Node, the approach reaches 13 of 16 headed through the product's own exit.** That is more than nodriver's 11. It needs no Python, no AGPL code and no new dependency, only the installed Chrome. Only T005 and T045 (DataDome) and T068 (economist.com) held.
- **Headless loses it: 1 of 16.** Every Cloudflare and DataDome task held, so headless with these flags is no better than stock Playwright.
  - A hosted service on Cloud Run has no display. It would need a virtual one (Xvfb) for a headed browser, which is not tried here.
  - On a person's own machine, `npx octocrawl serve` can open a window.
- **The launch matters, and its cause is unknown.** `--remote-debugging-port=0` held on T002 where the nodriver-style host and fixed port passed. That held across 9 tries of variants, and it held even with no CDP connection. A product launch should copy nodriver's.
- **Not shown:**
  - repeat runs;
  - the Webshare exit;
  - Xvfb;
  - the product's own extraction on these pages;
  - running beside the user's own Chrome on the same machine;
  - the effect of `page.route`-style interception, which a DataDome report names as a signal.
