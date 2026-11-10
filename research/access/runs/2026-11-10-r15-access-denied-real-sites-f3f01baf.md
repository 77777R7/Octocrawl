# R1.5: what crunchbase and lead411 report after `access_denied`, 2026-11-10

Label: `research`. Task list: [docs/enhanced-access-tasks.md](../../../docs/enhanced-access-tasks.md), R1.5. Checks R1.2 (#936), R1.3 (#939) and R1.4 (#940) on real sites.

**The question.** Before R1.2 a Cloudflare block page was reported as `cloudflare_challenge` and given the full challenge wait. What do the two sites the evaluation named, crunchbase and lead411, report on `main` now?

## Run

- **When:** 2026-11-10, 22:54–22:56 CST (14:54–14:56 UTC), three runs back to back: A, B, C.
- **Machine:** Howard's Mac (darwin, arm64), local API on port 8787, started with `W2L_ACCESS_GRANT=<installed_chrome grant> W2L_CHROME_PATH=research/access/exit-split/chrome.sh EXIT_SPLIT_STATE=<state dir> EXIT_SPLIT_SIZE=100 node --import tsx packages/api/src/cli.ts` after `npx tsc --build`. Stopped afterwards.
- **Source:** `f3f01baf` (`origin/main`, contains #940). `run-set.mjs` recorded that commit, tree not dirty, `dist/` up to date, grant capabilities `["installed_chrome"]`, in all three runs.
- **Command (each arm):** `node research/access/run-set.mjs --tasks <state dir>/tasks.json --set all --access '"enhanced"' --client-timeout-ms 330000 --save-responses --grant <grant file> --arm <A|B|C>`
- **Tasks file** (SHA-256 `318ae1a9…fb81995`, kept under `.w2l/`), two tasks, one cold read each:
  - `T048`: `https://www.crunchbase.com/organization/openai`, as frozen in `research/access/tasks.v1.json` (predicates: Markdown matches "OpenAI" and "Founded").
  - `R15L`: `https://www.lead411.com/`, predicate: Markdown matches "Lead411" (case-insensitive). No earlier record names a lead411 URL; this is the page the 2026-11-10 hosted spot-check read.
- **Exits. All three runs were proxied.**
  - **A:** every rung through the shell's Clash proxy (`127.0.0.1:7890`).
  - **B:** `http` and `browser_local` through Clash; the real Chrome (`installed_chrome`) through `research/access/exit-split/forward.mjs` port 18900, a Webshare datacenter proxy. The forwarder log has 6 connections to `www.crunchbase.com:443` on that port, all answered 200.
  - **C:** the API restarted with `HTTPS_PROXY`/`HTTP_PROXY` set to forwarder port 18950 (a second Webshare datacenter proxy), so `http` and `browser_local` left through a datacenter exit. The forwarder log has 11 connections to `www.crunchbase.com:443` and 2 to `www.lead411.com:443` on that port, all answered 200. Which exit the real Chrome used in C was not separated.
- **Run directories** (under `.w2l/access/runs/`, git-ignored): `2026-11-10T14-54-14-211Z` (A), `2026-11-10T14-54-33-282Z` (B), `2026-11-10T14-55-35-244Z` (C).

## Results

n = 1 per cell.

| Page | Arm | status | blockReason | HTTP | channelsTried | whole read |
|---|---|---|---|---|---|---|
| crunchbase T048 | A | blocked | `access_denied` | 403 | http, browser_local, installed_chrome | 13.5 s |
| crunchbase T048 | B | blocked | `access_denied` | 403 | http, browser_local, installed_chrome | 6.8 s |
| crunchbase T048 | C | blocked | `access_denied` | 403 | http, browser_local, installed_chrome | not printed (the run's p50 over both pages was 12.6 s) |
| lead411 R15L | A | success, verified | none | 200 | http | — |
| lead411 R15L | B | success, verified | none | 200 | http | — |
| lead411 R15L | C | success, verified | none | 200 | http | — |

**crunchbase.** In all three arms the delivered result's trace has `challenge_wait {blockReason: "access_denied", outcome: "not_waited", ms: 0, capMs: 0}` followed by `gate_detected` with signals `cf_attention_required` and `text_you_have_been_blocked` on a 403. The ladder marks all three rungs `blocked` / `bot_gate`; the `blockReason` of the `http` and `browser_local` rungs on their own is not in the saved response and was not recorded. `agentHints` carried the R1.3 text ("www.crunchbase.com refused this exit with a block page on the lanes tried (http, browser_local, installed_chrome): the page has no check to pass…"). The real-Chrome rung took about 8.9 s in arm A (4.9 s of it browser start) and 3.6 s in arm B.

**Old value for the same signal.** [The M1 record](2026-11-10-exit-vs-environment-1949dc97.md), cell A2 for T048, at `1949dc97`: `cloudflare_challenge`, signal `cf_attention_required`, 9.0 s on the real-Chrome rung.

**lead411.** The page was read over `http` in all three arms, including arm C on a datacenter exit: HTTP 200, the predicate passed, title "Unlimited B2B Leads Database for SMB Outbound Lead Generation: Lead411". No block page was met, so **the new `blockReason` for lead411 was not observed**. The block the evaluation recorded was on the hosted ordinary ladder (Cloud Run's Google exit); the hosted service does not run this code yet (nothing was deployed), and no hosted read was made in this run.

## What this shows and what it does not

- On crunchbase the block page now reports `access_denied` instead of `cloudflare_challenge`, the real-Chrome rung does not wait on it, and the hints say so. Three reads, one afternoon, one Mac.
- lead411's half of R1.5 is open: its block page has to be met on the exit that produced it, which needs the hosted service on a build containing #936.
- Nothing here measures whether any exit reads crunchbase; all three were refused.
