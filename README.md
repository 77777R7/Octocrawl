# Octocrawl — Web-to-LLM Context Extraction

[![npm](https://img.shields.io/npm/v/octocrawl?label=npm%20octocrawl)](https://www.npmjs.com/package/octocrawl) [![PyPI](https://img.shields.io/pypi/v/octocrawl-client?label=PyPI%20octocrawl-client)](https://pypi.org/project/octocrawl-client/) [![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

**[Website](https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=nav)** · **[Docs](https://octocrawl.dev/docs/?utm_source=github&utm_medium=readme&utm_campaign=nav)** · **[Connect MCP](https://octocrawl.dev/docs/connect-mcp/?utm_source=github&utm_medium=readme&utm_campaign=nav)** · **[Blog](https://octocrawl.dev/blog/?utm_source=github&utm_medium=readme&utm_campaign=nav)** · **[Changelog](https://octocrawl.dev/changelog/?utm_source=github&utm_medium=readme&utm_campaign=nav)**

Octocrawl turns web pages into Markdown and data for RAG and agent workflows. It records how it got each page, so every result can be checked.

When a page fails, Octocrawl says so and says why. It does not report a blocked or empty page as a success.

Try it without installing anything at [octocrawl.dev](https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=top), or read the [documentation](https://octocrawl.dev/docs/?utm_source=github&utm_medium=readme&utm_campaign=top).

The web preview reads one page at a time, five a day. Besides Markdown it returns the page's links and metadata, and up to 20 fields read without a model ([how it is deployed](docs/public-preview.md)).

## Quick start

Connect your agent to hosted Octocrawl. No key is needed to start ([steps for Claude Code, Cursor, OpenCode and Codex](https://octocrawl.dev/docs/connect-mcp/?utm_source=github&utm_medium=readme&utm_campaign=top)):

```bash
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp
```

Or run it on your own computer. You need Node.js 22.13+ or 24+:

```bash
npx octocrawl scrape https://example.com --markdown
pip install octocrawl-client      # the Python client of a running API (npx octocrawl serve)
npm install @octocrawl/sdk        # the TypeScript client; @octocrawl/mcp is the MCP server
```

To give your agent every tool, with no daily limit, run the API locally and connect the MCP server to it:

```bash
npx octocrawl serve                                  # keep it running: the API on 127.0.0.1:8787
claude mcp add octocrawl -- npx -y @octocrawl/mcp    # the published stdio server, a client of that API
```

The hosted service offers scrape and map. The local server adds crawl, batch, the Amazon.sg product tool and the Monitor tools. [Running Octocrawl](docs/local-setup.md) covers both, plus hosting a server for others.

## Why this exists

Most crawlers report "success" when they return empty pages, challenge screens or the wrong content. Octocrawl makes failure visible and fixable:

**Before (typical crawler):**
```
✓ Fetched example.com/article
  Status: 200 OK
  Content: 953 bytes
```

**After (Octocrawl):**
```
✗ Fetched example.com/article
  Status: blocked (cloudflare_challenge)
  Lane: http → escalated to browser_local
   Evidence: artifacts=[] (no screenshot or DOM snapshot was produced)
  Cost: 847 tokens, 2.3s, $0.0042
  Fix: needs user login or proxy (tier 1b/2)
```

## What's different

1. **Failure is a result.** A page is `empty_verified`, `blocked` or `failed` with a reason, never a silent empty page. An error page keeps its status and Markdown as evidence, not as a success. [Details](docs/scrape-options.md#failure-results).
2. **Five false-success checks.** Octocrawl checks for challenge text, wrong-page content, missing facts, truncation and too little content.
3. **Execution ladder.** A request moves from HTTP to a browser, then to your login or a proxy, as needed. Each attempt is traced, and the task's cost is counted.
4. **Ground-truth benchmark.** A 56-case fixture suite (soft 404s, challenge pages, SPAs, timeouts, zip bombs, tables) measures the false-success rate.
5. **Honest evidence.** An unknown value is null, not zero. `artifacts: []` means no screenshot or DOM snapshot was made. `bytesWire: null` means wire bytes were not measured.
6. **One Evidence Record.** Every scrape result, batch item and crawl page carries an `evidenceRecord`. It holds the final URL, redirects, fetch time, status, lane, robots.txt decision, hashes and field evidence. A versioned [JSON Schema](packages/contracts/schemas/evidence-record.v1.json) describes it; see the [reference](apps/public-web/content/reference.md#evidence-record).

## Documentation

The site's docs at [octocrawl.dev/docs](https://octocrawl.dev/docs/?utm_source=github&utm_medium=readme&utm_campaign=quick-start) cover MCP setup for four clients, task guides and limits. They are built from [apps/public-web/content](apps/public-web/content/introduction.md).

The full reference lives in [docs/](docs/README.md):

| Topic | Page |
| --- | --- |
| The `octocrawl` command | [Command line](docs/cli.md) |
| Hosted, local and self-hosted servers, ports, tokens, proxies, robots.txt | [Running Octocrawl](docs/local-setup.md) |
| Options for a scrape and what a result carries | [Scrape options and results](docs/scrape-options.md) |
| Many URLs, whole sites, site maps, webhooks | [Batches, crawls and maps](docs/batch-crawl-map.md) |
| Structured data from a JSON Schema | [JSON extraction](docs/json-extraction.md) |
| PDF, CSV, XLSX, ZIP and JSON URLs | [Files](docs/files.md) |
| Your login, enhanced access, handoff, your own Chrome | [Access](docs/access.md) |
| Scheduled re-reads and HTTPS events | [Monitors](docs/monitors.md) |
| Moving from Firecrawl | [Firecrawl shim](docs/firecrawl-shim.md) |

Walkthroughs of real runs are on the [blog](https://octocrawl.dev/blog/?utm_source=github&utm_medium=readme&utm_campaign=docs): [Claude Code web scraping with MCP](https://octocrawl.dev/blog/claude-code-web-scraping/?utm_source=github&utm_medium=readme&utm_campaign=docs), [Web scraping for RAG](https://octocrawl.dev/blog/web-scraping-for-rag/?utm_source=github&utm_medium=readme&utm_campaign=docs), [Find all pages on a website](https://octocrawl.dev/blog/find-all-pages-on-a-website/?utm_source=github&utm_medium=readme&utm_campaign=docs), [Scrape a website with login, in your own Chrome](https://octocrawl.dev/blog/scrape-website-with-login/?utm_source=github&utm_medium=readme&utm_campaign=docs), [Extract structured data without an LLM](https://octocrawl.dev/blog/extract-structured-data-from-web-page/?utm_source=github&utm_medium=readme&utm_campaign=docs), [Scrape a list of URLs and keep every failure](https://octocrawl.dev/blog/scrape-list-of-urls/?utm_source=github&utm_medium=readme&utm_campaign=docs).

For researchers, two guides walk through a real run: [From a URL list to a CSV with evidence](docs/guides/url-list-to-csv.md) and [Citing web data in a paper](docs/guides/citing-web-data.md).

For the Monitor → result → HTTPS event → restart workflow, follow [the onboarding guide](docs/onboarding.md).

## Work on the code

You need Node.js 22.13+ or 24+ and npm. The PDF engine, pdf.js, needs 22.13 or later.

```bash
git clone https://github.com/77777R7/Octocrawl.git
cd Octocrawl
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run scrape -- https://example.com --markdown
npm run crawl -- https://example.com --max-pages 20
```

The packages are published from this repository. Each week the `Install check` workflow runs the `npx` line from an empty cache on macOS, Windows and Linux.

## Names: Octocrawl and `w2l`

The product is called Octocrawl. Its earlier working name was W2L (Web-to-LLM).

Some identifiers still use the old name. They stay until a change renames them on purpose, because renaming them breaks existing setups and records:

- environment variables such as `W2L_API_PORT` and `W2L_TASK_ROOT`;
- the data directory `.w2l/`;
- the internal workspace packages `@w2l/*` and the checkout's `w2l` command (`npm run w2l`);
- the SDK classes `W2L` and `W2LError`;
- the Evidence Record version `w2l.evidence/1`;
- the research identity `w2l-research`, which sites' robots.txt can name.

The published packages already use the new name: `octocrawl`, `@octocrawl/*` and `octocrawl-client`. The full list is in [AGENTS.md](AGENTS.md#naming).

## Benchmark

Run the fixture suite against the bare HTTP baseline:

```bash
npm run bench
```

The bare HTTP baseline has a high false-success rate on purpose. It has no content extraction, challenge detection or redirect handling. [Benchmarks](docs/benchmarks/README.md) shows the expected output and the throughput and crash-recovery run.

## Repository structure

```
packages/
  contracts/       TypeScript types and ground-truth schema (MIT)
  fixtures/        HTTP server with 56 ground-truth test cases
  http-core/       robots.txt parser (ReDoS-resistant)
  extract-tf/      Content extraction, HTML → Markdown, PDF text
  runtime/         TaskStore, frontier, bounded crawl orchestrator
  bench/           Benchmark runner, ladder CLI (w2l-ladder), scoring
  cli/             octocrawl: scrape, crawl, batch, map, serve (AGPL)
  api/             REST server (AGPL)
  sdk/             TypeScript client (MIT)
  mcp/             stdio and restricted Streamable HTTP MCP server (AGPL)
  public-preview/  Server for the public preview at octocrawl.dev

apps/public-web/   The octocrawl.dev site and its docs pages
python/            Python client octocrawl-client (MIT)
examples/          Runnable Monitor + Delivery workflow and webhook receiver
docs/              Reference, guides, ADRs and dated records (index: docs/README.md)
ROADMAP.md         The current phase and what is paused
CHANGELOG.md       Release notes
```

## Roadmap

[ROADMAP.md](ROADMAP.md) starts with a summary of the current phase. The earlier milestone checklist is in [docs/roadmap/milestones.md](docs/roadmap/milestones.md).

## Contributing

We use the [Developer Certificate of Origin (DCO)](https://developercertificate.org/) instead of a CLA. Every commit needs a `Signed-off-by` line:

```bash
git commit -s -m "Your commit message"
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details, including how to write docs.

## License

Server-side code, the CLI (`@octocrawl/cli`, `octocrawl`) and the MCP server (`@octocrawl/mcp`): [AGPL-3.0](LICENSE)  
Client libraries: MIT: the TypeScript SDK (`@octocrawl/sdk`, which includes the workspace's `@w2l/contracts`, also MIT) and the Python client (`octocrawl-client`)

See [PHASE1_ENGINEERING_NOTES.md §1.3](docs/archive/PHASE1_ENGINEERING_NOTES.md) for the rationale.

## Why AGPL?

AGPL requires network-deployed modifications to remain open. Anyone can fork, modify, and host Octocrawl — as long as they share those modifications. The real differentiator is the name (trademark) and the hosted service, not the license lock.
