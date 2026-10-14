# T005's false success: the loading probe and the region wait, 2026-10-14

Label: `product`. T005 (Etsy's home page, a listing task: "Etsy" and at least five prices) was a false success in all four Clash runs of `aad87f9f` ([stability record](2026-10-14-installed-chrome-clash-stability-aad87f9f.md)). The answer came back `success` and its data checks failed. This record has the diagnosis, the fix and the check on the 16 challenge tasks.

## Diagnosis

`research/access/delivery-timeline.mts` (added in this PR) read T005's page in the installed Chrome, through the Clash exit:
- at 5, 10, 20 and 30 s after DataDome's check cleared;
- then after scrolling down 0.9 of a screen at a time, as the region wait scrolls;
- then again after scrolling back to the top.

Each read counted the task's predicates on the visible text, the whole page as Markdown, and the main content as Markdown made the way the browser lane makes it. The HTML and Markdown of each read are kept under `.w2l/access/archive/2026-10-14/t005-timeline-*`, outside the repository.

| Read | Prices in visible text | Prices in main-content Markdown |
| --- | --- | --- |
| 5, 10, 20 and 30 s after the check | 0 | 0 |
| After scrolling to the end | 54 | 63 |
| Back at the top | 54 | 63 |

- **The prices do not arrive late, and they are not lost on the way to the Markdown.** Etsy Singapore's first screen has none: a seasonal banner and category cards. The prices are in carousels further down, which load as they are scrolled to.
- **Scrolling back to the top keeps them**, so reading after the region wait returns to the top is not the problem here.
- **Why the product never scrolled:** the region wait scrolls only once the page is steady, not loading and failing its checks. The loading probe (`LOADING_PROBE`, `browserSettle.ts`) found the page loading every time:
  - the live page had two "Loading" texts for screen readers, 1×1 px, at y = 2273 in a 755 px window;
  - they are the placeholders of the carousels that load when scrolled to.

  So the wait waited for the placeholders, which wait for the scroll, and gave up at 10 s with the first screen. The acceptance runs' T005 trace said `loading: true` and showed no scroll.

## Fix

The probe no longer counts a screen-reader-only text (at most 1 px square) that is wholly below the screen.

- **The first version** excluded everything wholly below the screen.
- **Review found that too broad.** A page whose visible "Fetching..." sits under a tall header was read before its list arrived, at a 720 px window and not at 1200 px. The my-browser lane, which never scrolls, would have read such a page at once.
- **What still counts as loading:** a loader one can see below the screen, and a screen-reader text on screen (a spinner's).
- **Fixtures** (`browserLocal.test.ts`), each checked to fail without the fix it tests:
  - `/lazy-skeleton`: Etsy's shape, scrolled to and read with its prices;
  - `/not-loading`: gains a placeholder of that kind, and is not waited for;
  - `/fetching-below`: the reviewer's shape, still waited for.

## The 16 tasks on `25286ac4`

- **Setup:** Clash exit, installed Google Chrome 155.0.8059.40 headed, a grant naming `installed_chrome` alone, `--access '"enhanced"'`.
- **Runs:** `2026-10-14T09-23-31-614Z` and `2026-10-14T09-27-22-078Z` (UTC), both `dirty: false`.

| | Run 1 | Run 2 |
| --- | --- | --- |
| Verified | **12** | **13** |
| False success | 0 | 0 |
| T005 | ✓ (region wait scrolled 2 screens, ready) | ✓ (same) |
| Not verified | T045, T046, T048, T068 | T045, T046, T068 |
| p50 / p95 ms | 10554 / 26054 | 10203 / 25783 |

- **Against the code before the fix,** on the same exit: four runs that afternoon gave 10, 10, 11 and 8, each with T005 a false success.
- **Real-site batch L:** 12/12 cases, 85/85 checks.
- **The full test suite:** 234 files and 2867 tests passed.
- **The first, broader version also verified 13 and 11, with T005 in both.** Those runs are in `.w2l/access/archive/2026-10-14/probe-fix`. They are not evidence for this commit.

## Not shown

- The 92-task set on this commit. The probe serves every browser lane; batch L is the only real-site regression run here.
- More than two runs, or other days.
- Other exits.
