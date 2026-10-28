# H2b: residential and datacenter exits for a hosted real-Chrome rung on Cloud Run, 2026-10-27

Label: `research`. Stage H, step H2b of the [current phase](../../../ROADMAP.md#current-phase-local-first-then-hosted-parity-from-2026-10-27) (decision 17, 2026-10-27): hosted access gets "a real Chrome rung on Octocrawl's servers (headed Chrome under Xvfb on Cloud Run, from G4), with an egress chosen by a comparison of residential or ISP proxy providers".

Howard approved this comparison on 2026-10-27 (D2) with these terms:
- the budget is at most $40 in all, and the run stops to ask before going over it;
- the runs are Cloud Run jobs in project `octopus-w2l-20260924-7r7`, region `asia-southeast1`;
- the temporary resources are deleted afterwards;
- the output is a record. Nothing here opens `installed_chrome` to hosting; that is D3 (the ADR 0005 revision) and later steps.

**The question.** On 2026-10-27 hosted verified 0 of the 16 challenge tasks and local `installed_chrome` verified 9. G4 ([record](2026-10-21-g4-cloudrun-fixed-runtime-22c9e1ca.md)) showed headed Chrome under Xvfb runs on a Cloud Run job:
- Google's own egress verified 3/16 and 1/16;
- Webshare's rotating residential pool verified 9/16 and 8/16, of which about 5 per round came from the `installed_chrome` rung itself.

This comparison measures what G4 left unknown for that residential exit, and the same for a datacenter exit, in the layout the hosted plan proposes:
- how many tasks the real-Chrome rung verifies when only it uses the exit;
- how many bytes a page costs on the exit;
- how long challenges take to clear under the 10 s cap O1 set (#722; G4 saw clears at 14–20 s under the old 19 s wait);
- what that comes to per verified page.

## Design (written and committed before any run)

Howard's decisions on this design, 2026-10-27, through the coordinating session:
- **Two arms run first:** Google's own egress as the control, and Howard's existing Webshare residential plan (Rotating Residential, $9.00 a month for 3 GB, renewing 2026-11-13; 1.28 GB of it used on 2026-10-27, so about 1.72 GB left).
- **A datacenter arm joins window 2 only.** Its code is in the harness: the forwarder's `list` style, `save-list.mjs`, and `cloud.sh` with `H2B_DC=1`. After window 1, Howard decided from the residential arm's results to add it (2026-10-27), on Webshare's Shared Datacenter plan (100 US IPs, $2.99 a month), which he buys himself. It runs in window 2 alone, so its figures come from one window and one UTC day, not two. If the proxy list is not saved by window 2's start, window 2 runs without the arm, and this record says so.
- **The static ISP and second residential (Decodo) arms** planned earlier are not measured, by Howard's choice.
- **Only the real-Chrome rung uses a paid exit,** through the `W2L_CHROME_PATH` wrapper, with no product-code change.
- **The paid arms send only the tasks robots.txt allows.** The google control arm sends all 21.
- **Residential bandwidth cap.** The CAPTCHA and local experiments share the residential plan, so the residential rounds of both windows should take no more than about 1.2 GB. The run stops and reports if the bytes per page measured would take the two windows past that.

This design was first committed with two arms (`5d28562c`). The datacenter arm's code was added the same day, before any run, and was left off by Howard's decision. After window 1 and before window 2, Howard added that arm to window 2. That revision changes this record alone, no code, and window 2 runs window 1's image.

Two measures changed after the smoke execution on image `228e01f0` and before window 1, from what the smoke showed:
- **Bytes by host.** Most of the smoke's bytes per call were Chrome's own service traffic: component downloads from `gvt1.com` and `clients2.googleusercontent.com`, and `clientservices.googleapis.com`. The forwarder now keeps every host's bytes, so the record gives that traffic apart from the page's.
- **CPU against the job's vCPU.** A 2 vCPU gen2 job shows 5 CPUs in `/proc/stat`, so utilisation over the CPUs shown understated saturation. The sampler now divides by the job's vCPU, keeps steal time apart, and reads the cgroup's limit and throttling where the instance has them.

### What is fixed

**Code.** Branch `claude/hosted-h2b-egress-17e305`, cut from main `8ece08ab`, with this design and `research/access/h2b-egress/`.
- Main includes O1 (#722, the challenge wait by gate: 0 for a captcha, 10 s for Cloudflare and bot checks, with `capMs` on the trace) and O6 (#721, the HTTP header cap).
- Product code (`packages/`) is main's and is not changed.
- Every execution runs the same image, built from the commit this design is committed in. The two windows run the same image, even if main moves between them.
- run-set records the commit in every call. It will show `dirty: true` for the reason G4 gave: three files in the build context.

**Image.** The G4 image: `research/access/g4-cloudrun/Dockerfile`, built by its `build.sh` on Cloud Build. Nothing in it changes:
- base `node:26.8.1-bookworm@sha256:53eaddc9…`;
- Google Chrome 155.0.8059.79 from Google's pool, checked against SHA-256 `b7726070…`. That `.deb` still answered 200 on 2026-10-27; the current Linux stable is 156.0.8078.47;
- Playwright 1.62.1 from `package-lock.json`;
- Xvfb `1920x1080x24`, `LANG=C.UTF-8`, `TZ=Etc/UTC`, the user `octo` with Chrome's sandbox on, and `tini -g` as PID 1;
- Chrome's flags: only the measured set, `nodriver-0.50.6-no-allow-origins` (ADR 0005, `DETECTION_FLAGS`).

The pushed image's digest is the pin, and the run section will list it. The job's command runs `research/access/h2b-egress/round.sh` under the image's own tini entrypoint.

**Grant.** G4's `installed_chrome` grant (`.w2l/access/installed-chrome-grant.json`, SHA-256 `09fdeafe…`), which names `installed_chrome` alone.
- The current engine's parser accepts it, and the self-check prints its SHA.
- The job gets its exact bytes as base64 in `G4_GRANT_B64`, as G4 did.

**Size.**
- The main rounds run at 2 vCPU / 4 GiB, gen2: the size the hosted plan proposes for the Chrome service.
- One extra residential round runs in window 1 at 4 vCPU / 8 GiB, to see whether 2 vCPU saturates.
- Every job has one task, no retries, a task timeout of 3600 s and the default compute service account.
- The container holds more than a Chrome service would. It also runs the API, and `browser_local` keeps its bundled Chromium open between calls (`browserLocal.ts` reuses its browser). The earlier rungs finish before the Chrome rung starts, so their CPU does not overlap it, but the resident Chromium's memory does.

### Routing: only the real Chrome goes through the exit

The hosted plan keeps the http, compatible-transport and bundled-browser rungs in the API service, on Google's egress. Only the Chrome service would use a paid exit. This comparison measures that layout, which G4 did not: G4 sent every lane through the exit.

- **Earlier rungs.** The API in each round runs with no environment proxy. Its http, `http_compat` and `browser_local` rungs leave from Cloud Run's own egress.
- **The installed Chrome.** `W2L_CHROME_PATH` points at `research/access/h2b-egress/chrome.sh`.
  - The wrapper replaces the rung's `--proxy-server=direct://` with the local metering forwarder.
  - It passes every other flag, `--version` and the profile unchanged, and execs Chrome so the launcher's kill and profile cleanup still apply.
  - It refuses a launch that carries any other `--proxy-server`, so an environment proxy leaking into the run fails loudly instead of being measured.
- **The forwarder.** `research/access/h2b-egress/forward.mjs` is the only process that sees the exit's login (the residential gateway's, or the datacenter list's), and the installed Chrome is its only client. So every byte it counts is the `installed_chrome` rung's.
- **The google arm.** It routes the Chrome through the same forwarder in `direct` mode, which connects to the site itself.
  - So in both arms, Chrome is behind the same local proxy, and only the exit differs.
  - This differs from G4's direct arm, where Chrome ran on `direct://` and could use QUIC. Behind a proxy, Chrome uses no QUIC.
- **No product change.** The rung, its flags, its waits and its gate are main's.

### Arms

One exit per task call (ADR 0005: no switching exits inside a session, and no new IP after a 429). Calls never retry on another exit.

| Arm | Exit | One exit per call |
| --- | --- | --- |
| `google` (control) | Cloud Run's own egress, through the forwarder in `direct` mode | Google's egress address for the execution |
| `res_a` | Webshare rotating residential, US, Howard's existing plan: the gateway login in `RESIDENTIAL_PROXY` (`.w2l/access/competitors.env`) that G4 and the CAPTCHA windows use | A fresh numeric session id per call in place of `-rotate` (`<user>-us-<id>`, Webshare's documented sticky session) |
| `dc` (window 2 only, added by Howard after window 1) | Webshare Shared Datacenter, 100 US IPs: the Direct connection list, one `ip:port:user:password` line per IP | One IP per call. The list is shuffled once with a fixed seed (20261027), and each call takes the next IP; the time between calls keeps the last call's. Window *n* starts at position (*n* − 1) × 50, and a round makes at most 22 calls (the self-check and 21 tasks). The list must hold at least 72 distinct IPs, the start is always given, and the list never wraps: a call past its end is refused. So no IP serves two calls |

What Webshare documents, read 2026-10-27 from its help centre, pricing page and terms:
- **Sticky sessions.** "Append a numeric session ID to maintain a sticky session". How long a bare id keeps its exit is not documented. Its endpoint generator sets 1 minute to 24 hours.
- **Restricted targets.** Ticketing is a restricted category on the rotating residential network, so T072 may be refused by the provider. A refusal comes back as `forbidden_host`. What the datacenter plan restricts was not checked; a refusal is recorded either way.
- **Sourcing.** Residential IPs come from "physical user devices" of consenting people, through "our suppliers' pools". The suppliers are not named.
- **The datacenter plan.** Its IPs are shared with other Webshare customers, and it includes 250 GB a month. Each line of the Direct connection list is one IP. Whether Webshare's backbone gateway with a session id pins a datacenter IP is not documented, so it is not used. The datacenter ASNs are not published.
- **Private and reserved ranges.** Whether Webshare blocks them is not documented. This comparison does not probe that, because on a residential exit a probe would reach into someone's own network.

**The exit of each call is checked twice.** The forwarder reads `api.ipify.org` through the call's own route when Chrome opens its first tunnel, and again when the call ends.
- Two different addresses mean the exit moved inside the call. That is recorded and the call is kept.
- The echo's bytes are counted apart from the page's.

### Tasks

21 tasks:
- `challenge16` from `research/access/subsets.v1.json`: T001, T002, T005, T034, T038, T045, T046, T047, T048, T049, T053, T068, T071, T076, B001, B008;
- T051, T072, T006, T007 and T011: the tasks hosted lost to local on 2026-10-27, robots.txt apart ([parity window](../../hosted/2026-10-27-parity-window-21edea41.md)).

Each round runs them through run-set, one call per task (`run-set.mjs --set all --only <task> --access '"enhanced"' --save-responses`), so each call gets its own exit.

**robots.txt.** A hosted server obeys robots.txt for every URL; on 2026-10-27 it refused T049 and B008 for that reason. The paid arms stand in for that server, so they obey robots.txt too.
- Before each window, one execution on Cloud Run's own egress (`round.sh` arm `robots`) reads every task's robots.txt with the product's own `RobotsOriginCache` and decision, as the standard identity.
  - A robots.txt that cannot be fetched counts as disallowed (RFC 9309 §2.3.1.4, as the product holds). It is asked once more after 10 s.
  - A trial from this Mac through Clash on 2026-10-27 timed out on Etsy's and The Economist's robots.txt and got a network error on TikTok's. That is why the verdict is read once per window, from Cloud Run, and shared by the paid rounds.
- The paid rounds do not send the tasks that verdict disallows. Each such task stays in the denominator as `skipped: robots`, not verified.
- The google arm sends every task, as G4 did.
- The record reports each round on all 21 tasks and on the robots-allowed subset, the tasks the window's verdict allows.

**Order.** Each round starts at its own place in the list, so rounds running at the same time are on different sites:
- the offsets are google 0, residential 7, and the residential round at 4 vCPU 14;
- the datacenter round takes 14 in window 2, which has no 4 vCPU round;
- window 2 runs the list backwards with the same offsets.

### Windows

- **A smoke execution first.** One google execution of T001 and T046 (window `smoke`) checks the image, the forwarder, the self-check, run-set, the digest and the CPU sampler on Cloud Run, and gives a first count of bytes per call. It uses no paid exit and no list position, and it is reported but not counted in either window.
- **Two windows, on different UTC days.** Each starts with the robots verdict, then starts its rounds at once as parallel executions: google and residential, and in window 1 also residential at 4 vCPU / 8 GiB. The datacenter round joins window 2 only. Each execution takes one task call at a time.
- **Watching the residential bytes.** While a window runs, the residential rounds' bytes per call are read from their log lines. If their mean would take the residential rounds of both windows past about 1.2 GB, those rounds are stopped and the coordinating session is told. A stopped round is recorded as stopped, with every call it made.
- **No Mac arm.** The Mac only starts the jobs and reads their logs, so it disturbs none of the Mac measurements queued for the day.
- **Timing.** The windows keep at least an hour away from the hosted parity window at 2026-10-28 00:02 UTC. That window reads several of the same sites from Google's egress in the same region.

### Each round, in order (`round.sh`)

1. The image's record (Chrome, Node, Playwright and key packages), then Xvfb.
2. The forwarder, with the arm's login. The script's first step moves `H2B_UPSTREAMS` into an unexported shell variable, so no process but the forwarder ever receives it.
3. The self-check (`selfcheck.mjs`, G4's items) as its own forwarder call:
   - display;
   - the grant's SHA;
   - DNS for the 21 tasks' hosts and the residential gateway's name;
   - fonts;
   - Chrome and its version through the wrapper;
   - CDP;
   - the egress control page loaded in that Chrome through the arm's exit, with what Chrome reports about itself;
   - the close.
4. The API, with the grant and no environment proxy, then the API's own control: the echo page through the http rung, which gives Cloud Run's egress address.
5. The tasks, in the round's order. For each call:
   - the forwarder starts a call (a new exit);
   - the CPU sampler starts;
   - run-set runs the one task;
   - the sampler stops;
   - the forwarder ends the call;
   - `digest.mjs` prints one line.
6. The forwarder's final counters for every call, including a tunnel that outlived its call.

A round whose self-check or control fails still runs its tasks. It is marked in the results, kept in the record, and not rerun to replace it.

### What each call reports

| Measure | Source |
| --- | --- |
| Verified, false success, client time | run-set's verdict (`outcome.verified`, `falseSuccess`, `wallMs`) |
| Status, reason, route, rungs tried, gate | the saved answer and its trace |
| Robots decision at fetch time | the answer's `robotsDecision` |
| Challenge wait: ms, outcome and the cap used | the last `challenge_wait` event (`ms`, `outcome`, `capMs`) |
| Phases of the final rung | G4's `phasesOf`, unchanged |
| Chrome rung time | `chromeRungMs`: client time after the rung started. This is the upper bound, and the cost basis. `chromeTraceMs`, the rung's last trace event, is the lower bound |
| Bytes through the exit | the forwarder: up and down per call, CONNECT exchange included, the echo's apart; tunnels, statuses, the proxy's refusals with its reason header, connect time, and every host's bytes. Chrome's own service traffic is the bytes of `*.gvt1.com`, `clientsN.googleusercontent.com`, `clientsN.google.com` and Chrome's service hosts on `googleapis.com` (client services, update, optimization guide, Safe Browsing, autofill); hosts a page may load too, such as `accounts.google.com`, `www.googleapis.com`, gstatic and reCAPTCHA, stay with the page |
| The call's exit | the forwarder's echo at the first tunnel and at the end, and whether it moved |
| CPU | `cpu.mjs`, every 500 ms from `/proc`: the instance's busy CPU-seconds and steal seconds; average and peak utilisation and the share of samples at ≥ 90 %, all against the job's vCPU; the cgroup's CPU limit and the share of its periods throttled, where the instance has them; and lower-bound seconds for the installed Chrome, the bundled Chromium and node |

Bytes are counted on the forwarder's connection to the exit, the traffic Webshare bills, without TCP/IP headers. If Howard reads a plan's used bandwidth before and after a window, that figure is set beside the forwarder's. Otherwise Webshare's own count stays unknown.

### What each round reports

For each round, and for each arm over both windows:
- verified and false successes, on all 21 tasks and on the robots-allowed subset;
- how many were verified by the Chrome rung itself, and how many calls reached it;
- p50 and p95 of client time, and of the Chrome rung's time, by nearest rank;
- bytes per call through the exit, split into calls that ended verified and calls that did not, and how much of it was Chrome's own service traffic;
- the challenge clears, with their times and the cap they ran under;
- CPU at 2 vCPU, and at 4 vCPU for the extra round;
- $ per verified page.

A residential exit is someone's own connection, so this record gives its address to the /24 alone (`a.b.c.x`). Google's and the datacenter's addresses appear in full.

**$ per verified page.** Over all calls that reached the Chrome rung, verified or not:

> Σ (`chromeRungMs` × the Cloud Run job rate + bytes through the exit × the exit's price per GB) ÷ the pages the Chrome rung verified

- **Cloud Run rates** are G4's, read 2026-10-21 for `asia-southeast1` (Tier 2): $0.0000216 per vCPU-second and $0.0000024 per GiB-second. That is $0.0000528/s at 2 vCPU / 4 GiB and $0.0001056/s at 4 vCPU / 8 GiB.
- **The residential price per GB** is $3.00: Howard's plan is $9.00 a month for 3 GB (his dashboard, 2026-10-27).
- **The datacenter price per GB** is the plan's monthly price divided by the 250 GB it includes: $2.99 ÷ 250 ≈ $0.012 at the list price, or the price Howard reports. That is the price per GB with the bandwidth all used. The plan is mostly a price per IP, so the record gives its monthly price beside the figure.
- **The google arm** has no byte price. Its figure is the Cloud Run part alone.
- **The earlier rungs' cost is left out.** They run in the API service either way.

### Budget and ledger

Nothing is bought for the google and residential arms. The residential bandwidth comes out of Howard's existing plan: the record gives the bytes the forwarder counted and their cost at $3.00 per GB. The cloud part is at list prices: Cloud Build minutes, Cloud Run seconds, Artifact Registry storage, Secret Manager and Logging. The datacenter plan, which Howard buys himself for window 2, goes in the ledger at the amount he reports.

| Item | Estimate |
| --- | --- |
| Cloud Build | one or two builds on e2-highcpu-8, about $0.07 each (G4: two builds, $0.13) |
| Cloud Run | one robots execution per window, six round executions of 10–25 min (three in each window), and one short smoke execution: about $0.25–0.60 |
| Artifact Registry, Secret Manager, Logging | under $0.05 |
| Residential bandwidth, from Howard's plan | at most about 1.2 GB, so at most about $3.60 of the plan's $9.00 |
| Datacenter plan, bought by Howard | $2.99 for a month at the list price, or the amount he reports |
| **Total new spend** | **about $3.40–3.90** with the datacenter plan, against the $40 cap |

The run stops and asks before any step that would take the total past $40.

### Credentials

- **The residential login.** It is already on this Mac: `RESIDENTIAL_PROXY` in `~/Code/w2l/.w2l/access/competitors.env`, mode 600. G4 and the CAPTCHA windows use the same entry. Nothing new is pasted for it.
- **The datacenter list.** Howard pastes Webshare's Direct connection list into `node research/access/h2b-egress/save-list.mjs`, run in the Terminal panel, and presses Ctrl-D.
  - The list carries a user name and password on every line, in either of the download's two formats (`ip:port:user:password`, or `[http://]user:password@ip:port`, saved in the first form). IP authorization would not do, because Cloud Run's egress addresses are not fixed.
  - The terminal is in raw mode from before the prompt until the list is saved, so the paste is never shown or left for the shell.
  - A list that fails its check (a bad line, an IP twice, fewer than 72 IPs) is asked for again. The script prints counts and line numbers only.
  - It saves the list to `~/Code/w2l/.w2l/access/h2b-dc-proxies.txt`, mode 600.
  - In this run the list came another way. The coordinating session saved it from Webshare's download link to `~/Code/w2l/.w2l/access/webshare-dc-proxies.txt`, mode 600, and `cloud.sh` reads that file through `H2B_DC_LIST`. The run section says how the credentials were handled.
- **How they reach Cloud Run.** Only through temporary Secret Manager secrets: `octocrawl-h2b-res-a`, and `octocrawl-h2b-dc` in window 2.
  - Each is readable through an IAM binding on the secret itself by the jobs' service account, the default compute account, as in G4.
  - Each becomes `H2B_UPSTREAMS` in its arm's jobs.
  - `cloud.sh secrets` pipes the residential login from its file to gcloud's stdin, and gcloud reads the list's file itself. Neither passes through an argument, a printed variable, a log or a record.
- **What gets printed.** The forwarder prints the residential gateway's host name and each call's session id, or the datacenter proxy's address and its place in the list. It never prints a login.
  - A value it cannot parse is refused without being repeated; a bad list line is named by its number alone.
  - A proxy's refusal reason is recorded with any user name or password taken out.

### Commands

`research/access/h2b-egress/cloud.sh` holds every gcloud step. Every step runs on this Mac with `HTTPS_PROXY`, and every call names the project.
- `build <branch>`: the image.
- `secrets`: the temporary secret, and the datacenter's with `H2B_DC=1`.
- `jobs <image@digest>`: the three jobs, and the datacenter's with `H2B_DC=1`.
- `smoke <tasks>`: the smoke execution.
- `robots <window>`: the window's robots.txt verdict.
- `window <n> <skip>`: every round of a window, at once.
- `logs <execution> <file>`: an execution's log lines.
- `cleanup <image>`: deletes the jobs, the secrets, the images and the Cloud Build source archives the builds noted.

`node research/access/h2b-egress/save-list.mjs` saves the datacenter list Howard pastes (see Credentials).

`node research/access/h2b-egress/report.mjs <directory>` turns the collected log lines into the record's tables. The run section will quote each command as it was run.

### Not measured

- **Other exits, by Howard's choice (2026-10-27).** The static ISP and second residential (Decodo) arms in the plan were not measured. Nothing was bought for them. The datacenter arm has window 2 alone: Howard added it after window 1.
- More than one call at a time per instance, load curves, other regions.
- Webshare's own billing, unless Howard reads the plans' usage.
- Whether Webshare blocks private or reserved addresses.
- Cleanup time per call: G4's gap, still without an event.
- A Mac arm. The Mac's own exits are measured elsewhere.

## Run (2026-10-27 and 2026-10-28 UTC)

Both windows ran. Every round's self-check passed, no round was stopped, and no call was a false success. Every task stays in the denominator: the two robots-disallowed tasks count as not verified in the paid rounds.

### Source, image and what changed after it

- **Image.** Built from `1abc0758` on this branch (base main `8ece08ab`) by Cloud Build `e10b77b0` (4 min 49 s): `asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-h2b-20261027@sha256:ea4a1f05cec2a8db27519444c7cc705ad87bc513362e6a417a7959cc973dcb8f`. Both windows ran this digest. Every call records commit `1abc075`, and each round's image line reads Chrome 155.0.8059.79, Node v26.8.1 and Playwright 1.62.1.
- **An earlier image.** `228e01f0` (Cloud Build `a961e270`, `sha256:974208bb…`) ran only the first smoke execution. The two measures that changed after it (bytes by host, CPU against the job's vCPU) are in the design section.
- **Commits after the image.** None is in the image, and none changes the code a round runs (`forward.mjs`, `round.sh`, `digest.mjs`, `cpu.mjs`, `chrome.sh`, `selfcheck.mjs`, `robots.mjs`):
  - `f30a6c41`: this record, the datacenter arm added to window 2;
  - `191a8b6f`: `save-list.mjs` also takes the `user:password@ip:port` format;
  - `3d6ff07c`: `cloud.sh` reads the datacenter list from `H2B_DC_LIST`;
  - after window 2, in this record's commit: `report.mjs` labels a failed task by its own reason and notes a refused tunnel as the site's or another host's. Before, any refused tunnel replaced the task's reason with "exit refused", although most refusals were for Chrome's service hosts or a challenge host, not the site. It runs on the Mac over the collected lines, so no round changed.
- **Main moved.** When the image was built, main was at `6a57fc3b`. Main's #734–#739 (hosted job and MCP refusals, hosted MCP timeouts and tools, and a per-request `compatible_transport` grant on hosted, behind an off switch) are not in the image, as the design fixed. Going by their titles they touch hosted jobs and MCP, which the rounds do not call. That they would not change these results was not tested.

### Network

The Mac ran only `gcloud`, through `HTTPS_PROXY` (Clash). Every round ran on Cloud Run in `asia-southeast1`, and its traffic left from Cloud Run:
- the API's rungs from Cloud Run's egress;
- the installed Chrome through the forwarder: `direct` for google, the Webshare residential gateway for `res_a`, a Webshare datacenter IP for `dc`.

### Commands

From this worktree, on this Mac, with `HTTPS_PROXY=http://127.0.0.1:7890`:

```bash
# 2026-10-27
bash research/access/h2b-egress/cloud.sh secrets
bash research/access/h2b-egress/cloud.sh build claude/hosted-h2b-egress-17e305    # 228e01f0
bash research/access/h2b-egress/cloud.sh jobs asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-h2b-20261027@sha256:974208bbfaae6fc114306378733c29b05fd34e840069229165ea95189e2a6889
bash research/access/h2b-egress/cloud.sh smoke T001,T046
bash research/access/h2b-egress/cloud.sh robots 1
bash research/access/h2b-egress/cloud.sh build claude/hosted-h2b-egress-17e305    # 1abc0758
bash research/access/h2b-egress/cloud.sh jobs asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-h2b-20261027@sha256:ea4a1f05cec2a8db27519444c7cc705ad87bc513362e6a417a7959cc973dcb8f
bash research/access/h2b-egress/cloud.sh smoke T001,T046
bash research/access/h2b-egress/cloud.sh window 1 T049+B008
# then gcloud run jobs delete (three jobs), gcloud secrets delete octocrawl-h2b-res-a,
# gcloud artifacts docker images delete <image>@sha256:974208bb… --delete-tags, gcloud storage rm (the build sources)

# 2026-10-28
H2B_DC=1 H2B_DC_LIST=$HOME/Code/w2l/.w2l/access/webshare-dc-proxies.txt bash research/access/h2b-egress/cloud.sh secrets
H2B_DC=1 bash research/access/h2b-egress/cloud.sh jobs asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-h2b-20261027@sha256:ea4a1f05cec2a8db27519444c7cc705ad87bc513362e6a417a7959cc973dcb8f
bash research/access/h2b-egress/cloud.sh robots 2
H2B_DC=1 bash research/access/h2b-egress/cloud.sh window 2 T049+B008
H2B_DC=1 bash research/access/h2b-egress/cloud.sh cleanup asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-h2b-20261027

# each execution's lines, then the tables below
bash research/access/h2b-egress/cloud.sh logs <execution> ~/Code/w2l/.w2l/access/h2b/logs/<file>.jsonl
node research/access/h2b-egress/report.mjs ~/Code/w2l/.w2l/access/h2b/logs
```

The raw log lines and `prices.json` stay in `~/Code/w2l/.w2l/access/h2b/logs/` (git-ignored).

### Smoke, robots verdicts and windows

- **Smoke (google, T001 and T046, not counted).** Two executions passed: `octocrawl-h2b-google-qqfnx` on image `228e01f0` and `octocrawl-h2b-google-8fg95` on `1abc0758`.
  - A call took about 1.2–1.5 MB through the exit. About 1.04 MB of that was Chrome's own service traffic.
  - At Chrome's start, 2 vCPU saturated briefly: on T046, 39 % of the cgroup's periods were throttled.
- **Robots verdicts.** Both were read on Cloud Run's egress. Both disallow T049 (Yelp) and B008 (IMDb), so the robots-allowed subset is 19 tasks in each window.
  - Window 1: `octocrawl-h2b-google-sl92s`, 2026-10-27 11:57:27 UTC, on the jobs of image `228e01f0`. The robots step did not change between the two images.
  - Window 2: `octocrawl-h2b-google-75sbh`, 2026-10-28 01:07:01 UTC.
- **Window 1.** Started 2026-10-27 at 12:11:25 UTC, in task order:
  - `octocrawl-h2b-google-79rg5`, offset 0;
  - `octocrawl-h2b-res-a-sgsc2`, offset 7;
  - `octocrawl-h2b-res-a-4cpu-wvbbd`, offset 14, at 4 vCPU / 8 GiB.
- **Window 2.** Started 2026-10-28 at 01:07:51 UTC (executions from 01:07:56), with the task order reversed:
  - `octocrawl-h2b-google-7mk5f`, offset 0;
  - `octocrawl-h2b-res-a-hsgfx`, offset 7;
  - `octocrawl-h2b-dc-4h47d`, offset 14, list start 50.

  The last round ended at 01:14:07. The datacenter round used shuffled list positions 50–69: 50 for the self-check, 51–69 for its 19 tasks. That is 20 IPs, none used twice, none an IP from the preflight (position 0). No call reached the list's end.
- **The residential byte watch** never came near its cap. The projection for both windows was 0.12–0.15 GB, against about 1.2 GB.

### Each round

From `report.mjs`, nearest-rank percentiles; "robots-allowed" is the 19 tasks of the window's verdict.

| Window | Arm | vCPU | Verified (21) | False successes | Verified, robots-allowed | Reached Chrome | Verified by Chrome | Client p50 / p95 s | Chrome rung p50 / p95 s | MB per call: verified / not / p95 / Chrome's own (mean) | Exits | Exit moved | $ per Chrome-verified page | GB per Chrome-verified page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | google | 2 | 6 / 21 | 0 | 4 / 19 (false 0) | 20 | 5 | 7.3 / 14.1 | 6.0 / 12.8 | 17.27 / 1.91 / 26.04 / 4.08 | 1 | none | $0.0015 | 0.0230 |
| 1 | res_a | 4 | 7 / 21 (2 skipped, robots) | 0 | 7 / 19 (false 0) | 17 | 5 | 13.4 / 50.2 | 13.4 / 49.3 | 2.43 / 1.39 / 5.56 / 1.01 | 15 | none | $0.0224 | 0.0058 |
| 1 | res_a | 2 | 8 / 21 (2 skipped, robots) | 0 | 8 / 19 (false 0) | 18 | 7 | 15.4 / 33.4 | 14.1 / 32.4 | 7.32 / 1.37 / 21.07 / 2.51 | 17 | none | $0.0304 | 0.0095 |
| 2 | dc | 2 | 9 / 21 (2 skipped, robots) | 0 | 9 / 19 (false 0) | 18 | 8 | 11.9 / 19.1 | 10.9 / 16.0 | 4.53 / 1.37 / 10.75 / 1.65 | 18 | none | $0.0013 | 0.0062 |
| 2 | google | 2 | 6 / 21 | 0 | 4 / 19 (false 0) | 20 | 5 | 9.3 / 12.8 | 6.3 / 11.5 | 13.55 / 1.93 / 8.93 / 3.10 | 1 | none | $0.0015 | 0.0193 |
| 2 | res_a | 2 | 5 / 21 (2 skipped, robots) | 0 | 5 / 19 (false 0) | 18 | 4 | 15.3 / 23.0 | 14.0 / 22.0 | 3.25 / 2.02 / 8.19 / 1.66 | 18 | none | $0.0340 | 0.0103 |

"Exits" counts distinct exit addresses among the calls that read one. A call reads none when Chrome opened no tunnel, as for T011, which `browser_local` verified before the Chrome rung; so the datacenter round shows 18 exits for 19 calls.

Challenges, refusals and CPU. A refusal is a non-200 answer from the exit itself to one CONNECT, with Webshare's reason header. The report lists each one; this table gives, for each task with a refusal, the hosts refused. The forwarder keeps a call's first 5 refusals, so a call with 5 kept may have had more.

| Window | Arm | vCPU | Challenge clears (cap 10 s) | Still gated after the cap | Tasks with a refusal by the exit | CPU of the job's vCPU: median avg / max peak / median share ≥ 90 % / median throttled share |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | google | 2 | T049 6.2 s, T076 1.0 s | 7 | none | 0.42 / 1.11 / 0.19 / 0.27 |
| 1 | res_a | 4 | none | 6 | 403 `client_connect_forbidden_host`: T072 (the site). 502 `target_connect_unknown_error`: T038 and T076 (the site among Google and Chrome hosts), T034 (Google and Chrome hosts, 5 kept), T001 and T048 (`brunhild.challenges.cloudflare.com`), T047 (`optimizationguide-pa.googleapis.com`) | 0.14 / 0.76 / 0.00 / 0.01 |
| 1 | res_a | 2 | T076 5.3 s, T046 8.6 s | 7 | 403 `client_connect_forbidden_host`: T072 (the site). 502 `target_connect_unknown_error`: T034 (Google and Chrome hosts, 5 kept) | 0.30 / 1.14 / 0.05 / 0.10 |
| 2 | dc | 2 | T046 6.6 s, T076 5.3 s | 6 | 502 `target_connect_resolve_failed`: T047 and T048 (`brunhild.challenges.cloudflare.com`) | 0.35 / 1.09 / 0.07 / 0.15 |
| 2 | google | 2 | T076 1.0 s, T049 5.8 s | 7 | none | 0.45 / 1.25 / 0.24 / 0.28 |
| 2 | res_a | 2 | T076 4.4 s | 8 | 403 `client_connect_forbidden_host`: T072 (the site). 502 `target_connect_unknown_error`: T005 (the site and a Google host), T034 (`i.etsystatic.com`), T068 (`static.captcha-delivery.com`), T002, T006, T047 and T051 (Google, Chrome or asset hosts, 5 kept) | 0.22 / 1.04 / 0.03 / 0.10 |

| Task | w1 google | w1 res_a 4 vCPU | w1 res_a | w2 dc | w2 google | w2 res_a |
| --- | --- | --- | --- | --- | --- | --- |
| T001 | ✗ captcha | ✗ gated 9 s; exit refused other hosts | ✗ gated 9 s | ✗ captcha | ✗ captcha | ✗ gated 9 s |
| T002 | ✗ gated 9 s | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✗ gated 9 s | ✓ installed_chrome |
| T005 | ✗ captcha | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✗ captcha | ✗ connection_error; exit refused the site 502 |
| T034 | ✗ captcha | ✗ timeout; exit refused other hosts, site unknown | ✗ timeout; exit refused other hosts, site unknown | ✓ installed_chrome | ✗ captcha | ✓ installed_chrome |
| T038 | ✗ captcha | ✗ connection_error; exit refused the site 502 | ✗ gated 9 s | ✗ gated 9 s | ✗ captcha | ✗ gated 9 s |
| T045 | ✗ captcha | ✗ captcha | ✗ captcha | ✗ captcha | ✗ captcha | ✗ captcha |
| T046 | ✗ captcha | ✗ gated 9 s | ✓ installed_chrome (cleared 8.6 s) | ✓ installed_chrome (cleared 6.6 s) | ✗ captcha | ✗ gated 9 s |
| T047 | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts, site unknown |
| T048 | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts | ✗ gated 9 s | ✗ gated 9 s |
| T049 | ✓ installed_chrome (cleared 6.2 s) | robots | robots | robots | ✓ installed_chrome (cleared 5.8 s) | robots |
| T053 | ✓ installed_chrome | ✗ bot_detected_generic | ✗ bot_detected_generic | ✗ bot_detected_generic | ✓ installed_chrome | ✗ bot_detected_generic |
| T068 | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s; exit refused other hosts |
| T071 | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s |
| T076 | ✓ installed_chrome (cleared 1.0 s) | ✗ connection_error; exit refused the site 502 | ✓ installed_chrome (cleared 5.3 s) | ✓ installed_chrome (cleared 5.3 s) | ✓ installed_chrome (cleared 1.0 s) | ✓ installed_chrome (cleared 4.4 s) |
| B001 | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome |
| B008 | ✓ installed_chrome | robots | robots | robots | ✓ installed_chrome | robots |
| T051 | ✗ gated 9 s | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✗ gated 9 s | ✗ timeout; exit refused other hosts, site unknown |
| T072 | ✗ http_error | ✗ http_error; exit refused the site 403 | ✗ http_error; exit refused the site 403 | ✗ http_error | ✗ http_error | ✗ http_error; exit refused the site 403 |
| T006 | ✗ captcha | ✓ browser_local | ✓ installed_chrome | ✓ installed_chrome | ✗ captcha | ✗ connection_error; exit refused other hosts, site unknown |
| T007 | ✗ gated 9 s | ✓ installed_chrome | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s | ✗ gated 9 s |
| T011 | ✓ browser_local | ✓ browser_local | ✓ browser_local | ✓ browser_local | ✓ browser_local | ✓ browser_local |

Self-checks and exits, from the report (residential exits to the /24):
- w1 google 2 vCPU: self-check passed; Chrome control exit 34.96.48.73; API control exit 34.96.48.73; bytes through the exit 114.98 MB; Chrome-rung cost $0.0074.
- w1 res_a 4 vCPU: self-check passed; Chrome control exit 71.231.144.x; API control exit 34.34.254.252; bytes through the exit 28.87 MB; Chrome-rung cost $0.1120.
- w1 res_a 2 vCPU: self-check passed; Chrome control exit 71.234.5.x; API control exit 34.34.254.68; bytes through the exit 66.37 MB; Chrome-rung cost $0.2126.
- w2 dc 2 vCPU: self-check passed; Chrome control exit 152.232.122.172; API control exit 34.96.48.105; bytes through the exit 49.99 MB; Chrome-rung cost $0.0106.
- w2 google 2 vCPU: self-check passed; Chrome control exit 34.34.254.87; API control exit 34.34.254.87; bytes through the exit 96.74 MB; Chrome-rung cost $0.0074.
- w2 res_a 2 vCPU: self-check passed; Chrome control exit 38.147.147.x; API control exit 34.96.48.105; bytes through the exit 41.21 MB; Chrome-rung cost $0.1359.

### Each arm over both windows

Sums of the rounds above. The datacenter arm and the 4 vCPU round have one round each.

| Arm | Rounds | Verified, robots-allowed | Verified (all 21) | False successes | Verified by Chrome | Chrome-rung cost | $ per Chrome-verified page | GB per Chrome-verified page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| google, 2 vCPU | w1, w2 | 8 / 38 | 12 / 42 | 0 | 10 | $0.0148 | $0.0015 (Cloud Run only) | 0.0212 |
| res_a, 2 vCPU | w1, w2 | 13 / 38 | 13 / 42 | 0 | 11 | $0.3485 | $0.0317 | 0.0098 |
| res_a, 4 vCPU | w1 | 7 / 19 | 7 / 21 | 0 | 5 | $0.1120 | $0.0224 | 0.0058 |
| dc, 2 vCPU | w2 | 9 / 19 | 9 / 21 | 0 | 8 | $0.0106 | $0.0013 | 0.0062 |

What the prices mean:
- **Residential** is $3.00 per GB. Its byte cost is most of its figure: in window 2, $0.1236 of the round's $0.1359.
- **Datacenter** is $2.99 ÷ 250 GB, about $0.012 per GB. That holds only when the plan's 250 GB a month are used. The plan is $2.99 a month for 100 IPs whatever is used. This round used about 50 MB, so the round's real share of that month is not its byte cost.
- **Chrome's own service traffic** was 59–73 % of the bytes through the exit in every round. In window 1 it was mostly Optimization Guide model and component downloads; window 2's hosts were not broken down.

| Round | Bytes through the exit, Chrome-rung calls | Chrome's own service traffic | Page traffic |
| --- | --- | --- | --- |
| w1 google | 114.98 MB | 71 % | 33.42 MB |
| w1 res_a 2 vCPU | 66.37 MB | 68 % | 21.14 MB |
| w1 res_a 4 vCPU | 28.87 MB | 59 % | 11.72 MB |
| w2 google | 96.74 MB | 64 % | 34.82 MB |
| w2 res_a 2 vCPU | 41.21 MB | 73 % | 11.30 MB |
| w2 dc | 49.99 MB | 59 % | 20.30 MB |

Without that traffic, window 2's residential round would come to about $0.0116 per Chrome-verified page, against window 1's about $0.011–0.012. That is computed from the same calls, not measured on a Chrome with those services off.

### What the run showed

One round per arm per window is a small sample: the residential arm at 2 vCPU verified 8 in one window and 5 in the other. Differences of a few tasks between arms are within that spread, so this section does not rank the arms by verified count alone.

- **The datacenter arm** verified 9 of 19 in its one round. That is the most of any round, against 8, 7 and 5 for residential and 4 for google.
  - Its Chrome rung p50 / p95 was 10.9 / 16.0 s, against 13.4–14.1 / 22.0–49.3 s for residential.
  - Before the run, ip-api.com flagged the preflight exit as hosting and proxy, and these sites still passed. This is one round on one day.
- **The residential exit refused tunnels in every round.** Webshare answered 502 `target_connect_unknown_error` to at least one CONNECT in 7 tasks of window 2's round, 6 of window 1's 4 vCPU round and 1 of window 1's 2 vCPU round.
  - Most refused hosts were Chrome's service hosts, Google hosts, asset hosts or challenge hosts, not the site. The site itself was refused in T005 (window 2), and in T038 and T076 (window 1, 4 vCPU), and each of those failed with `connection_error`.
  - T005, T051 and T006 failed in window 2's round (`connection_error`, `timeout`, `connection_error`) and verified in window 1's residential round and in the datacenter round. For T051 and T006 the forwarder kept 5 refusals, all of other hosts, so whether the site was refused too is unknown. These rounds do not show which refusal, if any, caused the failure.
  - Where a challenge host was refused, the task stayed gated: `brunhild.challenges.cloudflare.com` in T001 and T048 (window 1, 4 vCPU), and `static.captcha-delivery.com` in T068 (window 2).

  The datacenter round had refusals in two tasks, T047 and T048. Both were 502 `target_connect_resolve_failed` for the same host, `brunhild.challenges.cloudflare.com`, Cloudflare's challenge host, and both tasks stayed gated. Why the datacenter proxies could not resolve that host is unknown.
- **T072 (Ticketmaster).** The residential network refused it in all three rounds (403 `client_connect_forbidden_host`), as Webshare documents for ticketing. Through the datacenter exit it reached the site and failed with the site's own `http_error`, as on google.
- **T053 (IMF).** It verified on google in both windows and got `bot_detected_generic` on all four paid-exit rounds. So a paid exit can lose a page that Google's egress wins.
- **Challenges under the 10 s cap.** Every clear took 1.0–8.6 s:
  - T076: 1.0–5.3 s;
  - T049, on google: 6.2 and 5.8 s;
  - T046: 8.6 and 6.6 s.

  Each round had 6–8 challenges still gated after the cap. Whether a longer wait would have cleared any of them was not measured.
- **CPU at 2 vCPU.** The median share of cgroup periods throttled was 0.10–0.28, and the peak reached 1.04–1.25 of the job's vCPU. At 4 vCPU it was 0.01. Window 1's 4 vCPU round verified one fewer than its 2 vCPU twin, so these rounds do not show 2 vCPU costing verifications.

### Credentials and the datacenter list

- **The residential login** was the existing `RESIDENTIAL_PROXY` entry, as designed.
- **The datacenter list** did not come through `save-list.mjs`. The coordinating session saved it from Webshare's download link to `~/Code/w2l/.w2l/access/webshare-dc-proxies.txt`, mode 600.
  - The paste prompt was opened in the Terminal panel and closed with nothing saved.
  - The list was checked by counts alone: 100 lines of `ip:port:user:password`, 100 distinct IPv4 addresses, one user name, CRLF line ends. `cloud.sh secrets` checked it again ("100 lines, each a distinct IP").
- **Exposure, and when the credentials change.** Before the run, one proxy's credentials and the list's download link appeared in Howard's chat with the coordinating session.
  - Howard is to reset the Webshare proxy password after window 2. So the datacenter credentials will be rotated after the run, not before, and window 2 ran with credentials that had been exposed in that chat.
  - Neither the link nor any credential is in this record or in the branch's commits. A check after the run found none of the list's user names or passwords, and none of the residential login, in any collected log line or in the branch's diff.
- **On Cloud Run** both reached the jobs only as the temporary secrets `octocrawl-h2b-res-a` and `octocrawl-h2b-dc`, deleted after the window.

### Datacenter preflight

On 2026-10-27 at about 14:50 UTC, one call went from this Mac through the committed forwarder in `list` style, at shuffled position 0, which window 2 does not use. The Mac connected to the proxy directly, without Clash.
- One tunnel; `https://www.example.com/` answered 200.
- The echo answered 200 at the start and the end, with the same exit (104.168.25.x).
- 733 B up and 4,896 B down besides the echoes; the slowest connect took 712 ms.
- ip-api.com: United States (California), AS36352 (AS-COLOCROSSING; ip-api names the organisation HostPapa), flagged `hosting` and `proxy`. ipinfo.io answered with nothing, so the country and ASN come from ip-api alone.
- No login appeared in the forwarder's output.

### Ledger

List prices, against the $40 cap.

| When (UTC) | Item | Measure | Cost |
| --- | --- | --- | --- |
| 2026-10-27 11:50 | Cloud Build `a961e270` (image `228e01f0`) | 4 min 49 s | $0.077 |
| 2026-10-27 11:57 | Smoke `qqfnx` and robots `sl92s` (2 vCPU) | 40.1 s and 12.5 s | $0.003 |
| 2026-10-27 12:02 | Cloud Build `e10b77b0` (image `1abc0758`) | 4 min 49 s | $0.077 |
| 2026-10-27 12:09 | Smoke `8fg95` (2 vCPU) | 46.8 s | $0.0025 |
| 2026-10-27 12:11 | Window 1: google `79rg5`, res-a `sgsc2` (2 vCPU), res-a-4cpu `wvbbd` (4 vCPU) | 258.1 s, 391.7 s, 401.8 s | $0.0767 |
| 2026-10-28 01:06 | Robots `75sbh` (2 vCPU) | 20.0 s | $0.0011 |
| 2026-10-28 01:07 | Window 2: google `7mk5f`, res-a `hsgfx`, dc `4h47d` (2 vCPU) | 255.9 s, 370.2 s, 299.7 s | $0.0488 |
| 2026-10-27 to 28 | Artifact Registry, Secret Manager, Logging | | under $0.05 |
| 2026-10-27 | Webshare Shared Datacenter (100 US IPs, 250 GB a month), bought by Howard | the checkout showed Pay Today $7.11, of which $2.99 is this plan; not a confirmed card charge | $2.99 |
| **Total new spend** | | | **about $3.28, plus under $0.05** |

- **Residential bytes** came out of Howard's existing plan, not new spend: 0.096 GB in window 1 and 0.041 GB in window 2, about 0.14 GB in all, or $0.41 at $3.00 per GB.
- **Not an experiment cost.** The same checkout restarted the residential plan's period on 2026-10-27, $4.12 ($9.00 less $4.88 credited for unused time). That is Howard's residential prepay.
- **Webshare's own counters** were not read, so its count of either plan's bytes is unknown.

### Cleanup

- **After window 1** (2026-10-27 12:24 UTC), these were deleted:
  - the three jobs and the secret `octocrawl-h2b-res-a`;
  - image `228e01f0`, which no window used;
  - both Cloud Build source archives.

  Image `1abc0758` was kept so that window 2 would run the same image.
- **After window 2** (2026-10-28 01:16:26–01:16:53 UTC), these were deleted:
  - the four jobs (google, res-a, res-a-4cpu, dc), and their executions with them. `jobs` creates res-a-4cpu in every window; window 2 did not run it;
  - the secrets `octocrawl-h2b-res-a` and `octocrawl-h2b-dc`;
  - image `1abc0758`.

  The source archives were already gone. A check at 01:17 UTC listed no h2b job, secret, image or build source.
