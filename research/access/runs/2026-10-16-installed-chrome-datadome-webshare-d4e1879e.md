# installed_chrome on four DataDome tasks: Clash datacenter exit vs Webshare residential exit, 2026-10-16

Label: `measurement`. The multi-date acceptance of the frozen candidate `e8b75c97` stays below 13 per round on the Clash exit, and nearly every miss is one of four DataDome tasks (T038, T045, T046, T068). On 2026-10-14 the Webshare residential exit passed T038 and T046 twice where Clash failed them ([record](2026-10-14-installed-chrome-exits-3dd497ef.md)), but the two exits ran one after the other. This record alternates them in one time window to ask whether the residential exit passes these four tasks more often. It is evidence for TASKS item 8 only. No product code or default exit changes.

## How it was run

- **Code and API.** Commit `d4e1879e` (main after #533), not the frozen candidate. One API process per round on port 8797, restarted every round, with installed Google Chrome headed (155.0.8059.80 by `--version` after the run; the answers' user agent says only `Chrome/155.0.0.0`) and a grant naming `installed_chrome` alone. Machine: Howard's Mac (arm64).
- **The two arms differ only in the exit.** The API and the run-set process both use it.
  - **A, Clash:** `HTTPS_PROXY=http://127.0.0.1:7890`, a datacenter exit.
  - **B, Webshare:** `research/access/cloudrun-xvfb/forward.mjs` on 127.0.0.1:8796 in front of the Webshare gateway in rotating mode (`<account>-us-rotate`), with `HTTPS_PROXY=http://127.0.0.1:8796`. Sticky sessions were not used.
- **Command per round:** `HTTPS_PROXY=<exit> HTTP_PROXY=<exit> NO_PROXY=localhost,127.0.0.1,::1 W2L_API_URL=http://127.0.0.1:8797 W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs --set all --only T038,T045,T046,T068,T047,T053 --access '"enhanced"' --save-responses`.
- **Tasks.** The four DataDome tasks plus two controls: T047 (Cloudflare, passes on Clash) and T053 (nearly always passes). A round where a control fails is marked as an exit problem for that round.
- **Order.** A, B, B, A, A, B, B, A, back to back from 08:41 to 09:09 UTC. Every run summary has `dirty: false`. Interaction policy as in ADR 0005: no clicks, no typing, no CAPTCHA solving. A CAPTCHA counts as a failure.
- **Raw runs.** `.w2l/access/archive/2026-10-16/dd-webshare/`, outside the repository.

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arm | A | B | B | A | A | B | B | A |
| Directory (UTC) | `08-41-33-322Z` | `08-43-14-604Z` | `08-48-04-577Z` | `08-53-13-824Z` | `08-55-17-839Z` | `08-57-08-869Z` | `09-02-25-256Z` | `09-07-25-330Z` |
| Exit address | 103.142.140.155 | 68.227.85.203 | 51.194.84.249 | 103.142.140.136 | 103.142.140.136 | 97.214.180.66 | 108.254.154.222 | 103.142.140.155 |
| Verified of 6 | 4 | 1 | 3 | 2 | 3 | 1 | 0 | 4 |
| Controls passed | 2 | 1 | 2 | 2 | 2 | 1 | 0 | 2 |

The exit address is the one `api.ipify.org` returned at the start of the round. In arm B the gateway rotates per connection, so the pages may have come from other addresses.

## Results

Each cell is the outcome, its reason and the page's HTTP status. `cw` means the lane waited for a challenge first.

| Task | A1 | A4 | A5 | A8 | B2 | B3 | B6 | B7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T038 (DataDome) | **pass** | captcha 403 cw | captcha 403 cw | **pass** | bot_detected 403 cw | empty_unverified 200 cw | bot_detected 403 cw | timeout |
| T045 (DataDome) | captcha 403 cw | captcha 403 cw | captcha 403 cw | captcha 403 cw | captcha 403 cw | captcha 403 cw | captcha 403 cw | captcha 403 cw |
| T046 (DataDome) | **pass** | captcha 403 cw | **pass** | **pass** | bot_detected 403 cw | **pass** | empty_unverified 200 cw | bot_detected 403 cw |
| T068 (DataDome) | bot_detected 403 cw | bot_detected 403 cw | bot_detected 403 cw | bot_detected 403 cw | timeout | bot_detected 403 cw | bot_detected 403 cw | bot_detected 403 cw |
| T047 (control) | pass | pass | pass | pass | pass | pass | pass | timeout |
| T053 (control) | pass | pass | pass | pass | timeout | pass | bot_detected 403 | timeout |

`bot_detected` is `bot_detected_generic`. Every failure was served by the installed_chrome rung, except T053 in B2 and B7 and T068 in B2, which timed out on the browser lane.

### Main measure: the four DataDome tasks

| | A: Clash | B: Webshare |
| --- | --- | --- |
| T038 | 2/4 | 0/4 |
| T045 | 0/4 | 0/4 |
| T046 | 3/4 | 1/4 |
| T068 | 0/4 | 0/4 |
| **All rounds** | **5 of 16** | **1 of 16** |
| Only rounds where both controls passed | 5 of 16 (A1, A4, A5, A8) | 1 of 4 (B3) |

### Controls

- **A:** both controls passed in all four rounds (8 of 8).
- **B:** controls failed in three of four rounds: B2 (T053 timeout), B6 (T053 `bot_detected_generic` 403) and B7 (T047 and T053 timeouts). These rounds are marked as Webshare problems. The main table shows both counts: all rounds, and only the clean rounds, which leaves one B round.
- **B was slower.** Tasks served by installed_chrome took 29 to 76 s in B, against 8 to 27 s in A.

## What this shows

- **No stable gain from the residential exit on these four tasks.** The plan's bar for a gain was B ahead by at least 4 attempts, with at least two tasks each ahead by 2. B was behind: 1 of 16 against 5 of 16 over all rounds. Even in its one clean round B passed only T046.
- **The 2026-10-14 lead did not repeat.** That day Webshare passed T038 and T046 twice each. Here it passed T038 0 of 4 and T046 1 of 4, while Clash passed them 2 of 4 and 3 of 4.
- **The two exits fail differently.** On Clash, every DataDome failure was a 403 after a challenge wait of about 25 s: T045, T038 and T046 got a CAPTCHA, and T068 was always `bot_detected_generic`. On Webshare, T038, T046 and T068 were mostly `bot_detected_generic`, with two empty 200 answers and two timeouts.
- **T045 and T068 failed all 16 attempts.** Neither exit changed them in this run.
- **The Webshare rotating exit was unreliable in this window.** It failed controls in three of four rounds, so this run cannot separate DataDome's answer from the exit's own failures on most B rounds.

## Not shown

- Webshare data used. It was not read from the Webshare dashboard before or after the run, so it is unknown.
- Other days, other times of day, more than four rounds per arm.
- The frozen candidate `e8b75c97`. This run used main at `d4e1879e`.
- Sticky Webshare sessions, other residential providers, other regions than `us`.
- Which exit address served each page in arm B. Only the address at round start was recorded.
- Why the Webshare rounds timed out or failed the controls.
