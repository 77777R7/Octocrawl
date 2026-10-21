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

**Code.** Branch `claude/pa-g4-cloudrun`, cut from main `ab2d9bad` and rebased onto main `22c9e1ca` before any run (see the amendment below), with this design and `research/access/g4-cloudrun/`. Product code (`packages/`) is main's. The Mac and the job run the same commit, the one this design is committed in. Both sides record it through run-set's `environment.commit`, and both must show `dirty: false`.

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

**Amendment, before any run (2026-10-21).** The fix ([#659](https://github.com/77777R7/Octocrawl/pull/659)) merged as main `22c9e1ca` at 09:54:49 UTC. That was while the first image (`172b5fa6`, built from `ab2d9bad` plus this design) was building. No job had been created and no round had run. So:
- the branch is rebased onto `22c9e1ca`, and this record is renamed after it;
- the image is rebuilt from the rebased commit, and that image is the one measured;
- the job is pointed at the new digest.

The `172b5fa6` image is never executed, and it is deleted with the rest. `stoppedAtBrowserLocal` is still counted: after the fix it should be 0. Any task that still stops there is reported.

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

## Run (2026-10-21, after the design)

### What ran

- **Commit measured:** `6de7c370`, the design plus its amendment on main `22c9e1ca`. Both sides ran it.
  - run-set prints `6de7c370` on the Mac and `6de7c37` in the container; git in the image abbreviates one character shorter.
  - In the container run-set reports `dirty: true`. `build.sh` overwrites three tracked files in the build context: `Dockerfile` (with this directory's), `.dockerignore` and `.gcloudignore`. A clone with the same three changes shows exactly ` M .dockerignore`, ` M .gcloudignore`, ` M Dockerfile` and nothing under `research/access`. This was reproduced locally, not read from inside the container. Product code and these scripts are as committed.
- **Image measured:** `asia-southeast1-docker.pkg.dev/octopus-w2l-20260924-7r7/w2l-public-preview/octocrawl-g4-20261021@sha256:2e32005bdddec8dc33c633e0484be0501cca80ed9a5ca9f64e8e35d29bf477e0` (tag `6de7c370`).
  - It was built by Cloud Build `571bb870-6156-420d-9f0b-06fb7c0b6c3b`: e2-highcpu-8, 10:00:14–10:04:26 UTC.
  - Every Cloud Run round printed the image's own record: Chrome 155.0.8059.79, Node v26.8.1, Playwright 1.62.1, xvfb 2:21.1.7-3+deb12u13, tini 0.19.0-1+b3, fonts-liberation 1:1.07.4-11, fonts-noto-cjk 1:20220127+repack1-1, fontconfig 2.14.1-4, libc6 2.36-9+deb12u14, libnss3 2:3.87.1-1+deb12u4.
  - The first image, `@sha256:5108a24b…` (tag `172b5fa6`, build `70ac6e08-…`), was built before the ladder fix merged. It was never executed (see the amendment above).
- **Job command.** The image's `CMD` names `entry.sh`, a name from an earlier draft; the script is `round.sh`.
  - The first execution, `octocrawl-g4-20261021-bgg4g` (10:05:08–10:05:24 UTC), failed with `bash: research/access/g4-cloudrun/entry.sh: No such file or directory`, exit 127. No task ran in it.
  - The job was then given the command explicitly: `gcloud run jobs update … --command=/usr/bin/tini --args=-g,--,bash,research/access/g4-cloudrun/round.sh`. This is the image's own entrypoint followed by the right script. The image was not rebuilt, so the digest above is what ran.
  - The Dockerfile's `CMD` is corrected in the commit that adds these results.
- **Job setup:** `octocrawl-g4-20261021`, created with:

  ```
  gcloud run jobs create octocrawl-g4-20261021 --project=octopus-w2l-20260924-7r7 --region asia-southeast1 --image <digest above> --execution-environment gen2 --cpu 4 --memory 8Gi --tasks 1 --max-retries 0 --task-timeout 3600s --service-account 307354954747-compute@developer.gserviceaccount.com --labels purpose=g4-temp --set-env-vars G4_WHERE=cloud,G4_ARM=direct,G4_GRANT_B64=<the grant file, base64>
  ```

  - The arm was switched with `gcloud run jobs update --update-env-vars G4_ARM=…`.
  - For the Webshare executions it added `--set-secrets UPSTREAM_PROXY=octocrawl-g4-20261021-proxy:1`, and for the second direct execution it removed that secret again (`--remove-secrets UPSTREAM_PROXY`).
  - Executions were started with `gcloud run jobs execute octocrawl-g4-20261021 --project=… --region asia-southeast1 --async`.
  - Logs were read with `gcloud logging read 'resource.type="cloud_run_job" AND labels."run.googleapis.com/execution_name"="<execution>"'`.
- **Secret:** made from the `RESIDENTIAL_PROXY` value through stdin (`gcloud secrets create octocrawl-g4-20261021-proxy --data-file=-`). It was readable only by the job's service account, through an IAM binding on the secret itself.
- **Mac side:** `bash research/access/g4-cloudrun/local.sh direct`, and `G4_WEBSHARE_IP=23.81.42.155 bash research/access/g4-cloudrun/local.sh webshare`.
  - The gateway address came from Google DNS-over-HTTPS through Clash on the day. It belongs to Webshare's `ap-northeast-1` entry pool and is the address K3 used.
  - The API ran on 8797 and the forwarder on 8796. Both were stopped by the script, and the Mac's Chrome was 155.0.8059.85 in every round.

### A stale build on the first two Mac rounds (kept, not counted as the pair)

The local API runs `packages/api/src/cli.ts` under tsx, but it loads the other workspace packages (`@w2l/bench` among them) from their compiled `dist/`.
- In this worktree those `dist/` files were last built between 2026-10-20 11:37 and 2026-10-21 02:11 (+08:00), before `ab2d9bad`. `packages/bench/dist/routing/ladder.js` did not contain #659's change.
- So the first Mac round of each arm ran older engine code than the commit run-set named. run-set's `dirty` check cannot see this, because `dist/` is git-ignored. Which commit the old build came from is not known.
- This was found after both rounds. The container builds `dist/` itself (`npx tsc --build`), so the cloud rounds are not affected.
- Response: `npx tsc --build` in the worktree at 10:27 UTC, after which `ladder.js` contains the fix. Then one more Mac round per arm, each again started together with one more Cloud Run execution. This keeps the time pairing, and it is a second cloud round the design did not plan; both cloud rounds are reported.
- The two stale Mac rounds stay in this record, marked, and are not used in the pairs.

### Rounds

| Round | Where | Code | Started (run-set, UTC) | Exit addresses: Chrome control / API control / run-set echo | Controls |
| --- | --- | --- | --- | --- | --- |
| direct L0 | Mac, Clash | **stale `dist/`** | 10:04:56 | 103.142.140.157, all three | all passed |
| direct C1 | Cloud Run `octocrawl-g4-20261021-9t8rs` | image | 10:06:33 | 34.96.48.74, all three | all passed |
| webshare L0 | Mac, gateway 23.81.42.155 | **stale `dist/`** | 10:12:34 | 67.191.219.128 / 75.58.52.137 / 71.225.87.108 | all passed |
| webshare C1 | Cloud Run `-tcnss` | image | 10:12:50 | 174.189.24.252 / 98.56.156.95 / 108.48.0.116 | all passed |
| direct L1 | Mac, Clash | rebuilt | 10:28:01 | 103.142.140.59, all three | all passed |
| direct C2 | Cloud Run `-wlkcd` | image | 10:28:33 | 34.34.254.164, all three | all passed |
| webshare L1 | Mac, gateway 23.81.42.155 | rebuilt | 10:34:30 | 47.205.47.86 / 73.205.65.70 / 216.122.8.237 | all passed |
| webshare C2 | Cloud Run `-smcbq` | image | 10:35:02 | 98.162.84.27 / 70.181.241.196 / 35.146.210.228 | all passed |

- Not a round: execution `-bgg4g`, which failed before any step (the `CMD` above).
- In every round every self-check item passed: display, grant SHA `09fdeafe…`, DNS for the 16 tasks' 15 hosts, fonts, browser, CDP and the egress control page. Every API control and run-set echo returned an address.
- On Cloud Run, `p.webshare.io` resolved to other entries than the Mac's: 89.187.161.115, 173.234.67.227 and 72.46.86.5 in C1; 23.81.44.13, 180.149.230.245 and 72.46.86.41 in C2.
- On Webshare, the three controls show three different exits, because the gateway rotates per connection.
- What Chrome reported about itself:
  - **Mac:** en-US, Asia/Shanghai, screen 1512×982×30, window 1200×828, devicePixelRatio 2, 15 cores, 32 GB device memory.
  - **Cloud Run:** en-US, UTC, screen 1920×1080×24, window 945×1060. Chrome chose this window on the Xvfb screen, as nothing sets it.
  - **Both:** `webdriver` false.

### Results by task

✓ marks a verified task, with the rung that answered. ✗ marks a failure, with the status reason. "gated 19 s" means the installed Chrome waited the full 19 s and the page was still a challenge. "cleared n s" means the challenge cleared after n seconds.

| Task | Detection | direct L1 (Clash) | direct C1 | direct C2 | webshare L1 | webshare C1 | webshare C2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | Cloudflare | ✗ captcha | ✗ captcha | ✗ captcha | ✗ timeout at browser_local | ✓ installed_chrome (cleared 18 s) | ✓ installed_chrome (cleared 8 s) |
| T002 | Cloudflare | ✓ installed_chrome | ✗ gated 19 s | ✗ gated 19 s | ✓ browser_local | ✓ http | ✓ http |
| T005 | DataDome | ✓ installed_chrome | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ browser_local | ✓ browser_local |
| T034 | DataDome | ✓ browser_local | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ browser_local | ✓ browser_local |
| T038 | DataDome | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✗ gated 19 s | ✗ gated 19 s |
| T045 | DataDome | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✗ gated 19 s | ✗ gated 19 s |
| T046 | DataDome | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ installed_chrome (cleared 9 s) | ✓ installed_chrome (cleared 14 s) |
| T047 | Cloudflare | ✓ installed_chrome | ✗ gated 19 s | ✗ gated 19 s | ✓ installed_chrome (cleared 15 s) | ✗ gated 19 s | ✗ gated 19 s |
| T048 | Cloudflare | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s |
| T049 | DataDome | ✓ installed_chrome | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s |
| T053 | no vendor header | ✓ installed_chrome | ✗ 403 | ✗ 403 | ✗ timeout at browser_local | ✗ 403 | ✗ 403 |
| T068 | Cloudflare + DataDome | ✗ gated 19 s | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ browser_local | ✗ gated 19 s |
| T071 | Cloudflare | ✓ installed_chrome | ✗ gated 19 s | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✗ gated 19 s | ✗ gated 19 s |
| T076 | Cloudflare | ✓ installed_chrome | ✓ installed_chrome (cleared 1 s) | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ installed_chrome (cleared 20 s) | ✓ installed_chrome (cleared 6 s) |
| B001 | Cloudflare | ✓ installed_chrome | ✓ installed_chrome | ✗ gated 19 s | ✗ connection_error (installed_chrome) | ✓ installed_chrome | ✓ installed_chrome |
| B008 | no vendor header | ✓ installed_chrome | ✓ installed_chrome | ✓ installed_chrome | ✗ connection_error (installed_chrome) | ✓ installed_chrome | ✓ installed_chrome |
| **Verified** | | **10** | **3** | **1** | **2** | **9** | **8** |

By detection type (verified / tasks; T068 is its own group, so the groups add up to 16):

| Group | direct L1 | direct C1 | direct C2 | webshare L1 | webshare C1 | webshare C2 | stale direct L0 | stale webshare L0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cloudflare (7) | 5 | 2 | 0 | 2 | 4 | 4 | 5 | 1 |
| DataDome (6) | 3 | 0 | 0 | 0 | 3 | 3 | 3 | 0 |
| Both (T068) | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| No vendor header (2) | 2 | 1 | 1 | 0 | 1 | 1 | 2 | 0 |
| **All 16** | **10** | **3** | **1** | **2** | **9** | **8** | **10** | **1** |

Other counts:
- **False success:** 0 in all eight rounds.
- **No API answer:** 0 in every round except stale webshare L0, which had 2: T049 and T068, at run-set's 180 s timeout.
- **Stopped at `browser_local`** (not verified, and `installed_chrome` never started):
  - 0 in every Cloud Run round and in direct L1;
  - 2 in webshare L1, T001 and T053. Both are `timeout`s, which #659 does not cover because it handles only `connection_error`.
  - 8 in stale webshare L0, which ran without #659.
- **Stale direct L0** has the same result as direct L1 on every task.
- **Stale webshare L0** verified T002 only (via http). Its other failures were:
  - network errors and timeouts in `browser_local` and `installed_chrome`;
  - one `tls_error` on http;
  - one challenge that never cleared (T048);
  - the two missing answers.

**What failed on webshare L1.** Ten of its 14 failures are network failures inside the installed Chrome: 9 `net::ERR_EMPTY_RESPONSE` and 1 `net::ERR_CONNECTION_CLOSED`.
- The ladder now reaches `installed_chrome`, which is #659 working, and the installed Chrome then fails to connect through the gateway the same way the bundled browser did.
- Two more are browser_local timeouts, and two are challenges that never cleared (T048, T049).
- All three controls passed in this round. As in K3, a working echo page did not predict the sites' connections.

### Time breakdown

Values are p50 / p95 in ms, nearest rank, over the tasks where the phase exists (n in brackets). The phases come from the final rung's trace (see the design). Cleanup per task is not measured.

| Phase | direct L1 | direct C1 | direct C2 | webshare L1 | webshare C1 | webshare C2 |
| --- | --- | --- | --- | --- | --- | --- |
| Earlier rungs | 2411 / 13562 (16) | 1411 / 12331 (16) | 1226 / 12176 (16) | 15322 / 159514 (16) | 11723 / 23459 (16) | 11496 / 27626 (16) |
| Cold start (Chrome launch + CDP) | 272 / 291 (15) | 560 / 1322 (16) | 406 / 456 (16) | 343 / 359 (13) | 468 / 1013 (12) | 463 / 652 (13) |
| Before navigation | 521 / 837 | 269 / 578 | 242 / 547 | 4511 / 5017 | 2428 / 4917 | 2318 / 5022 |
| Navigation | 1165 / 3631 (15) | 752 / 2161 (16) | 642 / 1154 (16) | 4690 / 6944 (3) | 4561 / 7408 (12) | 5309 / 11386 (13) |
| Challenge wait | 4313 / 19096 (15) | 19065 / 19247 (16) | 19057 / 19094 (16) | 19089 / 19103 (3) | 19058 / 19867 (12) | 19059 / 19534 (13) |
| Settle | 683 / 1543 (9) | 0 / 1207 (3) | 0 (1) | 620 (1) | 520 / 524 (5) | 516 / 543 (5) |
| Region wait | 698 / 2775 (9) | 1405 / 6817 (3) | 8406 (1) | 817 (1) | 4490 / 7269 (5) | 4205 / 8724 (5) |
| Capture | 103 / 2008 (9) | 231 / 4834 (3) | 2135 (1) | 298 (1) | 374 / 1632 (5) | 317 / 1528 (5) |
| Extract (+ cache write) | 166 / 705 (9) | 673 / 2664 (3) | 2391 (1) | 366 (1) | 735 / 1145 (5) | 573 / 1025 (5) |
| Serialize | 0.02 / 0.04 | 0.06 / 0.14 | 0.06 / 0.12 | 0.03 / 0.03 | 0.08 / 0.14 | 0.06 / 0.13 |
| Cancel / cleanup | not measured | not measured | not measured | not measured | not measured | not measured |
| Client total | 10612 / 25988 | 22211 / 29291 | 21622 / 26980 | 30052 / 165031 | 36976 / 49151 | 34893 / 50107 |

Round level, in ms since the script started:
- **Xvfb ready:** 234–401.
- **Self-check done:** 8238–12222 on Cloud Run, 5150–7716 on the Mac.
- **API listening:** 12812–17336 on Cloud Run, 5694–8267 on the Mac.
- **Self-check Chrome launch:** the first Chrome start in a fresh container took 2786–3702 ms over CDP, against 350–680 ms on the Mac. Later launches in the same container took 406–560 ms (p50).
- **Self-check close:** 23–233 ms on Cloud Run, 17–29 ms on the Mac. This is the only cleanup timing.
- **Execution create → start:** 22.9 s for `-bgg4g` (the first pull of the image), 2.5 s for `-9t8rs`, 3.6 s for `-tcnss`, 5.4 s for `-wlkcd`, 3.1 s for `-smcbq`. These were read from the executions' audit-log entries.
- **Execution run time** (start → completion): 342, 568, 356 and 586 s. The failed one took 16 s.

### Cost

| Item | Measured basis | At list price |
| --- | --- | --- |
| Cloud Build | 2 builds on e2-highcpu-8, 252.8 s + 246.1 s = 8.31 min | $0.13 at $0.0156/min ($0.16 at the Singapore private-pool rate) |
| Cloud Run job | 5 executions: 16 s (billed as the 1-minute minimum), 342, 568, 356 and 586 s; 1,912 s in all at 4 vCPU and 8 GiB, $0.0001056/s | $0.20 |
| Artifact Registry | 2 images for about 50 min. Their size was not read back. Under 5 GB each it would be under $0.002. | < $0.01 (size unknown) |
| Secret Manager | 1 version for about 45 min, a few accesses | < $0.01 |
| Cloud Storage | 2 build source archives of 30 MB each, deleted after about 55 min | < $0.01 |
| Cloud Logging | a few hundred lines | $0 (free allotment) |
| Webshare bandwidth | not metered per run | **unknown** |
| **Known items** | | **about $0.33–$0.36**, against the $10 cap |

The billed amount was not read back from billing, so it is unknown. The Cloud Run free tier may cover some or all of the job seconds; it is not subtracted.

### Compared with 2026-10-14

p50 / p95 are run-set's own (`summary.totals.cold`), the figures 10-14 reported. The time-breakdown table above uses nearest rank, so its client totals differ slightly.

| | 10-14 (one job round per arm) | 10-21 C1 | 10-21 C2 |
| --- | --- | --- | --- |
| Cloud Run, own egress | 2/16 (T049, B008); p50 / p95 21769 / 28310 ms | 3/16 (T076, B001, B008); 22354 / 29291 | 1/16 (B008); 21687 / 26980 |
| Cloud Run, Webshare | 7/16 (T002, T005, T034, T038, T046, T076, B001); 38906 / 62990 | 9/16; 37627 / 49151 | 8/16; 36821 / 50107 |

- **Webshare.** The six tasks verified in all three Webshare jobs are T002, T005, T034, T046, T076 and B001. 10-14 also verified T038, which failed in both rounds today. Today's rounds both verified T001 and B008, which 10-14 failed.
- **Own egress.** B008 is the only task verified in all three own-egress jobs.
- **Differences from 10-14:**
  - 10-14 ran Node 22 and Chrome stable by tag (155.0.8059.79, the same build as today), and the code was `ee53419e`.
  - Today the ladder includes #659, and the gate and challenge-wait fixes made after 10-14.
  - The exits differ: Google assigns its egress address per execution, and the Webshare pool rotates.

### What this shows

- **The fixed runtime starts and runs as designed on Cloud Run.**
  - Across the four cloud rounds, every self-check item passed: Xvfb, CDP, Chrome, DNS and the control page.
  - Every task that reached the rung launched headed Chrome 155.0.8059.79 under Xvfb as the non-root user, with no launch error and no `browser_unavailable`.
  - The Cloud Run rounds had no false success and no missing answers.
  - `tini` and the SIGTERM trap were in place, but no execution was terminated, so the shutdown path was not exercised.
- **On Cloud Run's own egress the route gets through almost nothing: 3/16 and 1/16.**
  - That is in line with 10-14's 2/16. In 11 of C1's 13 failures and 13 of C2's 15, the installed Chrome waited the full 19 s and the page was still a challenge. T001 (captcha) and T053 (403) were refused without a wait in both rounds.
  - On the same 16 tasks at the same time, the Mac through Clash verified 10/16, twice with the same per-task result (one of those on the stale build).
  - Those are two different exits as well as two runtimes, so the gap cannot be divided between exit and runtime from this data.
- **Through Webshare, Cloud Run verified 9/16 and 8/16.**
  - That is at or above 10-14's 7/16, by one or two tasks. One round against two cannot separate that from run-to-run variance.
  - Of the verified tasks, 5 per round came from `installed_chrome` and the rest from earlier rungs: http once, the bundled browser 2–3 times.
  - So the Cloud Run Webshare number is not all `installed_chrome`'s, as the plan's §四.3 also noted for 10-14.
- **The Mac half of the Webshare pair did not measure the runtime.**
  - Ten of its 16 tasks failed on network errors inside the installed Chrome (`ERR_EMPTY_RESPONSE` and `ERR_CONNECTION_CLOSED`), through the gateway entry 23.81.42.155. The bundled browser failed the same way in the stale round.
  - The echo page loaded through that same entry, so this data does not show which segment failed: Mac to entry, or entry to site.
  - Cloud Run reached the gateway through other entries. Its rounds print only each task's final status, so whether its earlier rungs met the same errors is unknown. Its `installed_chrome` rung did reach the sites and saw their pages.
  - So the Webshare difference (2 against 8–9) is not evidence that the Cloud Run runtime does better than the Mac's: the Mac's tasks mostly never reached a page.
  - The pairing meant to isolate Xvfb from the exit did not achieve a common exit in practice. Its question stays open.
- **Time.**
  - On Cloud Run a failing task spends its time in the challenge wait: p50 19 s on every own-egress task.
  - Through Webshare, navigation and the earlier rungs add several seconds: navigation p50 4.6–5.3 s against 0.6–0.8 s on own egress.
  - Chrome's cold start is under 0.6 s p50 per task once the container is warm. The first Chrome in a fresh container takes about 3 s.
  - Extraction and serialization are small next to the waits.

### Confounders and deviations

1. **The first Mac round of each arm ran a stale `dist/` build.** It is kept and marked, and it is not used in the pairs. The second Mac round per arm and a second Cloud Run execution per arm were added; the design planned one each.
2. **The direct arm's exits differ:** Clash's data-centre exit on the Mac, Google's on Cloud Run (34.96.48.74 and 34.34.254.164).
3. **The Webshare arm shares the gateway and the pool, but not the path to it.** The Mac reached the `ap-northeast-1` entry 23.81.42.155 from its own line (its DNS forges the name). Cloud Run reached the entries Google's resolver gave it. The Mac's tasks failed at the connection level through its entry, on a segment this data does not locate.
4. **Chrome 155.0.8059.79 on Linux against 155.0.8059.85 on macOS.** Also screen, window, time zone (UTC against Asia/Shanghai), pixel ratio and hardware, as listed under Rounds. None of these was set by flags; ADR 0005's measured set was unchanged on both sides.
5. **The first execution failed on the image's `CMD`.** The job's command override ran the image's own tini entrypoint with the right script.
6. **`dirty: true` in the container** comes from the three build-context files, as reproduced above.
7. **One valid round per arm on the Mac and two on Cloud Run.** Differences of one to three tasks are within the run-to-run variance seen before: 10-14 local 11 and 7, K3's rounds.

### Not shown

- Whether Cloud Run's runtime would match the Mac on a truly shared exit. Today's Webshare pair failed on the Mac's path to the gateway.
- More rounds, load curves, concurrency above one, other CPU or memory sizes, another region.
- Cleanup time per task.
- The shutdown path under a real SIGTERM.
- The billed cost and Webshare's bandwidth.

Nothing here is a recommendation to open `installed_chrome` to hosting. That is K4's and the hosted plan's (H5) decision, and ADR 0005 keeps the route local until then.

### Raw data

These stay out of the repository, under `~/Code/w2l/.w2l/access/archive/2026-10-21/g4/`:
- `runs/`: the four Mac run directories with responses;
- `logs/`: every round's JSON lines, the two build logs and the cleanup log.

The Cloud Run rounds' run directories stayed in their containers. Their per-task lines are in `logs/cloud-*.log`. No credentials are in any of these files: they were searched for the gateway login and `Proxy-Authorization`.

### Cleanup (2026-10-21, after the last round)

```
gcloud run jobs delete octocrawl-g4-20261021 --project=octopus-w2l-20260924-7r7 --region asia-southeast1 --quiet
  → Deleted job [octocrawl-g4-20261021].
gcloud artifacts docker images delete …/octocrawl-g4-20261021@sha256:2e32005bdddec8dc33c633e0484be0501cca80ed9a5ca9f64e8e35d29bf477e0 --project=… --delete-tags --quiet
  → Digests: …@sha256:2e32005b…  Tags: …:6de7c370  Delete request issued. … done.
gcloud artifacts docker images delete …/octocrawl-g4-20261021@sha256:5108a24b88cfae18e3d202ca67c973c8c843bcbe44655b46ac72149199c63f0d --project=… --delete-tags --quiet
  → Digests: …@sha256:5108a24b…  Tags: …:172b5fa6  Delete request issued. … done.
gcloud secrets delete octocrawl-g4-20261021-proxy --project=octopus-w2l-20260924-7r7 --quiet
  → Deleted secret [octocrawl-g4-20261021-proxy].
gsutil rm gs://octopus-w2l-20260924-7r7_cloudbuild/source/1792576756.525274-46d1a14500204b26ad3f45a14d448848.tgz gs://octopus-w2l-20260924-7r7_cloudbuild/source/1792576404.257514-62dd4e4f8d5448b6b382e953451bdca2.tgz
  → Operation completed over 2 objects.
```

Confirmed afterwards with `gcloud run jobs list`, `gcloud secrets list`, `gcloud artifacts docker images list …/w2l-public-preview` and `gsutil ls …/source/`:
- No `octocrawl-g4-20261021` job, secret or image is left, and neither source archive is.
- The 10-14 job `octocrawl-ic-xvfb`, its secret `octocrawl-residential-proxy` and its images were not touched. Neither were the services `octocrawl-api`, `octocrawl-jobs` and `w2l-public-preview`; their ready revisions were unchanged: `octocrawl-api-credits-3354110`, `octocrawl-jobs-w9-dd21862`, `w2l-public-preview-credits-3354110f`.
- The repository `w2l-public-preview` was kept.
