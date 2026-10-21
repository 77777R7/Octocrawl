# Hosted crawl and batch jobs: give your agent a whole site as Markdown

Your agent can now hand Octocrawl a whole documentation section or a list of URLs and get every page back as clean Markdown, without running a server. Hosted crawl and batch jobs run on Octocrawl's servers, on your account's credits: a crawl reads up to 500 pages of a site, a batch up to 1,000 URLs, and each page comes with its Evidence Record.

On 2026-10-21 we asked Claude Code to crawl a section of the MCP specification through the hosted server and tell us which JSON-RPC methods each page defines. It started the job, waited 10 seconds, read all 7 pages in two calls and answered. The run is below.

## What can an agent hand to hosted Octocrawl now?

Before, hosted Octocrawl read one page at a time (`scrape`) or listed a site's URLs (`map`). Crawls and batches ran on your own computer. Now an account runs both on the hosted server:

| Job | What it does | Hosted limit |
| --- | --- | --- |
| `crawl` | Follows links from a start page within its section of the site and reads each page. | 500 pages a job |
| `batch_scrape` | Reads a list of URLs you already have. | 1,000 URLs a job |

A job runs on the server, so it keeps going if the client disconnects. The tools around it read its status (`get_crawl`, `get_batch`), wait for it (`wait_crawl`, `wait_batch`), page through what it read (`get_crawl_pages`, `get_batch_items`) and stop it (`cancel_crawl`, `cancel_batch`). The same jobs are on the REST API as `POST /v1/crawl` and `POST /v1/batches`, with `GET /v1/jobs` to list yours, and in the TypeScript SDK and the Python client.

## What does a hosted crawl look like from Claude Code?

We connected Claude Code (version 2.1.301, with Claude Opus 5.5) to `https://mcp.octocrawl.dev/mcp` with an account's key, turned its own `WebFetch` and `WebSearch` off, and gave it this prompt:

```text
Use Octocrawl's crawl tool on https://modelcontextprotocol.io/specification/2025-11-25/server/ with maxPages 15 and fastMode true. Wait for it with wait_crawl, then read every page with get_crawl_pages. Give me a table of the pages it read: each page's title, URL and the JSON-RPC methods it defines. Then tell me how many pages the job read, how long it took and how many credits it used.
```

It took 6 turns and 30 seconds:

1. `crawl` started the job at once and answered with its `taskId`.
2. `wait_crawl` came back when the job ended: `completed`, 7 pages, 0 failed, 7 credits. The section has 7 pages, so the crawl stopped there, under its limit of 15.
3. `get_crawl_pages` returned the first 4 pages with a cursor, and a second call with that cursor returned the other 3.

Claude's table, as it answered:

| Page | JSON-RPC methods it defines |
| --- | --- |
| [Overview](https://modelcontextprotocol.io/specification/2025-11-25/server) | None (an overview of prompts, resources and tools) |
| [Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts) | `prompts/list`, `prompts/get`; `notifications/prompts/list_changed` |
| [Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) | `resources/list`, `resources/read`, `resources/templates/list`, `resources/subscribe`; `notifications/resources/list_changed`, `notifications/resources/updated` |
| [Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | `tools/list`, `tools/call`; `notifications/tools/list_changed` |
| [Pagination](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/pagination) | None of its own: it adds `cursor` and `nextCursor` to the list methods |
| [Completion](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/completion) | `completion/complete` |
| [Logging](https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging) | `logging/setLevel`; `notifications/message` |

The job ran from 19:02:02 to 19:02:11 UTC, about 10 seconds for 7 pages.

## Why does Markdown matter for an agent?

Because the agent pays for every character it reads. The 7 pages above are about 3.2 MB of HTML as the site serves them, mostly navigation, scripts and styling. Octocrawl returned 41,254 characters of Markdown for the same pages: the headings, text, tables and code the specification is made of. That is what fits in Claude's context with room left to think, and why two `get_crawl_pages` calls were enough.

## How do you know each page is what the site served?

Every page in a job carries the same Evidence Record a single `scrape` does. For the Tools page in the run above:

- `finalUrl`: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`, the address that answered.
- `fetchedAt`: `2026-10-21T19:02:10.360Z`, when it answered.
- `httpStatus`: 200, read over HTTP.
- `robotsDecision`: `allowed`. Hosted Octocrawl obeys robots.txt for every page of a crawl.
- `outputSha256.markdown`: a hash of the exact Markdown Claude received, so you can tell later whether a page changed.

A page that cannot be read stays in the job with its reason (`blocked`, `failed`, `timeout`) instead of disappearing, and `get_crawl_errors` lists them.

## What does a job cost?

A page in a job costs what a single scrape costs: 1 credit read over HTTP, 5 in a browser. The run above used 7 credits. Every account gets 1,000 credits a month free.

- `maxCredits` caps a job: it stops before the next page would pass the cap.
- An account runs two jobs at a time, with up to ten more waiting.
- Results are kept 7 days after a job ends. The dashboard's [Jobs page](/dashboard/jobs/) lists them with their progress.
- Over REST, a job can post its end to your server as a signed webhook.

## When should you run it on your own computer instead?

Run Octocrawl locally with `npx octocrawl serve` when a job is larger than hosted takes (more than 500 pages or 1,000 URLs), when the pages need your login, or for Monitors on a schedule. The same tools work against the local server, with no daily limit.

## How do you start?

Make an account at [octocrawl.dev](/signin/) and create a key, or sign in from your client instead. Then connect it:

```bash
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer oc_…"
```

Ask your agent to crawl a section or batch-scrape a list, and to wait for the job before it reads the pages. [Crawl and batch jobs](/docs/connect-mcp/#crawl-and-batch-jobs) has the tools, the limits and the setup for Codex, Cursor and OpenCode.

## FAQ

### Do hosted crawl and batch jobs need an account?

Yes. Without a key, hosted Octocrawl offers `scrape` and `map` only. Any account can run jobs, on its own credits.

### Does a crawl obey robots.txt?

Yes. Hosted Octocrawl reads each site's robots.txt and skips the pages it disallows, recording the decision on every page.

### What happens if my agent disconnects in the middle of a job?

Nothing: the job keeps running on the server. Reconnect and read it by its `taskId`, or find it on the dashboard's Jobs page.

### How is this different from running Octocrawl locally?

The tools and results are the same. Hosted jobs need no server on your side and are limited to 500 pages a crawl and 1,000 URLs a batch; a local server has no such limit and can also read pages behind your login.
