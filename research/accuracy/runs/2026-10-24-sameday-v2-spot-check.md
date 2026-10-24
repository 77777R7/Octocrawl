# Same-day reference v2 (2026-10-24): spot check

**Date:** 2026-10-24. **Set:** `sameday-v2-2026-10-24`, registered in [`research/accuracy/sameday-v2-2026-10-24.json`](../sameday-v2-2026-10-24.json): 22 cases and 164 field slots. Each field was annotated on the page source a #701 Octocrawl answer kept, using that case's own reserved-v2 annotation rule; the data is in `.w2l/field-gold/sameday-v2-2026-10-24/`. **Annotated by** Claude Code session f2-eval-sameday (this window), 2026-10-24. Decision 3 (2026-10-20): this window labels; Howard or one outside reviewer spot-checks 20%.

## Non-author spot check

| Item | Value |
| --- | --- |
| Reviewer | Howard |
| Date | 2026-10-24 |
| Sample | 36 fields: ceil(20%) of each stratum (product 6, list 9, table 13, dynamic 5, document metadata 3). Seeded draw (seed 20261024, `random.Random(seed).sample` over sorted field IDs, as #624), listed in `spot-check.json` |
| Sheet | `spot-check-sheet.md` (written by `sheet.py`). Each row gives the same-day value, the 2026-10-20 gold value, the quoted source span, and its offsets in Python `str` indices (source decoded from bytes, no newline translation) and UTF-8 bytes |
| Result | **36 of 36 agreed**, 0 disagreed, no notes |

The 36 fields:
- **product** (6): `V08/product/price`, `V09/product/name`, `V10/product/price`, `V13/product/availability`, `V13/product/price`, `V14/product/author`
- **list** (9): `V18/advisory-1/date`, `V18/advisory-2/advisory_name`, `V18/advisory-2/url`, `V19/paper-2/arxiv_id`, `V20/post-1/url`, `V21/post-1/title`, `V21/post-1/url`, `V21/post-2/author`, `V21/post-2/published`
- **table** (13): `V22/cycle-3/released`, `V22/cycle-3/security_support_until`, `V23/branch-2/end_of_life`, `V23/branch-3/first_release`, `V24/country-1/land_area`, `V24/country-1/yearly_change`, `V24/country-2/population`, `V24/country-2/yearly_change`, `V24/country-3/country`, `V25/currency-1/rate`, `V25/currency-2/rate`, `V26/release-3/kind`, `V28/version-2/version`
- **dynamic** (5): `V29/story-1/title`, `V29/story-3/points`, `V29/story-3/submitted`, `V29/story-3/title`, `V29/story-3/url`
- **document_metadata** (3): `V36/doc/doi`, `V37/doc/first_author`, `V37/doc/type`

This is the only non-author check of the set. The items below are engineering checks by sessions in the same group and are not counted as independent review:
- `audit_gold.audit_case` re-derives every value from the run-day bytes: all 22 cases pass.
- The same rules, run on the Haiku arm's copy of each page, agree on all 20 comparable cases.
- The coordinating session pre-checked the 36 values against the pages.
- A clean-context subagent re-checked the audit and the seal hashes.

## Files checked (sha256)

| File in `.w2l/field-gold/sameday-v2-2026-10-24/` | sha256 |
| --- | --- |
| `seal.json` | `3d834cef53b19858c9558eb89baa202e424ef660eed9e9c01d07ffe8fb1319c1` |
| `plan.json` | `751390e59b90478dabefcf3902f68fa26292a9a836397ca90ecae71364f7a0fe` |
| `spot-check.json` | `cc9abae79d8ea373fcaefab94a32413ba3320af2b581860f687cec2731e3c09a` |
| `spot-check-sheet.md` | `bf3685e02fd479a4eafb0869040c915d2bde01d55e5d419d0f22ed68ca580ed6` |
| `sheet.py` | `339276aa4e1ec63be617e6cc1ec8c9d2144bdcc52d66fca2589e8de6fba57f54` |

- All 93 files the seal lists match their hashes, the plan matches `planSha256`, and both match the manifest's `dataset`.
- The sheet and `sheet.py` are outside the seal: they change no label. The sheet was regenerated once before the check to state its offset units, and the hash above is the version Howard checked.

## No reseal

There was no disagreement, so no annotation changed. The dataset, its seal and the scores in [2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md](2026-10-24-f2-live-v2-sameday-07d8fb45-56971363.md) and [2026-10-24-json-context-rescore-3b1bde6a.md](2026-10-24-json-context-rescore-3b1bde6a.md) stand as written. The `gold.json` files still say `spotCheck.status: pending`, because they are sealed. This record, and the manifest's `spotCheck` entry that points to it, register the result, the way `reserved.v2.json` is registered by its run records.
