<p align="center">
  <a href="https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=logo">
    <img src="apps/public-web/public/assets/octopus-original.webp" alt="Octocrawl" width="180">
  </a>
</p>

<h1 align="center">Octocrawl</h1>

<p align="center">
  <b>One link. Web data, ready.</b><br>
  Markdown and data from web pages, for AI agents and RAG.<br>
  Every result records how it was read. Every failure says why.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/octocrawl"><img src="https://img.shields.io/npm/v/octocrawl?label=npm%20octocrawl&color=f3683d" alt="npm"></a>
  <a href="https://pypi.org/project/octocrawl-client/"><img src="https://img.shields.io/pypi/v/octocrawl-client?label=PyPI%20octocrawl-client&color=f3683d" alt="PyPI"></a>
  <a href="https://www.npmjs.com/package/octocrawl"><img src="https://img.shields.io/npm/dm/octocrawl?color=071b4f" alt="npm downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-071b4f" alt="License: AGPL-3.0"></a>
  <a href="https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=badge"><img src="https://img.shields.io/badge/try%20it-octocrawl.dev-f3683d" alt="Try it at octocrawl.dev"></a>
</p>

<p align="center">
  <a href="https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=nav"><b>Website</b></a> ·
  <a href="https://octocrawl.dev/docs/?utm_source=github&utm_medium=readme&utm_campaign=nav"><b>Docs</b></a> ·
  <a href="https://octocrawl.dev/docs/connect-mcp/?utm_source=github&utm_medium=readme&utm_campaign=nav"><b>Connect MCP</b></a> ·
  <a href="https://octocrawl.dev/blog/?utm_source=github&utm_medium=readme&utm_campaign=nav"><b>Blog</b></a> ·
  <a href="https://octocrawl.dev/changelog/?utm_source=github&utm_medium=readme&utm_campaign=nav"><b>Changelog</b></a>
</p>

---

Try it without installing anything at [octocrawl.dev](https://octocrawl.dev/?utm_source=github&utm_medium=readme&utm_campaign=top). The web preview reads one page at a time, five a day. Besides Markdown it returns the page's links and metadata, and up to 20 fields read without a model ([how it is deployed](docs/public-preview.md)).

If Octocrawl is useful to you, [star the repository](https://github.com/77777R7/Octocrawl); it helps other people find it.

## Why Octocrawl?

- **In your agent in one line:** a hosted MCP server for Claude Code, Cursor, OpenCode and Codex. No key is needed to start.
- **Failure is a result:** a page comes back `blocked`, `failed` or `empty_verified` with a reason, never as an empty success. An error page keeps its status and Markdown as evidence ([details](docs/scrape-options.md#failure-results)).
- **Five false-success checks:** challenge text, wrong-page content, missing facts, truncation and too little content.
- **An Evidence Record on every page:** final URL, redirects, fetch time, status, lane, robots.txt decision, hashes and field evidence, described by a versioned [JSON Schema](packages/contracts/schemas/evidence-record.v1.json) ([reference](apps/public-web/content/reference.md#evidence-record)). An unknown value is null, not zero.
- **Escalates only when it must:** HTTP first, then a browser, then your login or a proxy. Each attempt is traced and the task's cost is counted.
- **Measured against ground truth:** a 56-case fixture suite (soft 404s, challenge pages, SPAs, timeouts, zip bombs, tables) measures the false-success rate.
- **Open source, runs anywhere:** the server, CLI and MCP server are AGPL-3.0; the TypeScript, Python and Vercel AI SDK clients are MIT. Run it with `npx`, self-host it with [Docker Compose](docs/self-host-docker.md), or move over from Firecrawl with the [shim](docs/firecrawl-shim.md).

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
npm install @octocrawl/ai-sdk     # scrape and map as Vercel AI SDK tools, on hosted Octocrawl by default
```

To give your agent every tool, with no daily limit, run the API locally and connect the MCP server to it:

```bash
npx octocrawl serve                                  # keep it running: the API on 127.0.0.1:8787
claude mcp add octocrawl -- npx -y @octocrawl/mcp    # the published stdio server, a client of that API
```

The hosted service offers scrape and map. The local server adds crawl, batch, the Amazon.sg product tool and the Monitor tools. [Running Octocrawl](docs/local-setup.md) covers both, plus hosting a server for others; [Docker Compose](docs/self-host-docker.md) runs one on your own server. An agent installing Octocrawl for you (Cline, for one) can follow [llms-install.md](llms-install.md).

## What a failure looks like

The test page below answers HTTP 200 but shows a Cloudflare check instead of content (fixture `block-challenge-200`). A crawler that trusts the status code counts it as a success. Octocrawl tries plain HTTP, then a browser, and reports the page as blocked, with what to do next:

```bash
npx octocrawl scrape http://127.0.0.1:8799/block/challenge-200
```

```jsonc
{
  "status": "blocked",
  "blockReason": "cloudflare_challenge",
  "channelsTried": ["http", "browser_local"],
  "markdown": null,
  "snapshot": { "httpStatus": 200, "artifacts": [] },
  "usage": { "wallMs": 1079, "bytesWire": null, "externalCostUsd": 0 },
  "agentHints": [
    "127.0.0.1 gates automated access on the lanes tried (http, browser_local); … a proxy or session you own is the supported route, or, on your own machine, getting through the check yourself in your own Chrome: handoff: true on a scrape (octocrawl scrape --handoff) …"
  ],
  "evidenceRecord": { "schemaVersion": "w2l.evidence/1", "status": "blocked", "reason": "cloudflare_challenge", "lane": "browser_local", "…": "…" }
}
```

This is real output of `octocrawl` 0.4.1, trimmed (`…`) and rounded, against the repository's fixture server (`FIXTURE_PORT=8799 node --import tsx packages/fixtures/src/cli.ts`). `bytesWire: null` means wire bytes were not measured; `artifacts: []` means no screenshot or DOM snapshot was made.

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
  ai-sdk/          scrape and map as Vercel AI SDK tools (MIT)
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
Client libraries: MIT: the TypeScript SDK (`@octocrawl/sdk`, which includes the workspace's `@w2l/contracts`, also MIT), the AI SDK tools (`@octocrawl/ai-sdk`, which include the SDK) and the Python client (`octocrawl-client`)

See [PHASE1_ENGINEERING_NOTES.md §1.3](docs/archive/PHASE1_ENGINEERING_NOTES.md) for the rationale.

## Why AGPL?

AGPL requires network-deployed modifications to remain open. Anyone can fork, modify, and host Octocrawl — as long as they share those modifications. The real differentiator is the name (trademark) and the hosted service, not the license lock.
