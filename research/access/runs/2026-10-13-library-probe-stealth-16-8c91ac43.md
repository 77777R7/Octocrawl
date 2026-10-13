# Camoufox and nodriver on the 16 challenge and bot-check tasks, 2026-10-13

Label: `library_probe`. This is not the product path. Each arm makes one headed browser visit per URL, to see whether another browser gets past the checks the product's browsers meet. A pass here decides nothing about a task; only a product run does.

## Why

On 2026-10-12, these 16 tasks were refused on every route within ADR 0005's means ([library probe](2026-10-12-library-probe-16-b117b451.md), [the challenge-pages task list](../../../docs/pa-challenge-botcheck-tasks.md)). That run covered undici, impit, stock Playwright, Patchright, Steel's browser, residential exits and Steel's solving. Browserbase `verified`, the one route left, is Enterprise-only ([T2.2](2026-10-13-t22-browserbase-verified-3d6b661c.md)). The Paused table restarts a second stealth engine when Patchright leaves a clear class of tasks unsolved, and that holds.

A survey of maintained projects on 2026-10-13 picked two candidates:

- **Camoufox:** Firefox with fingerprint patches in C++, MPL-2.0. Its official npm package needs no Python.
- **nodriver:** the installed Chrome, driven over raw CDP without a Playwright layer, AGPL-3.0, Python only. It is here as a measurement oracle only, since neither its licence nor its language can ship in the npm packages. It was the best on Cloudflare in a 2026 benchmark.

## How it was run

- Machine: Howard's Mac (arm64), macOS. The browsers ran **headed**, a fresh browser per URL.
- After `domcontentloaded`, the page was read each second and kept once no challenge wording remained (or after 20 s).
- **Crude pass:** HTTP 200, or a challenge that cleared, over 2,000 bytes, with no challenge wording.
- **Data:** each task's own checks (`markdownMatches`, `markdownCountMin`, from `research/access/tasks.v1.json` at `8c91ac43`), run on the page's visible text (`document.body.innerText`) rather than the product's Markdown.
- Arms and versions:
  - `camoufox` 0.5.8 on npm, its browser from `npx camoufox fetch` that day, about 1.29 GB. It ships uBlock Origin by default. `geoip: true` behind a proxy.
  - `playwright` 1.64.0 with its Chromium, headed, as the **control**.
  - `nodriver` 0.50.6 in a Python venv, with the installed Google Chrome and a temporary profile.
- Scripts, added with this record:
  - `research/access/probe-browsers.mjs` for Camoufox and the Playwright control: `ARMS=camoufox,playwright node probe-browsers.mjs input.json out.json`.
  - `research/access/probe_nodriver.py`: `PROBE_PROXY=... python probe_nodriver.py input.json out.json`.
  - `research/access/probe-forward.mjs`: a local forwarder that adds the gateway's login, which Chrome cannot send itself.
- Egresses. True direct was not run: the Mac's direct network has DNS interference on some hosts (CLAUDE.local), and its system proxy is Clash.
  - **Clash:** the machine's forward proxy `127.0.0.1:7890`, a data-centre exit. This is the exit of the product runs on 2026-10-11 and 10-12.
  - **Webshare:** the operator's rotating US residential gateway `p.webshare.io:80`, the exit of the 2026-10-12 library probe.
- Times (UTC), 2026-10-13:

  | Arm | Egress | Run |
  | --- | --- | --- |
  | nodriver | Clash | 13:35 |
  | Camoufox and the control | Clash | 13:51 |
  | Camoufox and the control | Webshare | 14:06 |
  | nodriver | Webshare | 14:18 |

- **A void run.** A first nodriver run through Webshare met a forwarder that had crashed on start (an import error in the script), and read Chrome's own error pages on all 16 tasks. It is not counted. It was fixed and run again at 14:18.

## Results

✓ means the task's data checks held. ✗ means they did not, followed by what was read.

| Task | Host | Vendor (10-12 attribution) | nodriver, Clash | nodriver, Webshare | Camoufox, Clash | Camoufox, Webshare | Playwright, Clash | Playwright, Webshare |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | studylib.net | Cloudflare | ✓ | ✗ challenge | ✓ | ✗ challenge | ✗ challenge | ✗ |
| T002 | ember-energy.org | Cloudflare (exit reputation) | ✓ | ✓ | ✓ | ✓ | ✗ challenge | ✓ |
| T005 | etsy.com | DataDome | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| T034 | etsy.com | DataDome | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ |
| T038 | tripadvisor.com | DataDome | ✗ page, thin text | ✓ | ✓ | ✓ | ✗ | ✗ |
| T045 | idealista.com | DataDome | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| T046 | g2.com | DataDome | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| T047 | capterra.com | Cloudflare | ✓ | ✗ challenge | ✗ challenge | ✗ | ✗ challenge | ✗ |
| T048 | crunchbase.com | Cloudflare | ✗ block | ✗ block | ✗ block | ✗ block | ✗ block | ✗ |
| T049 | yelp.com | DataDome | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| T053 | imf.org | none (Akamai) | ✓ | ✗ Access Denied | ✓ | ✗ Access Denied | ✓ | ✗ |
| T068 | economist.com | Cloudflare and DataDome | ✗ page, checks failed | ✗ | ✗ | ✗ challenge | ✗ | ✗ |
| T071 | cars.com | Cloudflare | ✓ | ✗ challenge | ✓ | ✗ challenge | ✗ challenge | ✗ |
| T076 | stackoverflow.com | Cloudflare | ✓ | ✓ | ✓ | ✓ | ✗ challenge | ✓ |
| B001 | bhphotovideo.com | Cloudflare | ✓ | ✓ | ✗ page, thin | ✓ | ✗ challenge | ✗ |
| B008 | imdb.com | none | ✓ | ✓ | ✓ | ✓ | ✗ "Human Verification" | ✗ |
| **Data checks held** | | | **11** | **8** | **7** | **7** | **1** | **3** |

- **Every page that passed was read and checked.** The titles and final URLs match the task's page (G2's "Best CRM Software", Yelp's "TOP 10 BEST Coffee in San Francisco", IMDb's "Top 250 movies", B&H's laptop listing), at tens of kB to a few MB.
  - T034 on nodriver failed the crude check only because its 2.5 MB page has the word "captcha" in a script. Its data checks held.
  - Camoufox's first answer was 403 on the Cloudflare tasks it passed. The challenge ran and cleared, and the page was read afterwards.
- **Some task by some arm:** 12 of 16. Never reached by any arm or exit: T005 and T045 (DataDome), T048 (Cloudflare's "Attention Required" block page) and T068 (economist.com).

## Reading, not isolated

Each arm ran once per exit, so day-to-day variance is not measured.

- **Headed alone does not do it.** The headed Playwright control reached 1 of 16 through Clash and 3 through Webshare, near what headless Playwright and Patchright did on 2026-10-12 (2 of 16 through Webshare).
- **Driving the installed Chrome over raw CDP did best.**
  - Through the same data-centre exit as the product, nodriver reached 11 of 16, Cloudflare and DataDome tasks both.
  - It reached 12 of 16 across the two exits.
  - Which of its differences matters is not isolated: the installed Chrome rather than Playwright's build, no automation flags, and no Playwright layer (`Runtime.enable` and the like).
- **Camoufox gets through Cloudflare's JS challenge often and DataDome rarely, except from the residential exit.** It reached 7 of 16 on each exit, a different 7.
- **The exit cuts both ways.** Through Webshare, Cloudflare held T001, T047 and T071 and Akamai held T053 against every arm. Through Clash, DataDome held T034, T038 and T046 against Camoufox. Neither exit is better for every task.
- **Not shown:**
  - headless (a server, Cloud Run);
  - repeat runs;
  - the product's own extraction on these pages;
  - whether the nodriver result carries over to a Node implementation of the same approach;
  - the cost of a headed browser on a server (Xvfb).
