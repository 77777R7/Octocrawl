# G4: installed_chrome on Cloud Run with a fixed runtime, paired with the Mac, 2026-10-21

Label: `research`. Task G4 in [the PA task list](../../../docs/pa-enhancement-tasks.md), under decision 5 (Howard, 2026-10-21):
- the budget is $10, and the run stops to ask before going over it;
- one Cloud Run job with a fixed image, in project `octopus-w2l-20260924-7r7`, region `asia-southeast1`;
- the Mac and Cloud Run are paired on the same 16 tasks and the same exits, one round each on direct and on Webshare;
- the temporary resources are deleted afterwards;
- the output is a record. Hosted enhanced access stays closed.

The question comes from the plan's §四.3. The 2026-10-14 job ([record](2026-10-14-installed-chrome-cloudrun-xvfb-ee53419e.md)) verified 2/16 direct and 7/16 through Webshare, with one round per arm, an image whose base and Chrome package were not pinned, and no local round on the same day. That is not enough to attribute the gap to Xvfb, the exit or CDP.

## Design (written and committed before any run)

### What is fixed

**Code.** Branch `claude/pa-g4-cloudrun`, cut from main `ab2d9bad`, with this design and `research/access/g4-cloudrun/`. Product code (`packages/`) is main's. The Mac and the job run the same commit, the one this design is committed in. Both sides record it through run-set's `environment.commit`, and both must show `dirty: false`.

**Image** (`research/access/g4-cloudrun/Dockerfile`, built by `build.sh` on Cloud Build). The pushed image's digest is the pin. The run section lists it.
- **Base:** `node:26.8.1-bookworm`, pinned by its amd64 manifest digest `sha256:53eaddc9…`. Node 26.8.1 is the Node of the local arm, so the HTTP lane's TLS stack is the same on both sides. The 10-14 image ran `node:22-bookworm`, by tag.
- **Chrome:** Google Chrome 155.0.8059.79 (`google-chrome-stable_155.0.8059.79-1_amd64.deb` from Google's pool), checked against SHA-256 `b7726070…` taken today.
  - This is the build the 10-14 job ran.
  - The Mac runs 155.0.8059.85, which Google's Linux pool does not have (404). The current Linux stable is 156.0.8078.47.
  - So the two sides share the major version 155 but not the build.
- **Playwright:** 1.62.1, from `package-lock.json` through `npm ci`. Its bundled Chromium serves the `browser_local` lane before the rung.
- **System packages:** Xvfb, xauth, x11-utils, tini, fonts-liberation, fonts-noto-cjk, git, and the dependencies `playwright install --with-deps` adds. These come from Debian bookworm at build time, so a rebuild can get newer versions; the digest pins this build's. `dpkg-query` writes every package version to `/app/.g4-image-manifest.txt` in the image, and each round prints the key ones.
- **Fonts:** the 10-14 set. The self-check counts font families and checks for Noto CJK and Liberation.
- **Locale and time zone:** `LANG=C.UTF-8`, `TZ=Etc/UTC`. The 10-14 image set neither, which Chrome reads as en-US and UTC, so these keep that. They are the system's settings. The rung passes no `--lang` and no time zone (ADR 0005).
- **Display:** `Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp`, as on 10-14.
- **Chrome's flags:** only the measured set, `nodriver-0.50.6-no-allow-origins` (ADR 0005, `installedChrome.ts` `DETECTION_FLAGS`), unchanged. The image adds none and the job sets none. Window size is Chrome's own default for that screen, also as on 10-14.

**Process supervision.**
- `tini -g` is PID 1. It reaps Chrome's helper processes and passes SIGTERM to the whole process group.
- `round.sh` traps SIGTERM: it marks it in the log and stops the API, the forwarder and Xvfb within Cloud Run's roughly ten-second grace.
- Each Chrome's profile is removed by the launcher's `close()`, or by its exit hook when the process ends first.
- Everything runs as the non-root user `octo`, with Chrome's sandbox on (no `--no-sandbox`).

**Admission.** run-set sends one task at a time. The rung's own gate allows at most 2 windows (ADR 0005). This experiment measures one-at-a-time only, with no load curve (see "Not measured").

**Job.** `octocrawl-g4-20261021`, from the image by digest:
- gen2 execution environment, 4 vCPU, 8 GiB (as on 10-14);
- one task, no retries, task timeout 3600 s;
- the default compute service account, as on 10-14.

**Grant.** The same `installed_chrome` grant on both sides: `.w2l/access/installed-chrome-grant.json`, SHA-256 `09fdeafe…`. The Mac's copy in the main checkout and the one in the `pa-delivery` worktree are byte-identical.
- The job gets the file's exact bytes as base64 in an environment variable (`G4_GRANT_B64`), because the SHA is taken over the bytes, trailing newline included.
- `round.sh` writes them to a temporary file.
- The grant is an attestation, not a secret. The self-check prints its SHA on both sides.

**Webshare credentials.** The gateway URL with its login (`RESIDENTIAL_PROXY` in `.w2l/access/competitors.env`) reaches the job only through a temporary Secret Manager secret, `octocrawl-g4-20261021-proxy`, as the env var `UPSTREAM_PROXY`. The secret's own IAM binding grants the job's service account `secretAccessor`.
- `round.sh` gives `UPSTREAM_PROXY` to `forward.mjs` alone and unsets it before anything else starts.
- The forwarder logs only the gateway host and port.
- The URL is in no image layer, no record and no log.
- On the Mac the forwarder reads it from `competitors.env`.

### Arms and pairing

Two exit arms, with one Mac round and one Cloud Run round each. All four rounds use the same commit, the same grant and the same 16 tasks (`challenge16` in `research/access/subsets.v1.json`), run by `run-set.mjs --set all --only <the 16> --access '"enhanced"' --save-responses`.

| Arm | Mac (`local.sh`, API on 8797, forwarder on 8796) | Cloud Run (`round.sh` in the job) |
| --- | --- | --- |
| direct | Forwarder → Clash (`127.0.0.1:7890`) → Clash's data-centre exit | No proxy: Cloud Run's own Google egress, Chrome on `--proxy-server=direct://` |
| webshare | Forwarder → the Webshare rotating gateway, addressed by IP (`G4_WEBSHARE_IP`) | Forwarder → the Webshare rotating gateway by name (`p.webshare.io`) |

**What "paired" means here.**
- **The direct arm does not have the same exit on both sides.** The Mac's "direct" leaves through Clash, because this Mac reaches few of these sites on its own line (K3's arm A did the same). Cloud Run's leaves through a Google Cloud address. So the direct arm compares two different exits and two runtimes at once. Its local-versus-cloud difference cannot be attributed to the runtime, and the conclusions will not do so.
- **Only the Webshare arm shares an exit.** Both sides use the same gateway and the same account's rotating US residential pool. The pool rotates the exit per connection, so the addresses differ from request to request on either side. The gateway's address can also differ with where it is resolved: the Mac uses an IP from DNS-over-HTTPS, because its own resolver forges `p.webshare.io` (K3 notes). Cloud Run uses Google's resolver.
- The Webshare arm is therefore the closest this setup gets to "same exit, different runtime". Its difference still includes:
  - Xvfb against the Mac's window server;
  - Linux against macOS Chrome;
  - Chrome 155.0.8059.79 against 155.0.8059.85;
  - screen size, time zone and hardware;
  - the path from each side to the gateway.
- **Timing.** Each arm's two rounds run at the same time, the Mac round and the Cloud Run execution started together: direct first, then Webshare. This keeps time of day and site state out of the pair, as far as one round can.

**The ladder confounder (K3).** On Webshare the bundled browser lane often failed with `net::ERR_EMPTY_RESPONSE` (`connection_error`), and the ladder stopped there before `installed_chrome`. The fix is in [Ladder stops after browser_local connection_error](https://github.com/77777R7/Octocrawl/pull/659), still open when this design was committed. If it merges before the first round, the branch is rebuilt from the merged main and this section is amended before running. Otherwise every round counts the tasks that were not verified and stopped at `browser_local` without starting `installed_chrome`. `phases.mjs` gives each task `stoppedAtBrowserLocal`, and the results report those counts beside the verified counts.

### Each round, in order

`round.sh` runs the same steps on both sides and prints JSON lines.

1. **Image and display (Cloud Run only).** It prints the Chrome, Node and Playwright versions and the key package versions, then starts Xvfb and waits for its socket.
2. **Forwarder,** when the arm has an upstream proxy. It then exports `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` for everything after it.
3. **Self-check** (`selfcheck.mjs`), item by item:
   - **Display:** the Xvfb socket and its dimensions, or the macOS window server.
   - **Grant:** its SHA and capabilities.
   - **DNS:** the 16 tasks' hosts, the echo host and the gateway host.
   - **Fonts.**
   - **Browser:** the installed Chrome found, and its version.
   - **CDP:** the same `launchInstalledChrome` the rung uses, with the same flags and the round's proxy, connected over CDP.
   - **Egress control page:** that Chrome loads `https://api.ipify.org/?format=json` through the round's proxy. It records the exit address and what Chrome reports about itself: User-Agent, language, time zone, screen, window, viewport, device pixel ratio, cores and `webdriver`.
   - **Cleanup:** how long the close takes.
4. **API.** The local API starts with the grant and the round's proxy environment. Then comes the **API's own control**: `POST /v1/scrape` of the echo page with no access option, which gives the HTTP lane's exit address.
5. **The 16 tasks.** run-set's own echo, `W2L_EGRESS_ECHO_URL=https://api.ipify.org` through the same proxy environment, is the third control. run-set records it as `exitIp`.
6. **`phases.mjs`** prints one line per task and one for the run.

A round whose controls fail (the self-check's `ok` false, or no address from a control) still runs its 16 tasks. It is marked in the results and stays in the record, and nothing is rerun to replace it.

### What each task reports

For each task:
- verified and false success, as judged by run-set;
- status and reason;
- the route, the channels tried, and the gate the rung saw;
- the detection type: Cloudflare, DataDome, both (T068), or no vendor header (T053, B008). This is K3's grouping, from the 2026-10-12 gate-signal record.
- `stoppedAtBrowserLocal`;
- the time breakdown, when the final rung was a browser.

The time breakdown comes from the final rung's trace timestamps (`at`, ms since that rung started), because the code emits a duration only for its waits:

| Phase | How it is taken |
| --- | --- |
| Earlier rungs | `ladder_channel_started.at` of the final rung |
| Cold start | `browser_engine.at − browser_start.at`: Chrome launched, debugging port open, Playwright attached |
| Before navigation | `navigate.at − browser_engine.at`: identity, robots.txt |
| Navigation | from `navigate` to the start of the challenge wait, of the region wait, or to `rendered` |
| Challenge wait | `challenge_wait.detail.ms` (installed_chrome only). The rung waits only when it saw a waitable gate and always emits the event then, so its absence on a rendered page is a measured 0. |
| Settle | from the end of the challenge wait or navigation to the start of the region wait: loading and steady waits |
| Region wait | `region_wait.detail.waitedMs` |
| Capture | `rendered.at − region_wait.at`: layout annotation and the DOM read |
| Extract | `cache_stored.at − rendered.at`: conversion, extraction and the cache write |
| Serialize | `usage.timings.serializeMs` |
| Cancel / cleanup | **not measured.** The browser close and profile deletion emit no event, so this stays null. The self-check's single close is the only cleanup timing. |
| Client total | run-set's `outcome.wallMs` around `POST /v1/scrape` |

At the round level, `round.sh` marks process or container start, Xvfb ready, forwarder ready, self-check done, API listening, controls done and run done. On Cloud Run the execution's own create, start and completion times come from `gcloud run jobs executions describe`.

### Cost estimate (before any spending)

List prices fetched 2026-10-21. `asia-southeast1` is Cloud Run's Tier 2. Its figures were read from the pricing pages' embedded data, not from a table rendered for Singapore.

| Item | Basis | Estimate |
| --- | --- | --- |
| Cloud Build | e2-highcpu-8, $0.0156/min (global default pool; the Singapore private-pool figure is $0.01872). The free 2,500 minutes cover only e2-standard-2. About 15 min a build, at most 2 builds. | $0.25–$0.56 |
| Cloud Run job | 4 vCPU × $0.0000216 + 8 GiB × $0.0000024 = $0.0001056/s, about $0.38 per hour, with a minimum of 1 minute. Two executions of about 6–20 min each, plus at most one more if one fails to start. The free tier is a spending discount at Tier 1 rates and may cover part of it; it is not counted. | $0.08–$0.40 |
| Artifact Registry | About 3–4 GB for a few hours at $0.10/GiB-month. The repository is already above the free 0.5 GB. | < $0.01 |
| Secret Manager | One version for a few hours, a handful of accesses | < $0.01 |
| Cloud Logging | A few MB, inside the 50 GiB free | $0 |
| Webshare bandwidth | Not metered per run here | **unknown** |
| **Total, known items** | | **about $0.35–$1.00**, well under $10 |

The record will give the measured build minutes and execution durations at these rates. Billing for the day is not read back, so the billed amount stays unknown.

### Not measured

- More than one round per arm per side.
- Load curves, concurrency above one, and other CPU or memory sizes.
- Another region.
- Cloud Run through a data-centre proxy like Clash.
- Cleanup time per task.
- Queueing under load.
