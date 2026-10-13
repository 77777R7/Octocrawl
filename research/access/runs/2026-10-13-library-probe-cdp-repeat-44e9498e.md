# The installed Chrome over raw CDP, headed: a repeat through Clash and a run through Webshare, 2026-10-13

Label: `library_probe`. This is not the product path. It repeats [the first Node CDP run](2026-10-13-library-probe-cdp-16-b8d4efaa.md), 13 of 16 headed through the Clash data-centre exit, to see whether that holds, and runs the same through the Webshare residential gateway.

## How it was run

- **Script:** `research/access/probe-cdp.mjs` as on main at `44e9498e`.
  - Headed, with the nodriver-style launch: `FIXED_PORT_BASE`, so `--remote-debugging-host=127.0.0.1` and a fixed port per launch.
  - The installed Google Chrome 155.0.8059.40, a fresh temporary profile per URL.
  - Judging as before: each task's data checks on the visible text, at most 20 s for a challenge to clear.
- **Clash:** `FIXED_PORT_BASE=9600 PROBE_PROXY=http://127.0.0.1:7890 node probe-cdp.mjs input.json out.json`, written at 15:15:52Z.
- **Webshare:** `research/access/probe-forward.mjs` on `127.0.0.1:8794` toward the gateway `p.webshare.io:80`. The forwarder was checked first: `curl -x` to example.com answered 200. Then `FIXED_PORT_BASE=9700 PROBE_PROXY=http://127.0.0.1:8794 node probe-cdp.mjs …`, written at 15:21:44Z.
- **Machine:** Howard's Mac (arm64), macOS.

## Results

✓ means the data checks held; ✗ is followed by what was read.

| Task | Host | Clash, first run (14:48Z) | Clash, repeat (15:15Z) | Webshare (15:21Z) |
| --- | --- | --- | --- | --- |
| T001 | studylib.net | ✓ | ✓ | ✗ challenge |
| T002 | ember-energy.org | ✓ | ✓ | ✓ |
| T005 | etsy.com | ✗ | ✗ | ✗ |
| T034 | etsy.com | ✓ | ✓ | ✓ |
| T038 | tripadvisor.com | ✓ | ✓ | ✓ |
| T045 | idealista.com | ✗ | ✗ | ✗ |
| T046 | g2.com | ✓ | ✓ | ✗ page read, checks failed |
| T047 | capterra.com | ✓ | ✓ | ✓ |
| T048 | crunchbase.com | ✓ | ✗ "Attention Required!" block | ✗ "One moment, please…" |
| T049 | yelp.com | ✓ | ✓ | ✓ |
| T053 | imf.org | ✓ | ✓ | ✓ |
| T068 | economist.com | ✗ page read, checks failed | ✗ the same | ✗ the same |
| T071 | cars.com | ✓ | ✓ | ✗ challenge |
| T076 | stackoverflow.com | ✓ | ✓ | ✓ |
| B001 | bhphotovideo.com | ✓ | ✓ | ✓ |
| B008 | imdb.com | ✓ | ✗ CloudFront "The request could not be satisfied" | ✓ |
| **Data checks held** | | **13** | **11** | **9** |

## Reading, not isolated

- **Through Clash, 11 tasks held in both runs:** T001, T002, T034, T038, T046, T047, T049, T053, T071, T076 and B001.
  - T048 (crunchbase) passed once and was blocked once.
  - B008 (imdb) passed once. Once it met a CloudFront error page, which reads more like the CDN failing at that moment than a check, but that is not isolated.
  - The repeatable figure through the product's exit is 11 of 16, with 13 at best.
- **Through Webshare, 9.** Cloudflare held T001 and T071 there, as it did against nodriver and Camoufox through the same gateway. The residential exit does not help this approach.
- **Held in every run and on both exits:** T005 and T045 (DataDome), and T068 (economist.com, read, checks failed).
- **Not shown:** headless with a virtual display (Xvfb), more runs, and the product's own extraction on these pages.
