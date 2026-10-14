# installed_chrome: does the page's CDP session matter? 2026-10-14 (a negative result)

Label: `product`. The [ad-blocking A/B](2026-10-14-installed-chrome-blockads-112fd888.md) found `blockAds: false` ahead, 47 of 64 against 41, nearly all on two DataDome tasks (T038, T046). Ad blocking had blocked nothing on those pages. The one other difference between its arms was a CDP session: with ad blocking on, the browser lane opens one on the page and sends `Network.enable`; with it off, on installed_chrome, it opens none.

This record tests that difference alone. The answer is that the session makes no difference.

## How it was run

- **The experiment's change.** An experiment-only commit, `aca819b8`, kept on Howard's machine and never pushed or merged, added one switch to `packages/bench/src/subjects/browserLocal.ts`.
  - With `W2L_RESEARCH_CDP_SESSION=network` in the API's environment, the lane opens the page's CDP session even when nothing needs it.
  - It then sends `Network.enable` before navigating and records a `research_cdp_session` trace event.
  - It changes nothing else.
- **The rest of the code** is main at `1bba03ff`.
- **Local setup.** The local Octocrawl API, restarted for every run, through the Clash exit. Installed Google Chrome 155.0.8059.40 headed, and a grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **Command:** `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses --request '{"blockAds":false}'`. Ad blocking was off in both arms.
- **Arms:**
  - **C:** the API started with `W2L_RESEARCH_CDP_SESSION=network`. All 16 answers of every C run carry `research_cdp_session`.
  - **B:** the API started without it. No answer carries it.
- **Order.** C1, B1, B2, C2, C3, B3, B4, C4, back to back from 11:53 to 12:27 UTC.
- **Raw runs.** `.w2l/access/archive/2026-10-14/cdp-session`, outside the repository.

| Run | C1 | B1 | B2 | C2 | C3 | B3 | B4 | C4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Directory (UTC) | `11-53-19-003Z` | `11-57-20-628Z` | `12-01-22-195Z` | `12-05-38-942Z` | `12-10-05-892Z` | `12-14-15-928Z` | `12-18-44-793Z` | `12-23-12-241Z` |
| Verified | 10 | 10 | 9 | 8 | 9 | 8 | 8 | 8 |

No run had a false success.

## Results

| | C: CDP session with `Network.enable` | B: no session |
| --- | --- | --- |
| Verified per run | 10, 8, 9, 8 | 10, 9, 8, 8 |
| **Total** | **35 of 64** | **35 of 64** |

- **The arms differ on two tasks, by one attempt each:** T048 (C 0/4, B 1/4) and B001 (C 4/4, B 3/4).
- **Every other task is the same in both:**
  - T038 1/4;
  - T046 0/4;
  - T005 and T034 1/4;
  - T001, T045 and T068 0/4;
  - the rest 4/4.

## What this shows

- **The page's CDP session and its Network domain do not change what DataDome or Cloudflare let through here.** That rules out the one mechanism left for the earlier gain.
- **So the earlier B-over-A gain has no mechanism left.**
  - Ad blocking blocked nothing on T038 or T046.
  - The session makes no difference.
  - Two hours later the same B configuration verified 35 of 64 rather than 47, and T046 went from 3 of 4 to 0 of 4.
  - The gain is best read as run-to-run variation. `blockAds` stays as it is.
- **The conditions changed between the afternoon and the evening, for both arms alike:**
  - T001 passed in every afternoon run, and here failed all 8.
  - Each time, Cloudflare's challenge cleared in 2–3 s, and the next document was a 403 that asks the visitor to "verify you are human".
  - The runs did not record the exit address (`W2L_EGRESS_ECHO_URL` was not set), so whether the Clash exit changed is not known.
- **The challenge wait may give up early on such a page.** It stopped waiting when the second page came, because it looks only at decisive evidence, and a 403 whose only sign is that text is not decisive to it. The answer was then judged blocked.
  - Whether waiting on through such a page ever lets T001 through is not shown.
  - It is a separate question for a later run.

## Not shown

- Other exits or days.
- Whether the challenge wait's early stop costs T001.
