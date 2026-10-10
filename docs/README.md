# Octocrawl documentation

This folder holds Octocrawl's reference, guides, design decisions and dated records. Start with the first table. The [README](../README.md) has the quick start.

## Start here

| Page | What it covers |
| --- | --- |
| [Running Octocrawl](local-setup.md) | Hosted, local and self-hosted servers; MCP clients, ports, tokens, proxies, robots.txt |
| [Command line](cli.md) | The `octocrawl` command, its flags and exit codes |
| [From a URL list to a CSV with evidence](guides/url-list-to-csv.md) | A researcher's run, from the command line and the Python client |
| [Citing web data in a paper](guides/citing-web-data.md) | A methods section and a reference with access date and hash |
| [Onboarding](onboarding.md) | Install, crawl, monitor a source, HTTPS events and recovery |
| [Monitor and Delivery through MCP](mcp-first-use.md) | Monitors and deliveries from an agent |
| [双流程首次使用](dual-flow-first-use.md) | Document Monitor and Amazon.sg product flows on one Mac (Chinese) |

## Reference

| Page | What it covers |
| --- | --- |
| [Scrape options and results](scrape-options.md) | Page options, cache, formats, actions, metadata, agentHints |
| [Batches, crawls and maps](batch-crawl-map.md) | Batch, crawl and map tasks, webhooks, event streams |
| [Persistent URL-array scraping](batch-scrape.md) | `POST /v1/batches` in detail: options, status, items and events |
| [JSON extraction](json-extraction.md) | Structured data from a JSON Schema |
| [Files](files.md) | PDF, CSV, XLSX, ZIP and JSON URLs; PDF text |
| [Access](access.md) | Your login, enhanced access, handoff, your own Chrome |
| [Monitors](monitors.md) | Scheduled re-reads and event delivery |
| [Firecrawl shim](firecrawl-shim.md) | Firecrawl v1 scrape/crawl/map snapshot and diffs |
| [Hosted Octocrawl](hosted-api.md) | The hosted API and the remote MCP endpoint |
| [Public preview](public-preview.md) | The preview at octocrawl.dev and how it is deployed |
| [Public web adapters](public-web-adapters.md) | The contract for site adapters (Amazon, Reddit, X) without platform APIs |
| [自动升级系统](vendor-escalation.md) | The escalation ladder: HTTP, browser, providers, your session, a person (Chinese) |

## Decisions

[ADRs](adr/) record design decisions (in Chinese): [0001 Playwright](adr/0001-direct-playwright.md), [0002 Node.js runtime](adr/0002-node-canonical-runtime.md), [0003 storage interface](adr/0003-storage-behind-interface.md), [0004 anti-bot as a coverage ladder](adr/0004-anti-bot-as-coverage-ladder.md), [0005 enhanced access policy](adr/0005-enhanced-access-policy.md).

## Plans and records

These pages record plans and runs at a date. They are not updated after the fact.

- [Benchmarks](benchmarks/README.md): the fixture suite and the throughput run, with dated results.
- [Phase 3 Benchmark Gate](benchmark-gate.md): comparator versions, evidence contract and blockers.
- [Milestone checklist](roadmap/milestones.md): the checklist the README carried until 2026-10-10.
- [roadmap/](roadmap/): Section A/B/C plans, gate records and stage reviews.
- [Gate 4 independent developer acceptance](independent-developer-acceptance.md): the run sheet for a non-author install.
- [changelog/](changelog/): full release notes too long for [CHANGELOG.md](../CHANGELOG.md).
- [launch/](launch/), [evidence/](evidence/) and [archive/](archive/): launch notes, evidence of past runs, and earlier plans.
- Working task lists: [P2 remaining tasks](p2-remaining-tasks.md), [landing redesign](landing-redesign-tasks.md), the R1 pages (`r1-*.md`) and the [2026-09-30 handover](handover-2026-09-30.md).
