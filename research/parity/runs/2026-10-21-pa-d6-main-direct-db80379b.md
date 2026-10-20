# Real-site run 2026-10-20

Command: `node research/parity/run-sites.mjs --only M14,M15 --record research/parity/runs/2026-10-21-pa-d6-main-direct-db80379b.md`
Source commit: `fd26df2f2892b4d1764ab3e64ec97515878ea352` (the runner and its cases; the engine is `main` `db80379b`, see below)
Run: 2026-10-20T18:12:25.004Z → 2026-10-20T18:12:46.687Z against http://127.0.0.1:8799
Network: NO_PROXY set in the runner's environment; 0 of 2 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/2; checks passing: 3/21.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| M14 | https://www.rfc-editor.org/rfc/rfc9110.html | 1/13 | markdownMatches (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownIncludes "Internet Engineering Task Force (IETF)" (scrape-formats.only-main-content); markdownIncludes "Standards Track" (scrape-formats.only-main-content); markdownIncludes "June 2022" (scrape-formats.only-main-content); markdownIncludes "R. Fielding, Ed." (scrape-formats.only-main-content); markdownIncludes "M. Nottingham, Ed." (scrape-formats.only-main-content); markdownIncludes "J. Reschke, Ed." (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownIncludes "| Method Name | Description | Section |" (scrape-formats.markdown); tablesConsistent (scrape-formats.markdown) |
| M15 | https://www.w3.org/TR/WCAG22/ | 2/8 | markdownMatches (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownIncludes "Alastair Campbell" (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownMatches (scrape-formats.only-main-content); markdownIncludes "Level AAA" (scrape-formats.only-main-content) |

Failed checks with the observed value:

- M14 [scrape-formats.only-main-content] markdownMatches `^# RFC 9110$`: absent
- M14 [scrape-formats.only-main-content] markdownMatches `^# HTTP Semantics$`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `Internet Engineering Task Force (IETF)`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `Standards Track`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `June 2022`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `R. Fielding, Ed.`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `M. Nottingham, Ed.`: absent
- M14 [scrape-formats.only-main-content] markdownIncludes `J. Reschke, Ed.`: absent
- M14 [scrape-formats.only-main-content] markdownMatches `^## \[1\.\]\(#section-1\) \[Introduction\]`: absent
- M14 [scrape-formats.only-main-content] markdownMatches `^## \[15\.\]\(#section-15\) \[Status Codes\]`: absent
- M14 [scrape-formats.markdown] markdownIncludes `| Method Name | Description | Section |`: absent
- M14 [scrape-formats.markdown] tablesConsistent: fewer than 1
- M15 [scrape-formats.only-main-content] markdownMatches `^# Web Content Accessibility Guidelines \(WCAG\) 2\.2$`: absent
- M15 [scrape-formats.only-main-content] markdownMatches `W3C Recommendation\]\([^)]*\) \d{1,2} \w+ \d{4}`: absent
- M15 [scrape-formats.only-main-content] markdownIncludes `Alastair Campbell`: absent
- M15 [scrape-formats.only-main-content] markdownMatches `^## 1\. Perceivable$`: absent
- M15 [scrape-formats.only-main-content] markdownMatches `^## 5\. Conformance$`: absent
- M15 [scrape-formats.only-main-content] markdownIncludes `Level AAA`: absent

## Engine (added when the record was written)

The runner and `sites.v1.json` came from this branch at the source commit above, which adds M14 and M15. The API it called on port 8799 ran a separate checkout of `main` `db80379b` (`git worktree add --detach`, `npm ci`, `npx tsc --build`, `W2L_API_PORT=8799 node --import tsx packages/api/src/cli.ts`), extractor `extract-tf/31`, so this is `main` before D6 on the live pages. The run's UTC date is 2026-10-20; the file is named by the local date, 2026-10-21.

Direct: the API and the runner ran with `HTTPS_PROXY`, `HTTP_PROXY` and `ALL_PROXY` unset. Both pages answered `success`; the default Markdown had none of the header, as in the field gold set's H01 and H07 replays.
