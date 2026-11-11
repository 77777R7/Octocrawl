# Tokens an agent receives for one docs page after the compact MCP scrape answer (2026-11-11)

**Question.** The same day's record (`2026-11-11-token-cost-docs-aa4c873b.md`, PR #958) found Octocrawl's MCP answers 35% larger than the reference Fetch MCP's for about the same Markdown, the difference being the answer's envelope. Commits `174f8913` and `86c9c676` answer an MCP `scrape` without the parts an agent does not read (CHANGELOG, Unreleased). This record reads the same 20 pages again, with the same five arms, to see what changed.

## Run

- Source: branch `claude/mcp-slim-answer` at `86c9c676` (from `origin/main` `69f5c27c`), compiled with `npx tsc --build`, local API restarted from it. `npm test` passed at this commit (380 files, 4,812 tests).
- Scripts: `research/benchmarks/token_cost/` as on PR #958's branch at `611a910a` (the same files, copied into this checkout for the run and not committed here). Same frozen 20 URLs.
- Command, from the repository root:

```bash
node research/benchmarks/token_cost/run.mjs --out .w2l/benchmarks/token-cost-2026-11-11-slim --proxy http://127.0.0.1:7890 --playwright-mcp 0.0.83 --fetch-mcp 2026.10.24 --fetch-allow-private-ips
TIKTOKEN_CACHE_DIR=.w2l/tiktoken-cache .w2l/pyenv/bin/python research/benchmarks/token_cost/count.py .w2l/benchmarks/token-cost-2026-11-11-slim --json .w2l/benchmarks/token-cost-2026-11-11-slim/count.json
```

- 2026-11-11 13:36:25 to 13:54:05 UTC. Proxied through 127.0.0.1:7890 (Clash, fake-IP DNS), as the first record. All 20 pages succeeded in every arm; Octocrawl answered `success` on all 20.
- A run at `174f8913` was stopped at page 9 when a review found four signals that commit dropped (fixed in `86c9c676`); it is kept as `.w2l/benchmarks/token-cost-2026-11-11-slim-stopped-before-review-fixes` and not used.
- Tokens: tiktoken `o200k_base` 0.12.0, not Claude's tokenizer (Claude counts unknown). No paid service was called.

## Results (sums over the 20 pages)

| Arm | Before (aa4c873b run) | After (86c9c676 run) |
|---|---:|---:|
| Raw HTML | 3,575,442 | 3,576,629 |
| Rendered HTML | 3,707,488 | 3,698,209 |
| Fetch MCP | 181,747 | 181,747 |
| Playwright MCP (answer + snapshot) | 547,262 | 547,832 |
| **Octocrawl, all answers** | 244,783 | 219,014 |
| Octocrawl, first answers | 159,289 | 149,893 |
| Octocrawl Markdown alone | 189,405 | 189,405 |
| Octocrawl answers read | 31 | 29 |

| Octocrawl, all answers, against | Before: total / median page | After: total / median page |
|---|---:|---:|
| Raw HTML | 0.068 / 0.079 | 0.061 / 0.07 |
| Rendered HTML | 0.066 / 0.078 | 0.059 / 0.07 |
| Playwright MCP | 0.447 / 0.393 | 0.4 / 0.364 |
| Fetch MCP | 1.347 / 1.462 | 1.205 / 1.321 |

Paragraphs kept (heuristic of the first record): Octocrawl 2,296 and the Fetch MCP 2,224 of 2,312 snapshot paragraphs (first record: 2,277 and 2,206 of 2,293); the pages were read again, so the snapshots differ slightly.

## What this shows

1. **Reading the 20 pages to the end through Octocrawl's MCP took 219,014 tokens instead of 244,783, 10.5% fewer**, with the same Markdown (189,405 tokens in both runs) and the same share of the page kept. Two fewer answers were needed (29 against 31): every answer's envelope is smaller and a read-on carries no record, so more of the 50,000-character budget goes to the page.
2. **Against the page's HTML, about 6%; against Playwright MCP 0.0.83's snapshot, about 40%; against the reference Fetch MCP, 1.21 times** (1.35 before). Octocrawl's Markdown alone is 4% over the Fetch MCP's whole answers and keeps more of the page; what remains is the JSON escaping of the Markdown and the record a citation needs.
3. The projection made before the change (13% fewer, from the first record's files) was not reached: the review kept the snapshot, the lanes tried, the verdict's null fields, usage's counts and cost, and the cache, login and document-match signals.

## Limits

- As the first record: 20 documentation pages, one proxied run each, o200k counts, a heuristic for what was kept.
- Only the default answer was measured: `debug: true` and a `verify` contract still answer the whole result.
- Whether a client hands the model the text or `structuredContent` was not checked; both carry the same object.

