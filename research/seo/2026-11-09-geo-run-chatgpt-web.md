# ChatGPT answer sample, 2026-11-09

Task M6 of the GEO task list (`docs/geo-tasks.md`, PR #911): what ChatGPT answers when a person asks the questions that should lead to Octocrawl, before any change to the site. This record is the baseline that later changes are compared with.

## How it was collected

| Item | Value |
| --- | --- |
| When | 2026-11-09, 16:08 to 17:36 UTC (round 1 16:08–16:35, round 2 16:41–17:06, round 3 17:09–17:36) |
| Where | ChatGPT macOS app ("ChatGPT", bundle `com.openai.codex`), Chat mode, signed in to Howard's account |
| Who asked | An agent session driving the app through Computer use (background window control), one prompt at a time, at Howard's request. This is an exception to rule 5 of `docs/seo/library/geo-protocol.md`, recorded as decision G-17 in PR #911 |
| Chat settings | A new Temporary chat for every prompt; per-chat "Unpersonalized" ("This chat will ignore memory, plugins, and custom instructions"), confirmed before each send; no account setting was changed |
| Model | Not shown in the app. Composer setting "Thinking effort: Medium" |
| Web search | Turned on by hand ("+" → Web search) for every prompt; every answer had web sources. A person on default settings may get answers without a search, so these results describe search-on answers only |
| Network egress | Unknown (Howard's Mac; whether a proxy was in use was not recorded) |
| Questions | 14 prompts from `docs/seo/library/geo-prompts.md` v0.0.1 at `main` c059d36f, unchanged, no brand names: 6 tool questions, 6 developer questions, 2 that should not lead to Octocrawl. 11 are in the core set; P04-02, P04-07 and P03-03 are not, and were added because ChatGPT visitors land on the matching tool pages |
| Runs | 3 per prompt, 42 answers, no errors, no retries |
| Capture | Answer text and source URLs read from the app's accessibility tree, read-only. List numbers and bold are lost. Rounds 2 and 3 record the Sources panel in two parts, "Cited" (top) and "More" (read, listed below); round 1 has no split |
| Scoring | Script tally, then an independent agent read all 42 answers, scored them and corrected the tally (25 corrections, all applied below) |

Raw answers, sources, the tally and the review are outside the repository in `.w2l/seo/geo-runs/2026-11-09-chatgpt-web/` (archived copy under `~/Code/w2l/.w2l/seo/geo-runs/`).

## Results

**Octocrawl was named in 0 of 42 answers and cited in 0 of 42.**

| Measure | Result | 95% interval (Wilson) |
| --- | --- | --- |
| Named, on the 11 "should mention" prompts | 0 / 33 | 0 to 10.4% |
| Named, "should mention" plus the 1 conditional prompt | 0 / 36 | 0 to 9.6% |
| octocrawl.dev cited in the answer | 0 / 42 | 0 to 8.4% |
| Named on the 2 "should not mention" prompts (overclaiming) | 0 / 6 | 0 to 39.0% |
| octocrawl.dev read but not cited (in the Sources panel only) | 4 / 42 | — |

The four answers where ChatGPT read an Octocrawl page and did not use it:

| Prompt | Round | Page | Where |
| --- | --- | --- | --- |
| P03-01 URL to clean Markdown | 1 | `/tools/url-to-markdown/` | Sources panel, entry 11 of 36; not in either citation pill or any inline link (round 1 has no section split) |
| P03-01 | 2 | `/tools/url-to-markdown/` | "More" |
| P03-01 | 3 | `/tools/url-to-markdown/` | "More" |
| P04-02 subpages and subdomains | 3 | `/blog/find-all-pages-on-a-website/` | "More" |

What ChatGPT recommended instead (tools named in all three runs, and the first recommendation in each run):

| Prompt | Should mention | Named in all 3 runs | First pick, rounds 1 / 2 / 3 |
| --- | --- | --- | --- |
| P04-01 find all pages of a site | yes | Screaming Frog SEO Spider | XML sitemap plus a Python script, all three |
| P04-02 subpages and subdomains | conditional | Screaming Frog SEO Spider, Subfinder, Amass | Screaming Frog + Subfinder, all three |
| P04-07 API that returns a domain's URLs | yes | Firecrawl Map, Apify Website Content Crawler | Firecrawl Map, all three |
| P03-01 URL to clean Markdown | yes | Jina Reader, Browser Use Website to Markdown | Jina Reader / Jina Reader / markdown.new |
| P03-03 page to plain text | yes | Jina Reader, Trafilatura, browser Reader Mode | Jina Reader / Jina Reader / Synapsi Website Text Extractor |
| P03-02 URL-to-Markdown API for RAG | yes | Crawl4AI, Firecrawl, Jina Reader, Docling | Crawl4AI, all three |
| P01-06 best scraping MCP for Claude Code | yes | Firecrawl MCP, Playwright MCP | Firecrawl MCP, all three |
| P08-01 MCP for Claude Code, one-line install | yes | Fetch MCP (`mcp-server-fetch`) | Fetch MCP, all three; no other tool named |
| P02-04 docs not in Context7 into Claude Code | yes | Firecrawl | Firecrawl CLI / Firecrawl Claude Code plugin / `llms-full.txt`, else Crawl4AI |
| P04-08 MCP that crawls a whole site | yes | Firecrawl MCP, Crawl4AI MCP, Apify, MCPDocSearch | Firecrawl MCP, all three |
| P09-04 free API or MCP without sign-up | yes | Jina Reader, Anakin Zero Touch, cors.dev proxy | Anakin Zero Touch / Firecrawl MCP / Anakin Zero Touch |
| P01-01 open-source Firecrawl alternative | yes | Crawl4AI, Trafilatura, Jina Reader, Crawlee | Crawl4AI, all three |
| P05-03 Cloudflare-protected sites | no | Zyte API, Bright Data Web Unlocker, Oxylabs, Scrapfly | Zyte API / Bright Data / Bright Data |
| P05-11 Reddit posts for research | no | Reddit for Researchers, Apify | Reddit for Researchers, all three |

Domains cited most often across the 42 answers (round 1 counts every source; rounds 2 and 3 count the "Cited" part only): github.com 30, jina.ai 14, firecrawl.dev 9, apify.com 9, docs.crawl4ai.com 8, elastic.co 7, screamingfrog.co.uk 6, trafilatura.readthedocs.io 6. Third-party list and guide pages among the sources of the developer prompts (cited in rounds 2 and 3, or listed in round 1): aiteamguide.com (P01-06, all 3 runs), anakin.io and cors.dev (P09-04, all 3 runs), alion.io (P04-08 and P09-04), taku.ai (P01-01, 2 runs), agenttooldrop.com, mcpharbor.app and claudemarket.ai (P01-06, 1 run each).

## What this does and does not show

- It shows that, for these 14 prompts asked this way, ChatGPT with web search does not put Octocrawl in its answers, and that for "URL to Markdown" it retrieves Octocrawl's tool page every time and leaves it out.
- It does not explain the ChatGPT visitors the site already gets (32 of 92 page views in the week to 2026-11-08, mostly on `/tools/link-extractor/`). None of the "find all pages" prompts here surfaced that page; those visitors come from prompts not in this sample, or from answers with different settings. Which prompts they are is unknown.
- Three runs per prompt is a small sample (protocol §3); single prompts can swing. The intervals above are for the pooled counts.
- One account, unpersonalized but signed in; model not shown; Medium thinking with search forced on; egress unknown. Answers from the API, from logged-out users or from default settings may differ, and are not merged with this record.

## Command and source

- Prompts: `docs/seo/library/geo-prompts.md` at `main` c059d36f; the 14 chosen are listed in `.w2l/seo/geo-runs/2026-11-09-chatgpt-web/questions.json`.
- Collection: three agent runs (one per round) using Computer use background tools and read-only accessibility scripts; scripts archived with the raw data.
- Scoring: `tally.md` (script) and `review.json` / `review.md` (independent read of all 42 answers) in the same folder.
