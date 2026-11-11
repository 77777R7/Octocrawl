# Tokens an agent receives for one docs page: Octocrawl and four other sources (2026-11-11)

**Question.** README and the site say Octocrawl's Markdown costs an agent fewer tokens than the page's HTML. Nothing in the repository measured it (docs/outside-users-tasks.md OD5), and "web pages filling the context" was the second most frequent pain in 401 Reddit threads read on 2026-11-11 (docs/launch/2026-11-09-user-personas.md). This record measures, on 20 documentation pages, how many tokens each source hands an agent to read the whole page, and how much of the page's text each keeps.

## Set and arms

- **Pages:** the 20 URLs in `research/benchmarks/token_cost/urls.json`, frozen and committed (`9aff4f0e`) before any arm ran. Documentation sites, static, server-rendered and client-rendered. None was replaced or dropped.
- **Arms**, each the whole page as an agent receives it:
  - **Raw HTML:** the body of a plain `curl` GET (Chrome user agent).
  - **Rendered HTML:** `document.documentElement.outerHTML` after the page loaded in Playwright MCP's browser.
  - **Fetch MCP:** the reference `mcp-server-fetch` 2026.10.24 (PyPI, run with `uvx`), tool `fetch` with default options (Markdown, 5,000 characters an answer), read to the end with `start_index` as its answer asks; every answer counted.
  - **Playwright MCP:** `@playwright/mcp` 0.0.83 (npm, `--headless --isolated`), tool `browser_navigate`. This version answers with the page's URL and title and writes the accessibility snapshot to a file it names; the arm counts the answer plus that file, which is what an agent reads next to see the page.
  - **Octocrawl:** the local MCP server (`packages/mcp/dist/stdio.js`) over the local API, tool `scrape` with default options, read to the end with `markdownOffset` as its answer asks; every answer counted, envelope included. "Octocrawl Markdown alone" is the page's Markdown joined across answers, without the envelope.
- **Tokens:** tiktoken `o200k_base` (tiktoken 0.12.0), an OpenAI tokenizer. Claude's tokenizer gives other counts; Claude counts are **unknown** (no Anthropic key was used). Read the ratios, not the absolute numbers.
- **Kept:** paragraphs, list items, cells and text nodes of 60 or more characters in the Playwright snapshot (the page as the browser shows it, navigation included), found in the arm's text after both are reduced to letters and digits. The Fetch MCP's answers are joined without their "Contents of" headers and truncation notes for this check (they stay in its token count), Octocrawl's Markdown is joined across answers. The snapshot's nested paragraphs are not matched, so this undercounts; a missing paragraph is either page chrome left out on purpose or content lost.

## Run

- Source: branch `claude/token-measurement` from `origin/main` `69f5c27c`; workspace compiled with `npx tsc --build` after the branch was cut, local API started from it (`node packages/api/dist/cli.js`, port 8787). Run at `aa4c873b` (scripts only differ from `69f5c27c`), counted with `count.py` as committed with this record.
- Command:

```bash
node research/benchmarks/token_cost/run.mjs --out .w2l/benchmarks/token-cost-2026-11-11 --proxy http://127.0.0.1:7890 --playwright-mcp 0.0.83 --fetch-mcp 2026.10.24 --fetch-allow-private-ips
TIKTOKEN_CACHE_DIR=.w2l/tiktoken-cache .w2l/pyenv/bin/python research/benchmarks/token_cost/count.py .w2l/benchmarks/token-cost-2026-11-11 --json .w2l/benchmarks/token-cost-2026-11-11/count.json
```

- 2026-11-11 11:47:30 to 12:02:57 UTC, Node v26.8.1, macOS. **Proxied:** every arm went through the same local proxy (127.0.0.1:7890, Clash). The proxy resolves hosts to fake addresses in 198.18.0.0/15, which `mcp-server-fetch` refuses as private; `--fetch-allow-private-ips` lets it fetch through the proxy and changes nothing else. Playwright MCP used its default browser channel; which Chrome binary it launched was not recorded (Google Chrome 157.0.8103.50 is installed).
- All 20 pages succeeded in every arm. Octocrawl read all 20 on its HTTP lane, status `success`, readiness `ready`; 8 pages needed more than one answer (2 to 5). The Fetch MCP needed 1 to 36 answers a page.
- Cost: no paid service was called. Raw outputs are under `.w2l/benchmarks/token-cost-2026-11-11/` (git-ignored).
- Earlier attempts, kept beside it and not used for the numbers: `-pilot` and `-run1-four-arms` (no Fetch MCP arm; the pilot counted only Playwright's short navigate answer, which led to counting the snapshot file), and `-run2-fetch-refused` (the Fetch MCP refused all 20 pages over the fake-IP proxy, before the flag was added).

## Results

| # | Page | Raw HTML | Rendered HTML | Fetch MCP | Playwright MCP | Octocrawl, all answers (answers) | Octocrawl Markdown alone | Paragraphs kept: Fetch MCP / Octocrawl |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 01 | docs.python.org/3/library/asyncio-task.html | 50,050 | 52,419 | 14,967 | 31,303 | 17,086 (2) | 13,244 | 156 / 156 of 158 |
| 02 | developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch | 48,994 | 25,535 | 6,266 | 18,597 | 9,469 (1) | 7,447 | 56 / 64 of 65 |
| 03 | react.dev/reference/react/useEffect | 201,525 | 202,134 | 10,212 | 26,224 | 14,407 (2) | 10,826 | 98 / 99 of 99 |
| 04 | nextjs.org/docs/app/getting-started/layouts-and-pages | 244,461 | 243,558 | 2,372 | 12,279 | 4,828 (1) | 3,320 | 19 / 19 of 20 |
| 05 | docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html | 438,631 | 517,455 | 23,896 | 64,051 | 30,140 (3) | 23,514 | 287 / 294 of 295 |
| 06 | code.claude.com/docs/en/best-practices | 152,850 | 162,082 | 10,007 | 31,425 | 15,982 (2) | 12,483 | 144 / 161 of 162 |
| 07 | docs.stripe.com/payments/accept-a-payment | 552,645 | 554,497 | 1,975 | 11,295 | 3,767 (1) | 2,272 | 25 / 26 of 26 |
| 08 | docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions | 625,247 | 629,450 | 44,020 | 96,643 | 53,662 (5) | 43,964 | 544 / 546 of 547 |
| 09 | kubernetes.io/docs/concepts/workloads/pods/ | 143,721 | 159,376 | 6,560 | 17,917 | 7,905 (1) | 6,172 | 96 / 96 of 99 |
| 10 | www.postgresql.org/docs/current/sql-select.html | 30,289 | 30,285 | 14,120 | 38,818 | 19,742 (2) | 16,451 | 243 / 270 of 271 |
| 11 | doc.rust-lang.org/book/ch04-01-what-is-ownership.html | 17,444 | 36,368 | 6,918 | 20,536 | 8,081 (1) | 6,483 | 103 / 103 of 104 |
| 12 | tailwindcss.com/docs/flex | 110,231 | 111,468 | 725 | 13,089 | 2,331 (1) | 1,061 | 5 / 7 of 7 |
| 13 | supabase.com/docs/guides/auth | 68,461 | 73,049 | 1,163 | 9,271 | 3,479 (1) | 2,133 | 9 / 13 of 13 |
| 14 | fastapi.tiangolo.com/tutorial/first-steps/ | 40,612 | 44,901 | 3,924 | 16,264 | 5,543 (1) | 3,849 | 36 / 36 of 36 |
| 15 | docs.djangoproject.com/en/5.2/topics/db/queries/ | 78,131 | 77,676 | 20,190 | 45,433 | 23,544 (2) | 19,392 | 212 / 212 of 213 |
| 16 | developers.cloudflare.com/workers/runtime-apis/fetch/ | 66,154 | 69,895 | 1,330 | 30,400 | 2,661 (1) | 1,278 | 13 / 13 of 14 |
| 17 | vercel.com/docs/functions | 320,985 | 326,042 | 1,409 | 13,213 | 4,004 (1) | 2,440 | 28 / 30 of 30 |
| 18 | playwright.dev/docs/locators | 83,452 | 85,749 | 6,918 | 22,772 | 8,925 (1) | 6,950 | 67 / 67 of 67 |
| 19 | docs.astral.sh/uv/concepts/projects/init/ | 30,470 | 34,791 | 2,370 | 9,656 | 3,778 (1) | 2,349 | 24 / 24 of 24 |
| 20 | docs.anthropic.com/en/docs/build-with-claude/tool-use/overview | 271,089 | 270,758 | 2,405 | 18,076 | 5,449 (1) | 3,777 | 41 / 41 of 43 |
| | **Total** | **3,575,442** | **3,707,488** | **181,747** | **547,262** | **244,783** | **189,405** | **2,206 / 2,277 of 2,293** |

| Octocrawl, all answers, against | Pages | Total ratio | Median page ratio | Range |
|---|---:|---:|---:|---:|
| Raw HTML | 20 | 0.068 | 0.079 | 0.007 to 0.652 |
| Rendered HTML | 20 | 0.066 | 0.078 | 0.007 to 0.652 |
| Playwright MCP (answer + snapshot file) | 20 | 0.447 | 0.393 | 0.088 to 0.555 |
| Fetch MCP | 20 | 1.347 | 1.462 | 1.142 to 3.215 |

**Where Octocrawl's extra tokens are.** Octocrawl's Markdown alone is 189,405 tokens, 4% more than the Fetch MCP's whole answers (181,747), and its answers total 244,783. On the 20 first answers (159,289 tokens) the page's Markdown is 123,732; carrying it as a JSON string adds 9,820 (escaped newlines and quotes); `evidenceRecord` is 13,326, `metadata` 5,938, `usage` 4,900, and the other fields about 4,000. A page read in several answers carries the envelope again in each.

## What this shows

1. **Against the page's HTML, Octocrawl's answers were about 7% of the tokens** (6.8% in total, 7.9% at the median page), on these 20 documentation pages, counted with o200k.
2. **Against Playwright MCP 0.0.83's page snapshot, about 45%** (39% at the median page). Playwright MCP's own answer is small in this version; the snapshot comes as a file the agent reads.
3. **Against the reference Fetch MCP, Octocrawl cost 35% more tokens** (median page 46% more), while keeping more of the page: 2,277 of 2,293 snapshot paragraphs (99.3%) against 2,206 (96.2%). The Fetch MCP's largest gaps were on postgresql.org (243 of 271), code.claude.com (144 of 162), developer.mozilla.org (56 of 65), supabase.com (9 of 13) and tailwindcss.com (5 of 7). Octocrawl read every page on its HTTP lane, so that text was in the HTML both received; the gap comes from the Fetch MCP's main-content extraction, not from client rendering. The difference in tokens is Octocrawl's answer envelope, not its Markdown.
4. So "fewer tokens than the HTML" holds on this set; "fewer tokens than other Markdown readers" does not. A slimmer answer (the Markdown as plain text, the Evidence Record shortened or on request) would bring Octocrawl's answers near its Markdown alone; that is a product decision, not measured here.

## Limits

- 20 documentation pages, one read each, on one day, through one proxy. Not a sample of the web; other kinds of pages (shops, news, forums) were not measured.
- o200k counts, not Claude's. The ratios between arms are expected to be close under another tokenizer but were not checked.
- "Kept" is a heuristic over the snapshot's single-line text; it says nothing about tables, code blocks or order. Two pages were read by hand: on developers.cloudflare.com (Octocrawl 1,278 Markdown tokens against a 30,400-token snapshot) the Markdown holds the whole article and the snapshot's bulk is the site navigation; on docs.stripe.com the Markdown holds every section of the default integration tab.
- react.dev's page was read twice by Octocrawl (two answers); the joined Markdown is 9 characters shorter than the length the first answer stated, so the page changed slightly between the reads or the cut point moved.
- Agents do not always read a whole page: an agent may stop after Octocrawl's first answer or search inside Playwright's snapshot file. The first Octocrawl answers alone total 159,289 tokens.
