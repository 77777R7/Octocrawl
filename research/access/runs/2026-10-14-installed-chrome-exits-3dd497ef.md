# installed_chrome on two exits: Clash data centre vs Webshare residential, 2026-10-14

Label: `product`. The [acceptance record](2026-10-14-installed-chrome-acceptance-7b56397b.md) ran the `installed_chrome` rung on the Clash data-centre exit and left one question open. The second run of the final commit verified 7, after six rounds on that exit in about 1.5 hours. This record runs the same code on Webshare's residential gateway, twice, and sets the two exits side by side.

## How it was run

- **Code.**
  - Webshare: main at `3dd497ef`, the merge of #493.
  - Clash: `7b56397b`, the final commit of #493. `3dd497ef` adds only that PR's documentation to it, so both exits ran the same code.
- **Local setup.** The local Octocrawl API, installed Google Chrome 155.0.8059.40 headed, and an access grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **Exits.**
  - **Clash:** the data-centre exit `127.0.0.1:7890`. Its address was 103.142.140.136 when this record was written.
  - **Webshare:** the rotating residential gateway `p.webshare.io`, through a local forwarder on `127.0.0.1:8794` that adds the gateway's login.
    - The forwarder is `research/access/probe-forward.mjs`. Chrome takes no proxy credentials on its command line, and the rung refuses a proxy with a login.
    - Three requests through it before the runs left from three different US residential addresses. The exit is not pinned per page.
  - For both exits, every lane (http, browser_local, installed_chrome) went through the exit.
- **Command, the same on both:** `node research/access/run-set.mjs --set all --only T001,T002,T005,T034,T038,T045,T046,T047,T048,T049,T053,T068,T071,T076,B001,B008 --access '"enhanced"' --save-responses`.
- **Runs.**
  - Webshare: `2026-10-14T02-57-10-627Z` and `2026-10-14T03-06-59-625Z` (UTC).
  - Clash: `2026-10-13T19-27-31-444Z` and `2026-10-13T19-31-28-096Z`.

## The 16 tasks

✓ means the task's data checks held. The lane is named where the answer did not come from `installed_chrome`.

| Task | Guard | Clash, run 1 | Clash, run 2 | Webshare, run 1 | Webshare, run 2 |
| --- | --- | --- | --- | --- | --- |
| T001 | Cloudflare | ✓ | ✓ | ✓ | ✗ challenge |
| T002 | Cloudflare | ✓ | ✗ challenge | ✓ (http) | ✓ (http) |
| T005 | DataDome | ✗ success, data checks failed | ✗ | ✗ success, data checks failed | ✓ |
| T034 | DataDome | ✓ | ✗ | ✓ (browser_local) | ✓ (browser_local) |
| T038 | DataDome | ✗ | ✗ | ✓ | ✓ |
| T045 | DataDome | ✗ | ✗ | ✗ 403 | ✗ 403 |
| T046 | DataDome | ✗ | ✗ | ✓ | ✓ |
| T047 | Cloudflare | ✓ | ✓ | ✗ challenge | ✗ challenge |
| T048 | Cloudflare | ✓ | ✗ challenge | ✗ challenge | ✗ challenge |
| T049 | DataDome | ✓ | ✓ | ✓ | ✓ |
| T053 | — | ✓ | ✓ | ✓ | ✗ timeout |
| T068 | DataDome | ✗ | ✗ | ✗ 403 | ✗ 403 |
| T071 | Cloudflare | ✓ | ✓ | ✓ | ✗ challenge |
| T076 | Cloudflare | ✓ | ✓ | ✓ | ✓ |
| B001 | Cloudflare | ✓ | ✗ challenge | ✗ challenge | ✗ challenge |
| B008 | — | ✓ | ✓ | ✓ | ✓ |
| **Verified** | | **11** | **7** | **10** | **8** |
| False success | | 1 (T005) | 0 | 1 (T005) | 0 |
| p50 / p95 ms | | 13062 / 25339 | 22044 / 23488 | 40253 / 67082 | 33591 / 54858 |

"Guard" is the bot check each task's pages answered with in these runs (the gate signals in their traces). It is not a claim about the site in general.

## What this shows

- **Neither exit is better overall:**
  - Clash: 11 and 7.
  - Webshare: 10 and 8.
- **They fail on different guards.**
  - **DataDome lets the residential exit through and stops the data-centre one.**
    - T038 (TripAdvisor) and T046 (G2) passed on Webshare in both runs and failed on Clash in both. They were the two tasks where the rung fell short of the probe on Clash.
    - T034 (Etsy) passed on Webshare both times, from the bundled browser before the rung was needed.
    - T005 (Etsy's home page) passed once.
  - **Cloudflare stops the residential exit and lets the data-centre one through.**
    - T047 and T048 failed on Webshare in both runs. B001 failed in both too. The waits ended `still_gated` on a 403 with `cf-mitigated: challenge`.
    - In Webshare's second run, T001 and T071 were stopped the same way.
    - On Clash, T047 passed in both runs, and T048 and B001 in one.
  - **T002** was answered by the plain HTTP lane on Webshare, both times.
- **Taken together, 14 of the 16 tasks passed on at least one exit.** That is every task except T045 and T068, which DataDome refused with a 403 on both exits.
  - Per exit, 11 tasks passed at least once on each.
  - An exit chosen per guard (residential for DataDome, data centre for Cloudflare) would cover more than either exit alone. That is not built, and these runs do not measure it.
- **Webshare is slower.** Its p50 was 34–40 s against Clash's 13–22 s, and T053 hit its timeout once. Each page goes through the forwarder and the residential gateway, on an exit that changes per connection.
- **The Clash run of 7 was not the exit going bad for good.** Webshare's runs came about 1.5 hours later, and Webshare lost the same Cloudflare tasks while gaining DataDome ones. So each exit decides by guard. Whether Clash's standing was lower during its second run is still not shown.

## Not shown

- Webshare's cost for these runs. Its bandwidth is not metered into the record.
- More than two runs per exit, or runs spread over a day.
- A pinned (sticky) residential exit per page.
- Other Chrome versions.

## Corrections

- 2026-10-14: "Its address was 103.142.140.136" names one address, and the record reads as if Clash had a single exit. It does not: four later runs left from four addresses in 103.142.140.0/24 ([Clash stability record](2026-10-14-installed-chrome-clash-stability-aad87f9f.md)).
  - The comparison is between a data-centre pool and a residential gateway that rotates per connection, not a fixed exit and a rotating one.
  - The per-guard pattern this record found does not depend on that.
