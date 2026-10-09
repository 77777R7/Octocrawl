# Octocrawl vs Firecrawl

Both are open-source tools that turn web pages into Markdown and JSON for AI agents, and both are licensed under the AGPL-3.0. They differ in what they promise about a result. Firecrawl offers a large paid cloud with web search, an AI agent and prompt-based extraction. Octocrawl records where every page and value came from, reports a page it could not read as a failure, and runs in full on your own computer for free.

Firecrawl's prices and features below were read from its [pricing page](https://www.firecrawl.dev/pricing) and [documentation](https://docs.firecrawl.dev/) on 7 October 2026. They change, so check the links before you decide.

## The short answer

Choose **Firecrawl** if you need web search, an agent that browses for you, extraction from a prompt, many SDK languages, or a paid cloud that handles high volume today.

Choose **Octocrawl** if you need to show where your data came from, want blocked and empty pages reported as failures instead of content, or want page actions, screenshots and browser rendering on your own computer at no cost.

## At a glance

| | Octocrawl | Firecrawl |
|---|---|---|
| Licence | AGPL-3.0 for the server, CLI and MCP server; MIT for the TypeScript SDK and Python client | AGPL-3.0; MIT for the SDKs |
| On your computer | `npx octocrawl` with Node.js 22.13 or later. Browser rendering, page actions and screenshots are included once Chromium is installed | Self-hosted with Docker. Screenshots and page actions need Fire-engine, which is not included |
| Hosted service | Scrape and map at `api.octocrawl.dev` and `mcp.octocrawl.dev`: 20 pages a day without a key; keys are free on request. Nothing is for sale yet | Free plan with 1,000 credits a month, no card. Paid plans from $19 a month (Hobby, 5,000 credits) to $749 a month (Scale, 1,000,000 credits), billed monthly |
| Scrape, map, crawl, batch | Scrape and map hosted; crawl and batch on your computer | All four in the cloud |
| Web search | No | Yes |
| AI agent, prompt extraction, summaries | No | Yes |
| JSON extraction | From a JSON Schema, read from JSON-LD, microdata, meta tags, tables and page text without a model, so the same page gives the same answer | From a schema or a prompt, with a model; 5 credits a page |
| Where a value came from | Every result carries an evidence record: final URL, redirects, fetch time, robots.txt decision, and SHA-256 hashes of the page and the output. Each JSON field names its source, such as `table[0] tr[3] "UPC"` | Source URL, final URL and status code for each page; no content hashes, robots.txt decision or per-field source in the documentation we read |
| Pages that can't be read | Challenge pages, error pages and empty pages are failures with a reason | A page with an error status such as 403 or 404 is returned and costs 1 credit |
| Formats | Markdown, HTML, raw HTML, links, images, attributes, screenshot, tables as CSV, JSON, lists of repeated items | Markdown, summary, HTML, raw HTML, links, screenshot, JSON, images, branding, change tracking, audio, video and more |
| Page actions | Wait, click, type, press, scroll, screenshot, run JavaScript; also scroll to the end, load more and follow pagination, each reporting why it stopped (on your computer) | Up to 50 actions a request |
| Blocked pages | Plain HTTP, then Chromium. No CAPTCHA solving; you can clear a CAPTCHA or log in yourself in your own Chrome and let Octocrawl read the page | Managed proxies with automatic retry on a block |
| robots.txt | Read and recorded for every URL. On your computer a URL you name is fetched even where robots.txt disallows it, and the result records that; links a crawl or map finds obey it unless you turn that off. The hosted service obeys it for every URL | Respected by default; ignoring it on a crawl is Enterprise only |
| MCP | Hosted URL (scrape, map) and a local server with crawl, batch and logins | Hosted MCP server, keyless to start, and a local server |
| SDKs | TypeScript, Python client, CLI | Python, Node, Go, Java, Ruby, Rust, .NET, PHP, Elixir, CLI |

## When Firecrawl is the better choice

- You need to search the web, not only read pages you already have.
- You want an agent to find data from a prompt, or a summary of a page.
- You need a paid cloud for large volumes today, with SOC 2 and support plans.
- You work in Go, Java, Ruby, Rust, .NET, PHP or Elixir, or connect through Zapier, Make or n8n.
- You want proxies managed for you when a site blocks plain requests.

## When Octocrawl is the better choice

- **You have to cite your data.** Research, journalism, compliance and price tracking need to show which page a number came from and when. Octocrawl's evidence record answers that for every result, and you can check that a Markdown file is the one Octocrawl delivered by comparing its hash.
- **You don't want silent failures.** A challenge page, a login wall or an empty page comes back as a failure with its reason, not as content your pipeline stores as data.
- **You want everything on your own computer.** The local version is free and unmetered, and includes browser rendering, page actions, screenshots, crawls, batches that resume after a crash, and webhooks.
- **You want extraction without model costs.** JSON fields are read from the page's own markup, so there is no token bill and no invented value. A field the page does not state is `null` with a reason.

## Moving from Firecrawl

Octocrawl's local server answers Firecrawl v1 clients at `http://127.0.0.1:8787/fc`, for `POST /v1/scrape`, `POST /v1/crawl`, `GET /v1/crawl/:id` and `POST /v1/map`. It is a migration aid, not a full replacement:

- Search, extract, agent and batch scrape have no `/fc` route.
- The `json` format and `location` are refused by name rather than ignored.
- `creditsUsed` is `null`, and a page that could not be read is `success: false`.
- The hosted service does not serve `/fc`; run it with `npx octocrawl serve`.

The [advanced reference](/docs/reference/) lists every option and error.

## Try it

Paste a public URL on the [home page](/) to see a result with its evidence, or connect your agent with the steps in [Connect MCP](/docs/connect-mcp/).
