# M1: exit or environment? Local real Chrome through hosted's datacenter proxies, 2026-11-10

Label: `research`. Task list: [docs/enhanced-access-tasks.md](../../../docs/enhanced-access-tasks.md), M1.

**The question.** On the 16 challenge pages hosted `hosted_chrome` verified 5 and 6, and local `installed_chrome` verified 11, 14 and 13. The two differ in two things at once: the exit (hosted: Webshare shared datacenter proxies, US; local: this Mac's own exit) and the environment (hosted: Chrome 155 under Xvfb on Cloud Run, UTC, no GPU; local: Chrome on macOS with a display). No run has changed one and kept the other. This run does: the Mac's real Chrome, once on its usual exit and once through the same datacenter proxies hosted uses.

## Design and decision rule (written before any run; not changed afterwards)

- **Arm A (same-day baseline):** local API on this Mac, `installed_chrome` on the exit the API gives it (the shell's `HTTPS_PROXY`, a Clash client on `127.0.0.1:7890`).
- **Arm B:** the same API process, the same Chrome, the same grant. Only the real Chrome's exit changes: each Chrome launch goes through the next proxy of Webshare's shared datacenter list (100 US addresses), one proxy per read, as `hosted_chrome` chooses one per read. The `http`, `http_compat` and `browser_local` rungs leave by the API's own route in both arms, as hosted's ordinary rungs do not use the proxies either.
- **How:** `installed_chrome` refuses a proxy that needs a login (`packages/bench/src/subjects/installedChrome.ts:152`), so `W2L_EGRESS_PROXIES` cannot carry this rung with Webshare's logins, and it would move every rung. Instead `W2L_CHROME_PATH` names `research/access/exit-split/chrome.sh`, which replaces only `--proxy-server` in arm B with a port of `research/access/exit-split/forward.mjs` (one local port per proxy, seeded shuffle). No product code changes.
- **Same proxies as hosted:** the local list and the secret `w2l-hosted-chrome-proxies` (mounted by `octocrawl-chrome`) hold the same 100 lines (sorted SHA-256 equal, checked 2026-11-10; no entry printed).
- **Pages:** all 16 of `challenge16` (`research/access/subsets.v1.json`), none dropped or replaced.
- **Rounds:** 3 per arm, alternating A1, B1, A2, B2, A3, B3, `access: "enhanced"`, cold, through `research/access/run-set.mjs`.
- **A page passes in an arm** when at least 2 of its 3 rounds are verified (run-set's `verified`: read and every predicate passed).
- **Focus pages:** capterra (T047), cars.com (T071), crunchbase (T048): the pages local reads and `hosted_chrome` does not.
- **Rule:**
  1. B passes capterra and cars.com → the datacenter exit is enough for them on a real desktop Chrome: the hosted gap on these pages is **environment**. An ISP exit is not the next step; M2 and then H2/H3 are.
  2. B fails both and what it gets is a challenge that does not clear, while A passes them the same day → **exit**: H1 (ISP exit) is first after an unfreeze.
  3. B fails them with block pages (`cf_attention_required` or a 403 block, no challenge) → **exit refused**, also H1.
  4. Anything else (one passes and one fails, A fails them too, mixed signals) → **no conclusion**, said as such.
  5. If more than a quarter of arm B's attempts die on connection errors (no HTTP answer through the proxy), the arm says nothing about the sites → **no conclusion**.
- **Scope of the answer:** the three focus pages on one Mac and one proxy batch. It does not say what an ISP exit would do, and it does not measure hosted's environment (that is M2).
- **Known differences left in:** arm B's Chrome reaches the proxies through whatever route this Mac has to them; the Mac's Chrome is the installed stable (157 on the day), hosted pins 155; routing history is shared by both arms in one API process.
