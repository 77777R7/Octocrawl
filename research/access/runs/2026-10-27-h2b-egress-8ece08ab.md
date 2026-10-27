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
