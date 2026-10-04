# Real-site runs 2026-10-05: list pages read with the default onlyMainContent

Since the [I2 run](2026-10-03-i2-actions.md), five action cases have run their steps and then failed the read as `failed`/`empty_unverified`:
- AC01 and AC05 (quotes.toscrape.com);
- AC07, AC08 and AC09 (webscraper.io's test shop).

They all use the default `onlyMainContent: true`. The extractor found no main content on these pages, which are lists of items. This branch makes it read such a list as the page's content.

## Setup

- **API:** `npm run api` on port 8787 with a scratch task root.
- **Network:** **proxied**, through the shell's `HTTPS_PROXY` (127.0.0.1:7890). No direct run was made.
- **When:** 18:19 to 19:27 UTC on 2026-10-04, which is 02:19 to 03:27 on 5 October at UTC+8, the date the records are named by.
- **Raw responses:** under `.w2l/parity/` (git-ignored).
- **Command:** each batch was run with `node research/parity/run-sites.mjs --batch <batch> --record research/parity/runs/2026-10-05-<batch>-proxied-<commit>.md`. Each record gives its own command and times.

## The reproduction on main (`d35dbce`)

The command was `node research/parity/run-sites.mjs --batch actions --only AC01,AC05,AC07,AC08,AC09,AC13,AC14 --record research/parity/runs/2026-10-05-list-pages-proxied-d35dbce.md`. 2 of 7 cases passed.

- **The five cases above:** `failed`/`empty_unverified`. The extract event shows `escalate: true`:
  - quotes.toscrape.com was routed `article`;
  - webscraper.io was routed `product`, because each card declares a schema.org Product in microdata.
- **AC13 and AC14:** the same steps on the quotes pages with `onlyMainContent: false`. Both passed.

## Before and after, nine batches

The same nine batches were run on main and on the branch, one commit after the other. A run on `c997041`, the branch before its last review fix, was stopped after four batches; their records are kept.

| Batch | Cases | `d35dbce` (main) | `c997041` | `edcf083` |
| --- | --- | --- | --- | --- |
| `1` | 12 | 12 (44/44) | 12 (44/44) | 12 (44/44) |
| `L` | 12 | 12 (85/85) | 12 (85/85) | 12 (85/85) |
| `F` | 16 | 14 (169/180) | 14 (169/180) | 14 (169/180) |
| `tables` | 10 | 9 (37/40) | 10 (40/40) | 10 (40/40) |
| `actions` | 24 | 13 (78/96) | not run | 17 (82/96) |
| `actions-real` | 13 | 12 (54/57) | not run | 11 (53/57) |
| `lists` | 8 | 8 (34/34) | not run | 8 (34/34) |
| `list-records` | 6 | 6 (27/27) | not run | 6 (27/27) |
| `list-detect` | 7 | 7 (30/30) | not run | 7 (30/30) |

Cases are those fully passing; checks passing are in brackets.

### Cases whose result differs between `d35dbce` and `edcf083`

The causes come from the raw responses.

- **The change itself:**
  - **AC01, AC07, AC08, AC09:** now pass.
    - AC01 is routed `article` with strategy `list`.
    - AC07, AC08 and AC09 are routed `collection`.
  - **AC05:** the read is now `success`. The case still fails its other check: the page counted 20 quotes after its scrolls, not the 30 or more it expects. That count was 20 in the [I2 run](2026-10-03-i2-actions.md) too. It is not about the read.
- **Not the change:**
  - **TB07 (eia.gov):** failed on `d35dbce` as `timeout` on the http lane, before any extraction. It passed in both runs on the branch.
  - **AC04 (the-internet.herokuapp.com):** on `edcf083` it failed as `timeout`, the page navigation that timed out in the [steadier-cases runs](2026-10-05-steadier-cases.md) too. On `d35dbce` the page loaded and the case failed on its known form reload.
  - **AR10 (hn.algolia.com):** on `d35dbce` the count before the steps was 0, and on `edcf083` it was 30, as the record's own note on AR10 describes. Its count after the steps was 30 both times.

No other case's result differs.

## Not covered by these runs

- **The branch's last commit:** keeping the whole page as evidence of an error status when the extractor's content is only its last resort. It changes only the Markdown a failed result keeps, and was tested with a local fixture.
- **A direct run.**
- **The handoff in the person's Chrome:** its check of a page whose content is only a last-resort list. That was tested with a fake Chrome.
