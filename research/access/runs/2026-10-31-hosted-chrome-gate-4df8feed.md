# hosted_chrome gate runs on tag h45regex, 2026-10-31

The day's gate runs (ADR 0005, decision eight, revision of 2026-10-30) and the same-day baselines they are paired with. This record lists what the runs showed.

**Decision (Howard, 2026-10-31, in chat).** The baseline for each gate run is the baseline window that overlapped it in time: w4 for run 1 and w5 for run 2. Measured that way, both runs meet the gate: run 1 verified 5, against w4's 4, and run 2 verified 6, against w5's 6; every run and baseline had 0 false successes. Howard counts the gate as passed. The comparison against the morning baseline w3 (below) stays in the record and is not used.

- Build: one release build, source commit `4df8feed`. API revision `octocrawl-api-regex-4df8fee` (tag h45regex, created 2026-10-30T07:48:12Z); `octocrawl-chrome-c4-4df8fee` (created 2026-10-30T07:46:42Z, 100 % of its traffic). Neither was redeployed during the day; checked with `gcloud run services describe` and `gcloud run revisions list` after the last run.
- Gate runs: `research/access/run-set.mjs` against `https://h45regex---octocrawl-api-c7fpmz73tq-as.a.run.app`, with the allowlisted account's key, `--access '"enhanced"'`, task contracts on, `--client-timeout-ms 330000`, `--save-responses`. Proxied from Howard's Mac (HTTPS_PROXY=http://127.0.0.1:7890). The command and timings are in each run's record.
- Baselines: the H2b harness's datacenter arm on Cloud Run (`research/access/h2b-egress/cloud.sh`), using the `4df8feed` image. Each baseline ran `H2B_DC=1 H2B_ONLY=dc H2B_DC_START=<start> H2B_TASKS=<challenge16> cloud.sh window <n> T049+B008`. The robots.txt verdict for each window came from that window's own `cloud.sh robots <n>`, and each one disallowed T049 and B008. Raw logs and reports are kept under `.w2l/access/h2b/w3`, `w4` and `w5` (git-ignored).

## Runs, in order

| UTC | Run | Record or execution | Verified | False success | hosted_chrome started | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00:05:55–00:07:46 | gate run 1, first attempt | [a1](2026-10-31-hosted-chrome-gate-a1-4df8feed.md) | 4 / 16 | 0 | 5 | the account's credits ran out (see below) |
| 00:07:37–00:11:41 | baseline window 3, dc list start 0 | `octocrawl-h2b-dc-gcvbd` | 7 / 16 | 0 | 14 reached Chrome | |
| 00:09:32–00:12:07 | local, same tasks (check (b)) | [local with grant](2026-10-31-hosted-chrome-check-b-local-grant-4df8feed.md) | 11 / 16 | 0 | (local) | an [earlier try](2026-10-31-hosted-chrome-check-b-local-4df8feed.md) had no grant: 16 × `unsupported_parameter` |
| 02:48:38–02:52:35 | gate run 1, rerun | [a1 rerun](2026-10-31-hosted-chrome-gate-a1-rerun-4df8feed.md) | 5 / 16 | 0 | 14 | after the credits were topped up |
| 02:48:28–02:52:41 | baseline window 4, dc list start 25 | `octocrawl-h2b-dc-wqnqr` | 4 / 16 | 0 | 14 reached Chrome | started at the same time as the a1 rerun |
| 03:38:03–03:39:18 | gate run 2, first attempt | [a2](2026-10-31-hosted-chrome-gate-a2-4df8feed.md) | 0 / 16 | 0 | 1 | 13 tasks skipped hosted_chrome: `daily_attempts` |
| 03:38:05–03:41:55 | baseline window 5, dc list start 75 | `octocrawl-h2b-dc-lms52` | 6 / 16 | 0 | 14 reached Chrome | |
| 03:39:51–03:43:13 | gate run 2, rerun | [a2 rerun](2026-10-31-hosted-chrome-gate-a2-rerun-4df8feed.md) | 6 / 16 | 0 | 14 | after the account's attempt counter for the day was reset |

In every hosted run, the product's verification agreed with the runner's on 16 of 16 tasks. All of the hosted runs' verified answers came from hosted_chrome.

## Verified, by task

| Task | a1 (credits out) | w3 | a1 rerun | w4 | a2 rerun | w5 | local |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T001 | | | | | | | ✓ |
| T002 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T005 | ✓ | ✓ | | | ✓ | ✓ | ✓ |
| T034 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| T038 | ✓ | ✓ | ✓ | | | | |
| T045 | | | | | | | |
| T046 | | ✓ | ✓ | | ✓ | ✓ | |
| T047 | | | | | | | ✓ |
| T048 | | | | | | | ✓ |
| T049 | robots | robots | robots | robots | robots | robots | ✓ |
| T053 | | | | | | | |
| T068 | | | | | | | |
| T071 | | | | | | | ✓ |
| T076 | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| B001 | | ✓ | | ✓ | ✓ | ✓ | ✓ |
| B008 | robots | robots | robots | robots | robots | robots | ✓ |
| **Total** | 4 | 7 | 5 | 4 | 6 | 6 | 11 |

In the a2 rerun and in w5, the same six tasks were verified. Local mode reads T049 and B008, because the user named those URLs (ADR 0005); hosted mode obeys robots.txt and refuses them.

In every baseline window, the exit refused the Cloudflare check host `brunhild.challenges.cloudflare.com` for some tasks (`502 target_connect_resolve_failed`): T047, T048, T068 and T071 in w3, and T001, T047 and T071 in both w4 and w5. These lists come from the windows' reports and from the task lines in their logs. This is the name-resolution difference that the revision of 2026-10-30 lists. Hosted runs do not go through that refusal: in hosted, those tasks ended at the check itself (`captcha`, `cloudflare_challenge` or `bot_detected_generic`).

## What changed on the account between attempts

Both changes were made on Howard's instruction in chat on 2026-10-31: the test account's credits and quotas are ours to change, and the gate should not wait for a reset. Both are Firestore writes to the allowlisted account (the uid behind its enabled `parity-board` key). Neither changed the `hostedConfig/hostedChrome` switch: `enabled`, `monthlyCapUsd` 20 and `dailyAttemptsPerAccount` 20 are the same for every run.

1. **Credits, before the a1 rerun.** In the first attempt, the account reached `credits/{uid}` grant 0 and purchased 3 at 00:07:45Z. That is less than one browser page (5 credits), so the API read the remaining tasks over HTTP alone. Their logs show `ladder_channels_filtered` (`fastMode`), and hosted_chrome did not start for 9 of the 14 tasks that need it. At 02:47:00Z, purchased was raised by 2,000 with a Firestore increment, the same method the H1 acceptance used on 2026-10-20. Purchased then went 2,003 → 1,978 after the a1 rerun (5 browser pages) → 1,948 after the a2 rerun (6 browser pages).
2. **Attempts, before the a2 rerun.** `hostedQuotas/2026-10-31-hostedChrome-{uid}` stood at 20 after the a2 attempt: 5 from a1, 14 from the a1 rerun and 1 from a2. The next 13 tasks were then refused with `daily_attempts`. At 03:39:47Z its `count` was set to 0.

## Departures from the revision of 2026-10-30

- **The rule on reruns is not written.** The revision says how a gate run is rerun after it fails is "另行决定" (to be decided separately). Both runs were rerun the same day. Each first attempt failed for an account limit, not because of what the rung read. The first attempts are kept above and count in nothing else.
- **Not one hosted_chrome run per day.** The revision asks that the account make no other hosted_chrome reads on a gate day, because one run uses up to 14 of its 20 attempts. On this day both gate runs, both first attempts, and the attempt counter reset happened.
- **Three same-day baselines.** The revision says the baseline is re-measured on the gate's day. It does not say which baseline counts when there is more than one.
  - w4 started with the a1 rerun (02:48:28 and 02:48:38).
  - w5 started with the failed a2 attempt (03:38:05). The a2 rerun began 1 min 46 s later and overlapped w5 until w5 ended at 03:41:55.
  - w3 was started at 00:07:37, while the first a1 attempt was finishing (it ended at 00:07:46). Its first task began at 00:08:12.

| Gate run | Verified / false | Baseline that overlapped it | Verified / false | Against w3 (7 / 0) |
| --- | --- | --- | --- | --- |
| 1 (a1 rerun) | 5 / 0 | w4 | 4 / 0 | 5 < 7 |
| 2 (a2 rerun) | 6 / 0 | w5 | 6 / 0 | 6 < 7 |

Each baseline also varies between windows: on the same tasks, the same build and the same egress list, w3, w4 and w5 gave 7, 4 and 6.

## Differences the revision lists, as they stood in these runs

- **WebRTC preference.** hosted_chrome launches with `nodriver-0.50.6-no-allow-origins+webrtc-proxied-udp-only`, and the harness with `nodriver-0.50.6-no-allow-origins`. This is the difference the gate measures.
- **Service path.** In hosted runs, the API's ladder calls the service; in the harness, run-set calls a local API inside the same job.
- **Proxy per read.** In hosted runs, the service picks the proxy. In the harness, it is taken from the shuffled list at the window's start position (0, 25, 75).
- **Name resolution.** Hosted resolves names on Cloud Run. The harness leaves it to the Webshare proxy, which refused the Cloudflare check host for three or four tasks in every window (above).
- **Client timeout.** 330 s for the gate runs. The harness uses run-set's default (the task's `timeoutMs`, else 180 s).
- **Node.** Hosted runs Node 22.23.4; the harness image runs 26.8.1. The gate runs' client ran on Node 26.8.1 on Howard's Mac.
- **Network.** The gate runs were proxied from Howard's Mac to the API. The harness ran on Cloud Run's own egress to the Webshare list.

## Check (b): local against hosted on the same pages

The local API ran from `4df8feed` with an access grant that names installed_chrome only (`W2L_ACCESS_GRANT`), proxied. It verified 11 of 16 tasks, with 0 false successes and 0 paid calls.

The check compares verification results only for tasks whose Markdown has the same hash (`evidenceRecord.outputSha256.markdown`) in a hosted run and in the local run. The saved responses were checked against each of the first a1 attempt, the a1 rerun and the a2 rerun. In none of the three pairs did any task have the same hash, so nothing was compared.

The cause was not isolated. Many tasks were read differently on the two sides. For example, in the first a1 attempt, T047 was blocked over HTTP, while the local run read the page. For the tasks both sides read, why the hashes differ was not checked.

On each side, the product's verification agreed with the runner's on all 16 tasks.

## Not measured

- The H2b reports include the harness's dollar cost (the Chrome rung: $0.0090 in w3, $0.0078 in w4 and $0.0080 in w5). In the gate runs, the spend ledger recorded $0.0000 for hosted_chrome's paid calls, which name a Webshare exit. Why it recorded 0 rather than unknown was not checked, so these runs give no measured hosted_chrome cost.
- Why the baselines differ by up to 3 tasks between windows was not isolated.
