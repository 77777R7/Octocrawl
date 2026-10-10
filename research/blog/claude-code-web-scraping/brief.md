# Brief: claude-code-web-scraping

- **Query**: `claude code web scraping` · market en-US · desktop · checked 2026-10-10
- **Primary task**: let Claude Code read web pages (and whole sites) from a terminal session, and get answers it can source.
- **Adjacent questions**: does Claude Code have web access built in (WebFetch/WebSearch)? how do I add an MCP server for scraping? how do I make Claude cite where a fact came from? what happens when a page blocks it? how many pages can it read free?
- **content_boundary**: install command and scopes, a real task with its tool calls, how to ask for sources, limits (allowance, blocks), local server for more.
- **must_not_cover** (one line + link): RAG chunking (→ web-scraping-for-rag), finding every URL (→ find-all-pages-on-a-website), pages behind your login (→ scrape-website-with-login).
- **Canonical check**: replaces `/docs/guides/claude-code-web-access/` (same task) → **update + move**, 301 from the old URL. `/docs/connect-mcp/` covers every client's setup (adjacent intent, links here).

## Demand

Autocomplete for "claude code web scraping": claude code web scraping · … skill · … mcp · claude code website scraping · claude code web scraper · can claude code web scrape · using claude code for web scraping. Related: "claude code mcp web fetch", "claude code access internet", "claude code fetch 403". Volume and KD: unknown.

## Top 5 (Google, 2026-10-10)

| # | URL | Type | Words | H2s | Tables / code / images | Date | JSON-LD |
|---|---|---|---|---|---|---|---|
| 1 | claude.com/marketplace/plugins/firecrawl | marketplace listing | 354 | "Other plugins" | 0 / 0 / 0 | none | (blocked by tool) |
| 2 | reddit.com/r/ClaudeAI/… "Why does Claude struggle with basic web scraping?" | forum | not audited (browser policy) | | | | |
| 3 | mcpmarket.com/tools/skills/intelligent-web-scraper-1 | skill listing | 413 | Key Features, Use Cases | 0 / 0 / 0 | none | SoftwareApplication, BreadcrumbList, FAQPage |
| 4 | decodo.com/blog/claude-web-scraping | tutorial | 4,268 | TL;DR, two approaches, Claude vs ChatGPT, proxies, FAQ | 0 / 6 / 0 | Jan 06, 2026 | BlogPosting, FAQPage |
| 5 | ultimatewebscraper.com/claude | product page | 1,489 | Connect in 3 steps, tools, scale, how to connect, FAQ | 0 / 0 / 13 | none | FAQPage, WebApplication |

## Gaps

- No result shows a real Claude Code session: which tool it called, with what arguments, and what came back.
- None shows how to make the answer checkable (the page's final URL and fetch time), which is what stops an agent from inventing a source.
- The two listings are thin; the tutorial is long and generic (Claude, not Claude Code) and ends on proxies.
- Nobody says what happens when a page is blocked or the allowance runs out.

## Product Connection Contract

| Field | Answer |
|---|---|
| Search problem | Give Claude Code a web tool whose answers can be traced. |
| Product position | Octocrawl is the tool layer Claude Code calls over MCP (hosted or local). |
| Placement | Right after the install command, then the real run. |
| Reader value | One command, no account; each answer carries the page's URL, fetch time and robots decision. |
| Not a fit | Pages behind a login on the hosted server (needs your own Chrome, locally); bulk crawling on hosted (local only); Claude's built-in WebFetch is enough for a quick read with no need for sources. |
| Evidence and link | Run below; links to /docs/connect-mcp/ and /blog/find-all-pages-on-a-website/. |

## Claims to verify (first-party)

1. `claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp` adds the server (help text of the installed Claude Code; init event shows `connected`).
2. A real task: tools called, arguments, results, final answer, time and turns (stream-json transcript).
3. Every scrape answer carries `evidenceRecord.finalUrl` and `fetchedAt` (compact and debug).
4. Keyless allowance 20/day per address; over it the tool says when it resets.

Existing run: 2026-10-09 17:39 UTC, Claude Code 2.1.295, Opus 5.5, 5 turns, 25 s (`scratchpad/cc-run`). Needs a fresh run kept in `research/blog/claude-code-web-scraping/` with its transcript.

## Visual plan

- Screenshot 1: the Claude Code terminal session showing the `map` and `scrape` tool calls (real run).
- Screenshot 2: the answer with the cited final URL and fetch time.
- Cover: lighthouse.

## Beat the top 5

Show the whole loop with real output (none do), make sources a first-class step, state limits and the non-fit case.
