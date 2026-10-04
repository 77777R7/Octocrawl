# Live checks 2026-10-04: the interaction cases direct and proxied, on one commit

Every recorded run of the interaction cases before this one was proxied, apart from AC02–AC04 once direct ([2026-10-03-i2-actions-direct-d88c8eb.md](2026-10-03-i2-actions-direct-d88c8eb.md)). AGENTS.md notes that a site can pass one way and fail the other. Here all five interaction batches were run both ways on the same source commit, back to back, so only the network differs.

## The runs

- **Source commit:** `82d166b` (main after PR #188) for all ten runs. The working tree had no change to tracked files.
- **Server:** `npm run api` on port 8787 with a scratch task root and no saved logins.
- **Command:** `node research/parity/run-sites.mjs --batch <batch> --record research/parity/runs/2026-10-04-<batch>-<direct|proxied>-82d166b.md`
- **Direct**, 09:06–09:20 UTC:
  - Both the API and the runner had `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY` unset; the API also had `W2L_PROXY=off`.
  - No response records an environment proxy.
  - A Cloudflare trace (`curl https://www.cloudflare.com/cdn-cgi/trace`, proxy unset) taken just before these runs showed `loc=CN`.
- **Proxied**, 09:20–09:32 UTC:
  - The shell's `HTTPS_PROXY` was 127.0.0.1:7890, and every fetched response records it.
  - The same trace through the proxy, taken earlier the same day while probing the actions-real pages, showed `loc=SG`.
- Neither exit was checked during the runs themselves.

| Batch | Cases | Direct: cases fully passing (checks) | Proxied: cases fully passing (checks) |
| --- | --- | --- | --- |
| `actions` (I2) | 23 | 12 (74 of 92) | 13 (77 of 92) |
| `actions-real` | 10 | 6 (30 of 42) | 6 (34 of 42) |
| `lists` (I3) | 8 | 7 (30 of 34) | 8 (34 of 34) |
| `list-records` (I4) | 6 | 4 (23 of 27) | 6 (27 of 27) |
| `list-detect` (I5) | 7 | 6 (28 of 30) | 7 (30 of 30) |
| All | 54 | 35 (185 of 225) | 40 (202 of 225) |

## What differed between the two, and why

The causes come from each run's raw responses (git-ignored, under `.w2l/parity/`).

**robots.txt that could not be reached (direct only).** Eight cases failed direct as `policy_denied` before any page request. The robots.txt fetch timed out (`unreachable: timeout`, no rule applied), and W2L treats a robots.txt it cannot fetch as a complete disallow, as the README states (RFC 9309 §2.3.1.4). The cases:
- AC02, AC03 and AC04 (the-internet.herokuapp.com);
- AR02 (hub.docker.com), AR05 (github.com) and AR06 (aljazeera.com);
- LR06 and LD04 (news.ycombinator.com).

Of these:
- Proxied, AR02, AR05, AR06, LR06 and LD04 passed.
- AC02 and AC03 still failed proxied: the page navigation timed out after 20 s.
- AC04 failed proxied for another reason, given below.

**Navigation that timed out (direct only).** scrapethissite.com was slow direct:
- AC15 failed with `page.goto` past 20 s; it passed proxied.
- LS07 and LR03 read their first page (LR03 kept its 25 records), then failed during the paginate step with `page.waitForLoadState` past 60 s. Both passed proxied.
- AC06, on the same site, failed direct on the timeout. Proxied it fails, as in every earlier run, on its invalid selector `#2015`.

**A different overlay over NPR's button (AR07, both ways).**
- Direct, the click was intercepted by a OneTrust consent filter (`<div class="onetrust-pc-dark-filter ot-fade-in">`).
- Proxied, it was intercepted by a Piano checkout iframe (`buy.tinypass.com`). The earlier runs recorded its container, `tp-modal`.
- Each exit was shown its own overlay.

**Failed proxied only, at this commit:**
- **AR03, npmjs.com:** `blocked` as `cloudflare_challenge` (`cf-mitigated` header, 403). npm also answered so once while probing before the set was frozen, and passed both earlier proxied runs and the direct run here.
- **AR09, gov.uk:** the council's page was read ("Westminster" present). But the form's navigation landed after the press step had settled, so the step's trace has no `navigatedTo`, and the check that expects it there failed. Direct, and in both earlier proxied runs, it landed within the step. The final page is right; only which step records the navigation depends on timing.
- **AR10, hn.algolia.com:** the stories were already on the page when the count before the steps was taken (30 before, 30 after). The `sqlite` results check still passed. This is the weakness the [actions-real record](2026-10-04-actions-real.md) already names: a count taken right after load measures the page's own timing.

So the `actions-real` set read 9 of 10 proxied two hours earlier ([cf1acee](2026-10-04-actions-real-proxied-cf1acee.md)) and 6 of 10 proxied here.
- Between the two commits the steps' code did not change; the Markdown converter and the route handling did.
- None of the three failures above involves either: a site's challenge, a navigation's timing, and the page's own timing. Three of the ten pages vary from run to run.

**AC04, the-internet.herokuapp.com key presses (proxied: reached for the first time).**
- The page loaded proxied for the first time in any recorded run, and both steps ran (`click #target`, `press Enter`).
- The press step navigated (`navigatedTo .../key_presses?`), and the page read after it has no "You entered" line.
- The page's source, fetched after the runs (curl, proxied), puts `#target` inside a `<form>` and starts `#result` empty. So Enter most likely submitted the form and the page that was read is the reloaded one.
- Whether the line appeared before the reload was not observed.
- The case is unchanged, and it stays in the denominator as a failure.

## The same both ways

These failed the same way direct and proxied, as in earlier runs:
- AC01, AC05, AC07, AC08 and AC09: `failed`/`empty_unverified` on list pages with the default `onlyMainContent`. AC05 also counted 20 quotes, not the 30 it expects, as in [2026-10-03-i2-actions.md](2026-10-03-i2-actions.md);
- AC12: the "Example Domain" check (see [2026-10-04-ac12-ac23-proxied-19e31c9.md](2026-10-04-ac12-ac23-proxied-19e31c9.md)).

AC06 also failed both ways, but for different reasons, as noted above.

## Not measured

- How long each site took, apart from the timeouts named above.
- The exit during the runs (see above), and any exit other than these two.
- Whether a direct run from another network in China would reach the robots.txt files that timed out here.
