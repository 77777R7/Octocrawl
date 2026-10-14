# installed_chrome through Webshare: sticky vs rotating sessions, 2026-10-14

Label: `product`. The Cloudflare tasks failed on the Webshare residential gateway in both local runs and passed on the fixed Clash exit ([two-exit record](2026-10-14-installed-chrome-exits-3dd497ef.md)). The gateway gives each connection a new exit. Cloudflare says a managed challenge solved from a different IP than the one challenged is not accepted.

The hypothesis tested here: a page whose connections leave from many addresses cannot complete its challenge, and one exit per task would let it through. The answer, on this sample, is no.

## How it was run

- **Code and API.** Main at `aad87f9f`: the local Octocrawl API on port 8797, installed Google Chrome 155.0.8059.40 headed, and an access grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **Exit.** The Webshare rotating residential gateway `p.webshare.io`, country US. `research/access/cloudrun-xvfb/forward.mjs` ran on port 8796 and added the gateway's login. Every lane went through it.
- **The two modes differ only in the gateway username:**
  - **rotating:** `<user>-us-rotate`. The gateway gives each connection a new exit.
  - **sticky:** `<user>-us-<session id>`, with a new random numeric id per task. Webshare documents that the same session id "will route to the same exit IP for the duration of the session". Five new connections on one id all left from one address; five on `rotate` left from five.
- **One `run-set.mjs --only <task>` call per task**, so each task could have its own session. The `W2L_EGRESS_ECHO_URL` echo recorded each call's exit; in sticky mode that is the task's exit.
- **Scripts.** The runs used a scratch script. `research/access/sticky-vs-rotating.sh` is the same script, with the repository's paths.
- **Tasks.** The seven tasks that met Cloudflare's challenge in the earlier runs: T001, T002, T047, T048, T071, T076, B001.
- **Order and timing.** Four rounds in the order rotating, sticky, sticky, rotating, so neither mode had all the early or all the late slot. They ran from 06:35 to 06:54 UTC.

## Results

| Task | Rotating, round 1 | Sticky, round 1 | Sticky, round 2 | Rotating, round 2 |
| --- | --- | --- | --- | --- |
| T001 | ✗ challenge | ✓ | ✗ challenge | ✗ challenge |
| T002 | ✓ | ✓ | ✓ | ✓ |
| T047 | ✓ | ✓ | ✓ | ✓ |
| T048 | ✗ challenge | ✗ challenge | ✗ challenge | ✗ challenge |
| T071 | ✓ | ✗ challenge | ✗ challenge | ✗ challenge |
| T076 | ✓ | ✓ | ✓ | ✓ |
| B001 | ✓ | ✗ success, data checks failed | ✓ | ✗ challenge |
| **Verified** | **5** | **4** | **4** | **3** |

Run directories (UTC):

| Round | Run directory |
| --- | --- |
| Rotating, round 1 | `2026-10-14T06-35-59-822Z` onwards, one per task |
| Sticky, round 1 | `06-40-32-317Z` onwards |
| Sticky, round 2 | `06-44-46-903Z` onwards |
| Rotating, round 2 | `06-50-20-601Z` onwards |

Every task in the sticky rounds left from its own address, and no address repeated across tasks.

## What this shows

- **Sticky and rotating verified the same: 8 of 14 attempts each.**
  - Where they differ, it is by one attempt either way:
    - T001 passed once on sticky and never on rotating;
    - T071 passed once on rotating and never on sticky;
    - B001 passed once on each.
  - T048 was challenged in all four rounds.
- **Keeping one exit per task did not let the challenge through any more often.** On the residential gateway, whether Cloudflare lets a page through looks to depend more on the address the task happens to get than on whether its connections share one. This sample cannot tell those causes apart further.
- **An earlier, smaller comparison is not repeated here.** That morning the first ten of the 16 tasks gave rotating 5 and sticky 7, the two-task gap on T001 and T047. That sticky round in fact used one session id for the whole run: zsh's `$RANDOM` repeats inside `$(...)`, which the script has fixed. Its last six tasks failed when the plan's bandwidth ran out (the gateway answered `402`, `X-Webshare-Reason: bandwidthlimit`). That round counts for nothing here.
- **One false success.** B001 in the first sticky round was `success`, but its data checks failed. The product's own `verification` said `failed`, with readiness `not_extracted`, on bhphotovideo.com's laptop listing.

## What follows for the plan

A task-level fixed exit (an "egress lease") is not, on this evidence, a way to gain Cloudflare tasks on a residential gateway. A lease still has a use when the exit itself fails. The run above showed one such failure:
- a spent bandwidth plan made every page `connection_error`;
- the forwarder and the product did not name the 402 that caused it.

## Not shown

- DataDome tasks under sticky sessions.
- More than two rounds per mode, or rounds on other days.
- Sticky sessions on Cloud Run.
- The bandwidth used. Webshare's dashboard has it; this record does not.
