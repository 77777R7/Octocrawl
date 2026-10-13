# Week 6 calibration, 2026-10-13

The P1 item reads: "Record the actual P1 time against the audit's 34-working-day estimate for its M1 and rescale P2–P4 by that ratio." It was planned for week 6 (2026-11-02). The work it measures finished in week 1, so the record is written now, in week 3.

## The estimate

The parity audit's plan ([research/parity/plan-to-70.md](../../research/parity/plan-to-70.md), committed 2026-09-29) gives effort in working days per milestone. They are audit estimates, not measurements, and the plan itself expects a 10–15 day overlap that makes the real sum lower.

| Milestone | Features | Audit estimate |
| --- | --- | --- |
| M1 Trustworthy core (P1) | 21 | 34 days |
| M2 Scrape, crawl and batch breadth | 50 | 53.75 days |
| M3 Map, actions, cache, PDF text, upload | 30 | 54.75 days |

## What it took

The dates come from `main`'s history and ROADMAP's table of finished groups.

| Milestone | Start | Done | Working days | Ratio to the estimate |
| --- | --- | --- | --- | --- |
| M1 (P1) | Roadmap v2 adopted 2026-09-29 14:21 +0800 (`d34d8f37`), the first P1 merge 14:54. Week 1 began 2026-09-28. | P1's exit met 2026-09-30 18:01 +0800 at `6024703` (#82), 103 of 106 real-site cases | 2 (from 09-29) to 3 (from 09-28) | 0.06–0.09 |
| M2 | after P1, 2026-09-30 | "M2 closed", 2026-10-03: all 50 features, 47 solid and 3 weak | about 3, a Saturday included | about 0.06 |
| M1 to M3 together | 2026-09-28 | map, cache and PDF text 2026-10-03, browser actions 2026-10-05 (#136 … #205) | about 6, a weekend included | 0.04–0.06 |

The commit times bound the start, not the work. Agent sessions may have written code before it was committed, and several sessions worked at once, so the milestones overlap. Whichever way the bounds are read, the work cost roughly **5–9 % of the audit's estimate**.

## What the ratio does not cover

- **Merged and checked live is not finished.** What these milestones delivered was later found to report false successes and to miss data on real pages. PA was opened on 2026-10-05 for that, and its items took 1–3 days each, most of it real-site runs, verification and records, not code:
  - item 1 frozen on 2026-10-06;
  - items 2 and 8 accepted on 2026-10-09;
  - items 10 and 11 accepted on 2026-10-11.

  At that pace, the audit's figures overstate code and understate verification.
- **Exits that wait on people do not shrink.**
  - P0: 8 interviews, and the seed user's URLs.
  - P2: a non-author installs Octocrawl unaided.
  - P3: 3 early users use queue mode.
  - P4: 3 paying or 10 weekly active users by week 16.
  - PH: 5 keys used by others, and two weeks of billing.

  None of these is engineering time.

## Rescaling P2–P4

Applied to engineering time alone, the ratio gives this:

| Phase | Weeks in the roadmap | Engineering at 0.06–0.09 | What decides when it ends |
| --- | --- | --- | --- |
| P2 · Breadth for researchers | 7–10 (20 days) | 1–2 days: already done (formats, map, cache, tables, PDF text, the published packages, guides, and the one-line install on 2026-10-13) | a non-author's unaided install; the seed user's regression run |
| P3 · Browser lane and Pro | 11–14 (20 days) | 1–2 days of code, then about a week of real-site verification at PA's pace | 3 early users who used queue mode |
| P4 · Paid launch | 15–16 (10 days) | under a day for payment wiring | PH's two-week cost record (about 2026-10-20), where the seller is registered, and 3 paying or 10 weekly active users |

**Proposal, not adopted:** keep 2027-01-17 as the week-16 goal, since it is about users. Stop scheduling phases by week; let each start when its gate opens:

- P2's remaining exits now.
- P3 when PA closes, whether that is accepting the frozen-set gap of 12 or Browserbase's answer.
- P4's payment work after PH's cost record.

That moves the earliest P4 from week 15 to around week 5. Whether to rewrite the phase table this way is Howard's decision.
