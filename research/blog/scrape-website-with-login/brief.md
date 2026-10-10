# Brief: scrape-website-with-login

- **Query**: `scrape website with login` · en-US · desktop · checked 2026-10-10
- **Primary task**: read pages that only show their data when you are signed in, without handing a scraper your password.
- **Adjacent questions**: should I give the scraper my credentials or cookies? what about 2FA and captchas? is it allowed? how do I get through a check myself? can I run it unattended later?
- **content_boundary**: the three ways (read in your own Chrome, hand a stopped page to you, save one site's cookies), what to click, a real signed-in read, what Octocrawl never does, unfinished results.
- **must_not_cover**: getting past captchas or bot checks automatically (refused by policy, one line); account sharing.
- **Canonical check**: replaces `/docs/guides/own-chrome/` → **update + move**, 301.
- **Safety**: the article must not teach bypassing verification; the person passes any check themselves.

## Demand

Autocomplete: how to scrape a website with login · scraping website with login python · scrape website after login · scrape website behind login. Related: "web scraping behind login", "web scraping login required", "scrape website that requires login". Volume/KD unknown.

## Top 5 (Google, 2026-10-10)

| # | URL | Type | Words | H2s / approach | Tables / code / images | Date | JSON-LD |
|---|---|---|---|---|---|---|---|
| 1 | reddit.com/r/learnpython/… | forum | not audited | | | | |
| 2 | stackoverflow.com/questions/23102833 (python + beautifulsoup) | Q&A | 2,572 | 5 answers; send credentials with requests | 0 / 7 / 2 | asked 2014 | (blocked by tool) |
| 3 | axiom.ai/scrape/login/ | product guide | 1,258 | getting in, how I'd approach it, what to watch | 0 / 1 / 0 | none | (blocked by tool) |
| 4 | simplescraper.io/docs/scrape-behind-login | docs | 707 | Credentials method, Cookies method | 0 / 0 / 0 (2 videos) | none | none |
| 5 | community.make.com/t/…/941 | forum | 265 | none | 0 / 0 / 0 | 2022-04-26 | QAPage |

## Gaps

- Every method either gives the scraper your password or exports your cookies. None keeps both inside your own browser.
- None separates "a page that needs your login" from "a page behind a bot check", or says what the tool will never do.
- No first-party run of a real signed-in page.

## Product Connection Contract

| Field | Answer |
|---|---|
| Search problem | Read signed-in pages safely. |
| Product position | Octocrawl's my-browser lane, handoff and saved logins, on your own computer. |
| Placement | Comparison of the three ways, then the real run. |
| Reader value | No password or cookie leaves Chrome on the lane; checks are passed by you. |
| Not a fit | Hosted Octocrawl refuses all three; a site whose bot check sees remote debugging may refuse you; Windows/Linux not yet checked; unattended runs need a saved login, which stores cookies (not encrypted). |
| Evidence and link | Runs below; links to /docs/connect-mcp/#run-it-on-your-computer and /docs/limits/. |

## Claims to verify

1. `npx octocrawl@0.3.2 scrape https://github.com/notifications --lane my-browser`: status, time, `access.completion`, executor; anonymous request 302 to login.
2. The first run that timed out (exit 1, message).
3. CLI flags exist at v0.3.2 (`--lane`, `--handoff`, `login import|list|remove`, `--mode authed`).

Existing runs 2026-10-09 14:58 and 15:34 UTC (`scratchpad/chrome-run`, private content removed). A new run needs Howard at Chrome.

## Visual plan

- Screenshot: Octocrawl's "Allow reading these sites" page in Chrome (needs Howard's session).
- Screenshot: terminal with the result summary (no private content).
- Cover: house on the coast at dusk (a private place).
