# Claude Code answer sample, 2026-11-10

The same 14 questions as the ChatGPT sample of 2026-11-09 (`research/seo/2026-11-09-geo-run-chatgpt-web.md`, PR #913), asked of Claude Code: what a developer gets when they ask Claude Code itself which tool to use. This is the Claude baseline that later changes are compared with.

## How it was collected

| Item | Value |
| --- | --- |
| When | 2026-11-10, 02:50:00 to 02:53:19 UTC, four questions at a time |
| What | `claude -p` (Claude Code 2.1.301), one new session per question, no session saved |
| Model | `claude-sonnet-5-5`, set with `--model`; default effort. With no flag, this account's saved choice (`claude-fable-5-2`) is used, which a new user would not have, so the model was pinned |
| Isolation | Run in an empty directory outside the repository with a clean environment (`env -i`, keeping only `HOME`, `PATH`, `USER`, `LANG`, `TERM` and the proxy variables), `--setting-sources ""` (no settings, no CLAUDE.md, no memory), `--strict-mcp-config` with an empty MCP config (no MCP servers, so no Octocrawl tools). A test run listing its instructions answered that none were loaded |
| Tools | `WebSearch` and `WebFetch` only, both allowed. Claude Code decides by itself whether to search; it was not told to |
| Network egress | Proxied through Howard's local proxy (`HTTPS_PROXY`); WebSearch runs on Anthropic's side |
| Questions | The 14 prompts of the ChatGPT sample, unchanged (`docs/seo/library/geo-prompts.md` at `main` c059d36f): 6 tool questions, 6 developer questions, 2 that should not lead to Octocrawl. Rule 5 of `docs/seo/library/geo-protocol.md` (no scripted questions in web interfaces) does not apply: this is a command-line client |
| Runs | 3 per prompt, 42 answers, no errors, no retries. Total reported cost $0.88 |
| Site state | Octocrawl's tool-page changes (PR #915, revision r144geotools) went live 2026-11-09 ~19:45 UTC, about seven hours earlier; IndexNow was sent for the three tool pages at 02:39 UTC |
| Scoring | Script (`extract.py`: searches, fetches, result URLs, any "octocrawl" in the answer or the URLs), then an independent agent read all 42 answers and recorded the first pick and every product named (`review.json`) |

Raw stream output, per-answer Markdown, the summary and the review are outside the repository in `.w2l/seo/geo-runs/2026-11-10-claude-code/`, with the scripts in its `scripts/` folder (archived copy under `~/Code/w2l/.w2l/seo/geo-runs/`).

## Results

**Octocrawl was named in 0 of 42 answers, and no octocrawl.dev URL appeared in any search result or fetch.**

| Measure | Result | 95% interval (Wilson) |
| --- | --- | --- |
| Named, on the 11 "should mention" prompts | 0 / 33 | 0 to 10.4% |
| Named, "should mention" plus the 1 conditional prompt | 0 / 36 | 0 to 9.6% |
| octocrawl.dev in search results or fetches | 0 / 42 | 0 to 8.4% |
| Named on the 2 "should not mention" prompts (overclaiming) | 0 / 6 | 0 to 39.0% |

**Claude Code searched on 12 of 42 answers, always on the same four prompts.** P01-06 (best scraping MCP for Claude Code), P04-08 (MCP that crawls a whole site), P09-04 (free API or MCP without sign-up) and P05-03 (Cloudflare-protected sites) searched in all three rounds; the other ten prompts were answered from the model's own knowledge in all three rounds, with no search and no fetch. For those ten, what the site says today cannot change the answer; only what the model already knows can.

What Claude Code recommended (named in all three runs, and the first pick in each run):

| Prompt | Should mention | Searched | Named in all 3 runs | First pick, rounds 1 / 2 / 3 |
| --- | --- | --- | --- | --- |
| P04-01 find all pages of a site | yes | no | wget, katana, Scrapy, Wayback CDX API | sitemap via curl, then wget `--spider` or katana, all three |
| P04-02 subpages and subdomains | conditional | no | subfinder, amass, crt.sh, httpx, katana, Screaming Frog, gau | subfinder, then katana, all three |
| P04-07 API that returns a domain's URLs | yes | no | Firecrawl, Apify, Crawlee, Scrapy, Wayback CDX, Common Crawl | Firecrawl `/map`, all three |
| P03-01 URL to clean Markdown | yes | no | Jina Reader, Pandoc, MarkDownload | Jina Reader, all three |
| P03-03 page to plain text | yes | no | Jina Reader, Trafilatura, browser Reader Mode, lynx | Reader Mode or Jina / Trafilatura / Trafilatura |
| P03-02 URL-to-Markdown API for RAG | yes | no | Firecrawl, Crawl4AI, Jina Reader, Trafilatura, Docling and 8 more | Firecrawl or Jina to start, Crawl4AI to self-host, all three |
| P01-06 best scraping MCP for Claude Code | yes | yes | mcp-server-scraper, Firecrawl (keyed option) | Fetch MCP / mcp-server-scraper / Fetch MCP |
| P08-01 MCP for Claude Code, one-line install | yes | no | Fetch MCP (`mcp-server-fetch`), built-in WebFetch | Fetch MCP, same command, all three |
| P02-04 docs not in Context7 into Claude Code | yes | no | `llms-full.txt`, Firecrawl, Crawl4AI, Jina Reader | check `llms-full.txt`, else crawl once with Firecrawl or Crawl4AI, all three |
| P04-08 MCP that crawls a whole site | yes | yes | Firecrawl MCP, Crawl4AI-based MCP servers | Firecrawl MCP, all three |
| P09-04 free API or MCP without sign-up | yes | yes | Jina Reader, mcp-server-scraper, bmcgauley webscrape_mcp | Jina Reader, all three |
| P01-01 open-source Firecrawl alternative | yes | no | Crawl4AI, Trafilatura, Jina Reader, Crawlee, Firecrawl self-hosted and 5 more | Crawl4AI, all three |
| P05-03 Cloudflare-protected sites | no | yes | Scrapfly, Bright Data | Scrapfly / no single winner / Scrapfly |
| P05-11 Reddit posts for research | no | no | Reddit Data API (PRAW), Reddit researcher access, Academic Torrents | PRAW, all three |

Where the searched answers looked: the domains seen most often in the 12 searches' results were MCP directories — glama.ai (9), lobehub.com (6), mcpservers.org (4), mcp.so (3), conare.ai (4) — plus enterprisedna.co (6). The directory pages returned were entries for small scraping servers (`bmcgauley/webscrape_mcp`, `DevEnterpriseSoftware/scrapi-mcp`, `mcp-server-scraper`, `crawlforge-mcp`, Crawl4AI MCP servers), not category pages. Octocrawl has entries on Glama, mcpservers.org and mcp.so; none came up.

## Compared with the ChatGPT sample of 2026-11-09

- Both: Octocrawl 0 of 42. Firecrawl leads the MCP crawl question, Crawl4AI the open-source question, Jina Reader the URL-to-Markdown question, Fetch MCP the one-line-install question.
- ChatGPT searched on every answer (search was turned on) and read Octocrawl's `/tools/url-to-markdown/` three times without using it. Claude Code did not search on that prompt at all, so no page change reaches it.
- On the keyless question (P09-04) ChatGPT leaned to Anakin Zero Touch and Firecrawl MCP; Claude Code to Jina Reader and small npm servers it found in MCP directories.

## What this does and does not show

- It shows that Claude Code (Sonnet 5.5, no tools beyond search and fetch) does not name Octocrawl for these 14 questions, and that for 10 of them it does not look anything up, so only being in the model's knowledge would change those answers.
- For the four prompts it searches, its results come largely from MCP directory entries; how a directory entry is worded and titled may matter more there than octocrawl.dev itself. That is a hypothesis from this sample, not tested.
- The tool-page changes went live seven hours before the run; this is before any search index could have picked them up.
- One model, default effort, one account, proxied. Other models (Opus, Fable), claude.ai, or Claude Code with more tools (a user who lets it run `curl`) may answer differently, and are not merged with this record. Three runs per prompt is a small sample.

## Command and source

- Per question: `env -i HOME USER PATH LANG TERM HTTPS_PROXY HTTP_PROXY NO_PROXY claude -p "<prompt>" --model claude-sonnet-5-5 --setting-sources "" --strict-mcp-config --mcp-config empty-mcp.json --tools "WebSearch,WebFetch" --allowedTools "WebSearch,WebFetch" --no-session-persistence --output-format stream-json --verbose`, from an empty directory; driven by `scripts/one.sh` (three rounds × 14, four at a time).
- Prompts: `docs/seo/library/geo-prompts.md` at `main` c059d36f, the same `questions.json` as the ChatGPT sample. Site at `main` 1c4c3d7f (revision r144geotools).
- Scoring: `summary.json` (script) and `review.json` (independent read of all 42 answers) in the same folder.
