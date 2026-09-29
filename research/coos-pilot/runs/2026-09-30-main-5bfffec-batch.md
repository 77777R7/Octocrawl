# Seed-user sources: batch run on main at 5bfffec, 2026-09-30

Command: `W2L_API_URL=http://127.0.0.1:8930 node research/coos-pilot/run-baseline.mjs` against `W2L_CONTACT=<W2L_CONTACT> W2L_TASK_ROOT=.w2l/api-batch node --import tsx packages/api/src/cli.ts --port 8930` (local mode, started fresh for this run with an empty task root, after the real-site run's API was stopped, so no robots.txt answer was cached)
Source commit: `5bfffec99baff7e362e38eea7a8c4437269abcb2` (`main`; the checkout the API ran from, and the `operatorCheckoutCommit` of the output)
Run: 2026-09-29T16:40:59Z to 16:41:55Z (2026-09-30 00:41 local time, UTC+8), batch of the 72 URLs in `urls.txt` (SHA-256 `0939b858…265c6`), `formats: ["markdown"]`, default mode (`standard`)
Network: `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` set (`127.0.0.1:7890`); W2L's local mode uses them.

The manifest is still preliminary, as in [the preliminary baseline](2026-09-29-preliminary-baseline.md), and this run checks capture status only, not the recorded values. Raw items stay under `.w2l/coos-pilot/` (git-ignored).

## Result

72 of 72 URLs attempted; the batch completed.

| Status | URLs | [P1 wave 5 batch](2026-09-29-p1-wave5-batch.md) (`dd3d948`) | Preliminary baseline |
| --- | --- | --- | --- |
| success | 61 (84.7%) | 61 (84.7%) | 54 (75.0%) |
| failed: policy_denied | 8 | 7 | 6 |
| blocked: bot_detected_generic | 1 | 0 | 0 |
| failed: http_error | 1 | 1 | 1 |
| blocked: rate_limit | 1 | 1 | 1 |
| blocked: cloudflare_challenge | 0 | 2 | 1 |
| failed: connection_error | 0 | 0 | 9 |

58 successes came from the HTTP lane and 3 from the local browser (56 and 5 in the P1 wave 5 batch). Six of the successes are PDFs, all six of the seed user's PDFs that robots.txt allows, read as text on the HTTP lane.

Two URLs changed status since the P1 wave 5 batch, in opposite directions, so the count is the same:

- fliphtml5.com (the flipbook copy of Google's 2025 environmental report) is now `success` in the local browser: 393,969 characters of Markdown holding the report's text ("emissions" occurs 568 times, no challenge text). The HTTP lane still got a Cloudflare challenge (HTTP 403); the browser's one navigation got HTTP 200, with no redirect or client-side navigation (`redirectChain` empty, complete). The site answered differently this time; the P1 wave 5 batch had a Cloudflare challenge there.
- datacenters.google/efficiency/ is now `failed`/`policy_denied`: its robots.txt did not answer within 5 s through the proxy, which counts as a complete disallow. It succeeded in the P1 wave 5 batch.

## Non-success, each with its reason

| Reason | URLs | Hosts | Observed |
| --- | --- | --- | --- |
| robots.txt disallows | 6 | delivery-p112322-e1154416.adobeaemcloud.com (3), aka.ms, go2.digitalrealty.com, www.gstatic.com | `policy_denied` with `robotsDecision.decision: "disallowed"` and the robots.txt hash in the Evidence Record: the robots.txt of adobeaemcloud.com, aka.ms and www.gstatic.com disallows `/`, that of go2.digitalrealty.com `/rs/`. Fetching them needs an explicit per-domain override with a recorded reason, which W2L does not have. Same six as in the P1 wave 5 batch. |
| robots.txt unreachable | 2 | investors.gds-services.com, datacenters.google | `policy_denied` with `robotsDecision.unreachable: "timeout"` and no robots.txt hash: robots.txt did not answer within 5 s through the proxy, a complete disallow by RFC 9309. Network-dependent: datacenters.google succeeded in the P1 wave 5 batch, investors.gds-services.com failed the same way there. |
| Anti-bot page | 1 | studylib.net | `blocked`/`bot_detected_generic`, HTTP 403 in the browser lane, as on the HTTP lane; the gate signal is the page's "verify you are human" text. The P1 wave 5 batch reported the same URL as `cloudflare_challenge`; the page's signals, not a code change, decide the reason code. |
| SEC without research mode | 1 | www.sec.gov | HTTP 403 (`http_error`). The batch runs in the default mode, which does not declare a contact. In research mode with `W2L_CONTACT` the same page answers 200 (real-site case A36, which passed in [runs/2026-09-30-main-5bfffec.md](../../parity/runs/2026-09-30-main-5bfffec.md)). |
| Rate limit | 1 | www.ironmountain.com | `blocked`/`rate_limit`, HTTP 429 on the HTTP lane (its robots.txt: none). |

Every non-success names its reason in the result and the Evidence Record; none is a connection error or an unexplained failure. Two of the eleven (the robots.txt timeouts) depend on the network path. By the P1 exit's third condition (at least 70% of the seed user's URLs succeed and the rest report their reason honestly), this run is above the line: 61 of 72, 84.7%.
