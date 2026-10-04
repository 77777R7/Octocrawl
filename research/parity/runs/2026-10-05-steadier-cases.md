# Real-site runs 2026-10-05: steadier checks beside AC04, AR08, AR09 and AR10

Four frozen cases have checks that can fail while W2L did the right thing, or pass without showing what they are meant to. They stay as they were. Commit `2373577` freezes a new case beside each, before its first run:
- AC24 beside AC04;
- AR13 beside AR08;
- AR11 beside AR09;
- AR12 beside AR10.

Each new case's note in [sites.v1.json](../sites.v1.json) says what it changes.

## Setup

- **Source commit:** `2373577`.
- **API:** `npm run api` on port 8787.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). No direct run was made: from this machine a direct `curl` to the-internet.herokuapp.com got no answer within 20 s.
  - Some runner records count fewer cases with `evidence.envProxy` than they ran: a read that fails before an answer has none. Every herokuapp read's trace has `egress_proxy` with 127.0.0.1:7890, the failed ones included.
- **When:** 17:12 to 17:18 UTC on 2026-10-04, which is 01:12 to 01:18 on 5 October at UTC+8, the date the records are named by.
- **Raw responses:** under `.w2l/parity/` (git-ignored). The figures below come from them and from the runner records.

## The runs

| Record | Command | Result |
| --- | --- | --- |
| [actions-real](2026-10-05-actions-real-proxied-2373577.md) | `node research/parity/run-sites.mjs --batch actions-real --record research/parity/runs/2026-10-05-actions-real-proxied-2373577.md` | 10/13 cases, 50/57 checks |
| [AC04, AC24](2026-10-05-ac04-ac24-proxied-2373577.md) | `node research/parity/run-sites.mjs --batch actions --only AC04,AC24 --record research/parity/runs/2026-10-05-ac04-ac24-proxied-2373577.md` | 0/2 cases, 2/7 checks |
| [AC04, AC24 again](2026-10-05-ac04-ac24-proxied-2373577-rerun.md) | the same with `--record research/parity/runs/2026-10-05-ac04-ac24-proxied-2373577-rerun.md` | 0/2 cases, 3/7 checks |
| [AC24 alone](2026-10-05-ac24-alone-proxied-2373577.md) | `node research/parity/run-sites.mjs --batch actions --only AC24 --record research/parity/runs/2026-10-05-ac24-alone-proxied-2373577.md` | 1/1 case, 4/4 checks |
| [AC24, AC04](2026-10-05-ac24-ac04-proxied-2373577.md) | `node research/parity/run-sites.mjs --batch actions --only AC24,AC04 --record research/parity/runs/2026-10-05-ac24-ac04-proxied-2373577.md` | 0/2 cases, 2/7 checks |

The last run ran the cases in file order, AC04 first, as `--only` does not reorder them.

## Each pair

**AR11 beside AR09 (gov.uk postcode form).**
- Both passed, AR09 5/5 and AR11 5/5. Both ended on `https://www.gov.uk/find-local-council/westminster`.
- AR09's weak check (which step's trace records the navigation) failed in the 2026-10-04 run on `82d166b`. It held this time, so this run does not show AR11's difference.

**AR12 beside AR10 (hn.algolia.com search).**
- AR10 4/5. Its count before the query was 30, the same as after, so its "more after than before" check failed: the app drew its front-page stories before the first count. This is the failure AR12 was frozen for.
- AR12 5/5, with 30 stories after typing "sqlite".

**AR13 beside AR08 (dev.to feed).**
- AR08 4/4: 0 `article` elements before the steps, 57 list items after three scrolls.
- AR13 5/5: 20 `.crayons-story` elements before, 77 list items after.
- 77 − 20 = 57, AR08's count. The two cases are separate loads of dev.to, so this shows the counts agree, not that they are the same stories.

**AC24 beside AC04 (the-internet.herokuapp.com key presses).** Neither case passed reliably. Of seven herokuapp loads, five timed out: three of AC24's four and two of AC04's three.
- AC24 passed once, run alone: 4/4, "You entered: ESCAPE". Its other three runs failed with `timeout`: `navigate_failed` after 20 s waiting for `domcontentloaded`, before any action.
- AC04 failed in all three runs it was in (it is not in the AC24-alone run):
  - in two, by the same navigation timeout;
  - in the rerun, the page loaded (`success`). The Enter press reported `navigatedTo: https://the-internet.herokuapp.com/key_presses?`, so the form was submitted and the page reloaded. The Markdown then had no "You entered: ENTER". This is the failure AC24 was frozen for.

**Why the herokuapp loads timed out.**
- Five `curl` requests to the page through the same proxy each answered 200 in about 1.1 s. So did each of its seven same-site scripts and stylesheets, fetched one at a time in 1.1 to 2.1 s.
- A Playwright probe outside the repository loaded the page four times in Chromium through the same proxy. All four timed out at `domcontentloaded`:
  - in one, the document itself had not finished;
  - in three, the page's own `/css/` and `/js/` files, requested together, had not finished after 20 s.
- **Unconfirmed:** whether the site or the proxy stalls these parallel requests. Nothing here tells them apart, and a direct run was not possible from this machine.

## A correction to the 2026-10-04 actions-real record

The [2026-10-04 record](2026-10-04-actions-real.md) says AR08's count before the steps is 0 because dev.to had not yet drawn its feed. It concludes that AR08 shows only that the feed was read, not that scrolling added posts. **That is wrong.**
- The stories dev.to serves with the page are `div.crayons-story`. Only the stories that scrolling adds are `article.crayons-story`.
- The probe before freezing AR13 counted 19 `.crayons-story` at load and 60 after three scrolls, 41 of them `article`.
- So AR08's count of `article` elements is 0 before scrolling whenever the feed was drawn. Its check does show that scrolling added posts.

## Other failures in the actions-real run

- **AR03 (npmjs.com):** `blocked`, `cloudflare_challenge`. Of the 2026-10-04 proxied runs it failed in the one on `82d166b` and passed in those on `cf1acee` and `18bcf2b`.
- **AR07 (npr.org):** `failed`, `action_failed`, with no list read. It scored 1/4 in every 2026-10-04 run too, proxied and direct.

## Not checked

- A direct (unproxied) run.
- AR11's difference from AR09: AR09 held in this run.
