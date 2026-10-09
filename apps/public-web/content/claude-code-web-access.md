# Give Claude Code web access

Octocrawl gives Claude Code two web tools through MCP. `map` lists a site's URLs so Claude can find the right page, and `scrape` reads a page as Markdown with an Evidence Record: the final URL, when it was fetched, and the robots.txt decision. (A third, `scrape_product` for Amazon.sg products, needs a key.) It takes one command and no account.

## Add Octocrawl

```bash
claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp
```

By default the server is added for the project you are in (`--scope local`). Add `--scope user` for every project, or `--scope project` to share it with your team through the repository's `.mcp.json`. `claude mcp list` checks that it connects.

Hosted Octocrawl reads public pages over HTTP, 20 pages a day per address, and each `map` counts as one. A key raises that and opens the browser lane: add `--header "Authorization: Bearer oc_…"` (see [Connect MCP](/docs/connect-mcp/#add-a-key-for-more)).

## Ask for a task

Name the tools in your prompt, or let Claude choose them. This is the prompt from the run below:

```text
Use Octocrawl's map tool to find the pages on https://modelcontextprotocol.io about streamable http, then use its scrape tool on the 2025-11-25 specification page you found. Tell me which HTTP methods a client uses on the MCP endpoint, and cite the page's final URL and the fetch time from its evidence record.
```

## What happened

On 2026-10-09 at 17:39 UTC, Claude Code 2.1.295 with Claude Opus 5.5 ran that prompt against `https://mcp.octocrawl.dev/mcp` in 5 turns and 25 seconds. Its own web tools were turned off for the run, so every page came through Octocrawl.

1. `map` with `search: "streamable http"` returned two pages, both newer versions of the specification (`2026-07-28` and `draft`).
2. Claude saw that the 2025-11-25 version had no page of that name and ran `map` again with `search: "2025-11-25 transports"`. That returned one URL, `/specification/2025-11-25/basic/transports`, and 383 left out.
3. `scrape`, which Claude called with `debug: true`, read that page (`status: success`, lane `http`, 14,522 characters of Markdown).
4. Claude answered with the three methods, POST, GET and DELETE, quoting the specification's "MUST" and "SHOULD", and cited:

```text
Final URL: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports (HTTP 200, no redirects)
Fetch time (evidenceRecord.fetchedAt): 2026-10-09T17:39:14.758Z
```

The answer's facts can be checked against the page the Evidence Record names. The record also kept the robots.txt decision (`allowed`) and a hash of the robots.txt that allowed it. The site may change, so a later run can find other pages.

## Tell Claude what you need back

- **For a long page**, ask for a section or a summary. Claude reads the whole Markdown and answers from it.
- **For a site**, ask it to `map` first with `search`, then `scrape` the pages that match. See [Map a site](/docs/guides/map-site/) for the options.
- **For proof**, ask for the final URL and `fetchedAt` from the evidence record, as in the prompt above. Every `scrape` answer carries the record; `debug: true` adds how the page was reached (each rung tried).
- **When a page cannot be read**, the tool answers with the reason (`blocked`, `timeout`) instead of inventing a page. Tell Claude to report it rather than guess.

## More than public pages

On your own computer every tool is available, with no daily limit: crawl, batch, Monitors, and pages read in [your own Chrome](/docs/guides/own-chrome/). Start the API in one terminal, then add the local server:

```bash
npx octocrawl serve
claude mcp add octocrawl -- npx -y @octocrawl/mcp
```

Use another name, such as `octocrawl-local`, if you keep the hosted one too.

## If it does not work

- **`claude mcp list` shows it failing:** check that the URL ends in `/mcp` and that your network reaches `mcp.octocrawl.dev`.
- **Claude uses its own web tools instead:** name Octocrawl's tool in the prompt, as above.
- **The tool answers that the allowance is used up:** it resets at 00:00 UTC and the answer says when. A key, or the local server, has more.
- **A page comes back `blocked`:** the site refused a plain request. Hosted Octocrawl does not get past checks; on your computer you can [get through it yourself](/docs/guides/own-chrome/#when-a-page-stops-at-a-check).

See [Limits](/docs/limits/#hosted-api-and-mcp) for the allowances and [Privacy](/docs/privacy/#hosted-api-and-mcp) for what the hosted service records.
