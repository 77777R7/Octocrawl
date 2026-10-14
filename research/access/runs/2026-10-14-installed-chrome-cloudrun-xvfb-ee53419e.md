# installed_chrome on Cloud Run under Xvfb, on two exits, 2026-10-14

Label: `product`. ADR 0005 keeps `installed_chrome` local because a server has no display, and opens it to hosting only after a measurement with a virtual display (Xvfb). This record is that measurement: the same 16 challenge tasks from a Cloud Run job, once through Cloud Run's own egress and once through the Webshare residential gateway.

## How it was run

- **Code.** `ee53419e`, which is main at `a449d275` plus this PR's research files. Its product code (`packages/`) is the same as `3dd497ef`, which the local runs used.
- **Image.** `research/access/cloudrun-xvfb/Dockerfile`, built by `build.sh` in the same directory. It contains:
  - Google Chrome stable from Google's apt repository: 155.0.8059.79;
  - Xvfb, with a 1920×1080×24 screen;
  - Octocrawl with the bundled Chromium for the browser lane.
- **Chrome's sandbox stays on.** Chrome runs as a non-root user, so the launch keeps the measured flags and adds no `--no-sandbox`.
- **Job.** Cloud Run job `octocrawl-ic-xvfb` in project `octopus-w2l-20260924-7r7`, region `asia-southeast1`:
  - execution environment gen2, 4 vCPU, 8 GiB;
  - one task, no retries;
  - execution `octocrawl-ic-xvfb-8hjzp`.
- **What the job runs.** `run.sh` starts Xvfb and then the local API. The grant names `installed_chrome` alone, set in `W2L_ACCESS_GRANT`. The job then runs `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses` once, and `summarize.mjs` prints each task to the job's log.
- **Runs.**
  - **Own egress:** `2026-10-14T03-36-57-129Z` (UTC), from execution `octocrawl-ic-xvfb-8hjzp` of image `ee53419e`.
  - **Webshare:** `2026-10-14T03-54-07-126Z`, from execution `octocrawl-ic-xvfb-dwssh` of image `4e8bf804`. That image adds only `forward.mjs` and its use in `run.sh`.
- **Exits.**
  - **Cloud Run's own egress**, with no proxy. The run's echo (`W2L_EGRESS_ECHO_URL=https://api.ipify.org`) recorded 34.96.48.15, an address of Google Cloud.
  - **The Webshare gateway `p.webshare.io`**, the gateway the local runs used.
    - The job reads its URL, login included, from Secret Manager (`octocrawl-residential-proxy`, as `UPSTREAM_PROXY`).
    - `forward.mjs`, a local forwarder with no dependencies, adds the login. Every lane leaves through it.
    - The echo recorded 99.104.64.39. The gateway rotates its exit per connection.

## The 16 tasks

| Task | Cloud Run, Xvfb, own egress | Gate there | **Cloud Run, Xvfb, Webshare** | Clash data centre, local (two runs) | Webshare residential, local (two runs) |
| --- | --- | --- | --- | --- | --- |
| T001 | ✗ | 403, "verify you are human" | ✗ 403 `cf-mitigated` | ✓ ✓ | ✓ ✗ |
| T002 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ (http) | ✓ ✗ | ✓ ✓ |
| T005 | ✗ | 403 `x-datadome`, waited 19 s | ✓ | ✗ ✗ | ✗ ✓ |
| T034 | ✗ | 403 `x-datadome`, waited 19 s | ✓ (browser_local) | ✓ ✗ | ✓ ✓ |
| T038 | ✗ | 403 `x-datadome`, waited 19 s | ✓ | ✗ ✗ | ✓ ✓ |
| T045 | ✗ | 403 `x-datadome`, waited 19 s | ✗ 403 `x-datadome` | ✗ ✗ | ✗ ✗ |
| T046 | ✗ | 403 `x-datadome`, waited 19 s | ✓ | ✗ ✗ | ✓ ✓ |
| T047 | ✗ | 403 `cf-mitigated`, waited 19 s | ✗ 403 `cf-mitigated` | ✓ ✓ | ✗ ✗ |
| T048 | ✗ | 403 `cf-mitigated`, waited 19 s | ✗ 403 `cf-mitigated` | ✓ ✗ | ✗ ✗ |
| T049 | ✓ | the check cleared in 6 s | ✗ 403 `x-datadome` | ✓ ✓ | ✓ ✓ |
| T053 | ✗ | 403 "access denied" | ✗ 403 "access denied" | ✓ ✓ | ✓ ✗ |
| T068 | ✗ | 403 `cf-mitigated`, waited 19 s | ✗ 403 `x-datadome` | ✗ ✗ | ✗ ✗ |
| T071 | ✗ | 403 `cf-mitigated`, waited 19 s | ✗ 403 `cf-mitigated` | ✓ ✓ | ✓ ✗ |
| T076 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ | ✓ ✓ | ✓ ✓ |
| B001 | ✗ | 403 `cf-mitigated`, waited 19 s | ✓ | ✓ ✗ | ✗ ✗ |
| B008 | ✓ | — | ✗ failed | ✓ ✓ | ✓ ✓ |
| **Verified** | **2** | | **7** | **11, 7** | **10, 8** |

The local columns are from [the two-exit record](2026-10-14-installed-chrome-exits-3dd497ef.md).

- **p50 / p95 on Cloud Run:** 21769 / 28310 ms on its own egress, 38906 / 62990 ms through Webshare.
- **No false success** on either run.
- **B008 through Webshare** ended `failed`, not `blocked`. `summarize.mjs` does not print the reason, so it is not known.

## What this shows

- **The route runs on Cloud Run.** In every task the rung launched headed Chrome under Xvfb, with Chrome's own sandbox as a non-root user, and read the page. It produced no launch errors, no missing display and no `browser_unavailable`. The rung's trace named Chrome 155.0.8059.79 throughout.
- **From Cloud Run's own address it gets through almost nothing: 2 of 16.**
  - The pages answered with the blocks of every vendor: Cloudflare (`cf-mitigated`), DataDome, and a generic 403.
  - T053 passed in three of the four local runs, on both exits; the fourth timed out on Webshare. It refused this address outright with a 403 "access denied", before any challenge.
  - That points to the address, not Xvfb or the server: a Google Cloud address is refused by sites that let both a data-centre proxy exit and residential exits through.
- **Through Webshare, the same job verified 7.** The local runs through the same gateway verified 10 and 8.
  - **Passed:** T002, T005, T034, T038, T046, T076 and B001.
    - T002 came from the http lane and T034 from the bundled browser.
    - B001 failed in both local Webshare runs.
  - **Failed:**
    - the Cloudflare tasks that also failed locally on Webshare (T047, T048), plus T001 and T071;
    - T049, a DataDome task that passed in every local run;
    - T053, which answered 403 "access denied" here too.
  - So under Xvfb on a server the route does about as well as on a desktop through the same exit. One run against two cannot tell a difference of one to three tasks from the run-to-run variance seen locally.
- **For hosting, then:**
  - The display is not the obstacle; the egress is.
  - Through a residential gateway, a hosted `installed_chrome` would get through about as much as a local one on the same gateway.
  - It also takes about 40 s per page that reaches the rung, and the gateway's bandwidth.
  - Whether to open it to hosting is a decision on that cost, and on the residential exit's terms. The ADR keeps it local until that decision.

## Not shown

- More than one run per exit.
- Cloud Run through a data-centre proxy like the local Clash exit.
- Another region.
- The cost:
  - the job: one execution of 5 min 46 s and one of 10 min 20 s, at 4 vCPU and 8 GiB;
  - Webshare's bandwidth.
