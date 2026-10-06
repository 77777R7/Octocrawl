# Octocrawl vs Octoparse

Octoparse and Octocrawl both get data out of web pages, but they are built for different jobs. Octoparse is a desktop app for building a scraper by pointing and clicking, with ready-made templates, cloud runs, schedules and Excel export. Octocrawl is an open-source tool that turns pages into Markdown and checked fields for AI assistants and scripts, and records where every value came from.

Octoparse's prices and features below were read from its [pricing page](https://www.octoparse.com/pricing), [home page](https://www.octoparse.com/) and [documentation](https://www.octoparse.com/docs/) on 7 October 2026. They change, so check the links before you decide.

## The short answer

Choose **Octoparse** if you don't write code and want a spreadsheet from a site on a schedule. It gives you a point-and-click editor, templates for popular sites and runs in its cloud, and Octocrawl has none of those today.

Choose **Octocrawl** if you work through an AI assistant such as Claude Code or Cursor, or a script, and need clean Markdown for a model, data you can cite, or a free tool you can run and inspect yourself.

## At a glance

| | Octocrawl | Octoparse |
|---|---|---|
| What it is | Open-source scraper: a web page, a command-line tool, an API and an MCP server | Desktop app for Windows and Mac, with a cloud service |
| Without code | Paste a link on [octocrawl.dev](/) (three pages a day), or ask an AI assistant connected over MCP. Everything else needs a terminal | Point-and-click editor with auto-detect, and ready-made templates |
| Price | Free. The local version is unmetered; the hosted service gives 20 pages a day without a key and free keys on request. Nothing is for sale yet | Free plan with 10 tasks, local runs only. Paid plans from $69 a month billed annually (Standard), $249 a month billed annually (Professional) |
| Open source | Yes, AGPL-3.0 | No; its MCP server is MIT |
| Output | Markdown, HTML, links, screenshot, JSON, tables as CSV, lists of repeated items; the CLI's `--out` also writes `results.csv` | Excel, CSV, JSON, HTML, XML, Google Sheets and databases |
| Markdown for AI models | Yes, the main output | Announced as coming soon on its MCP page; not offered today |
| Logins, pagination, infinite scroll | On your computer: reuse a login from your own Chrome, follow pagination, click "load more" and scroll to the end, each reporting why it stopped | Built into the editor |
| Schedules and cloud runs | No schedules. Batches and crawls run on your computer | Cloud runs and schedules on paid plans |
| CAPTCHAs and proxies | No CAPTCHA solving or proxy pool. You can solve a CAPTCHA yourself in your Chrome and let Octocrawl read the page, or use your own proxies | IP rotation and automatic CAPTCHA solving on paid plans; residential proxies $3 per GB |
| API and MCP | REST API, TypeScript SDK, Python client, CLI, hosted and local MCP server | API on paid plans; MCP server and CLI |
| Where a value came from | Every result carries an evidence record: final URL, redirects, fetch time, robots.txt decision and SHA-256 hashes; each JSON field names its source | Not documented |
| Pages that can't be read | A blocked, empty or challenge page is a failure with a reason, never a row of data | Its CLI's detect step flags CAPTCHA, access-restricted and error pages before a task is built; what a run does with such a page is not documented |
| robots.txt | Read and recorded for every URL; the hosted service obeys it for every URL | Its guide says it respects robots.txt |

## When Octoparse is the better choice

- You don't want to use a terminal or an AI assistant.
- You need data from a site every day or every week, without leaving your computer on.
- A template already exists for the site, such as a marketplace or a maps listing.
- You want the result in Excel, Google Sheets or a database without another step.
- The site needs IP rotation or CAPTCHA solving that you would rather pay for than handle.

## When Octocrawl is the better choice

- **Your data goes to an AI model.** Octocrawl's main output is clean Markdown, and your assistant can call it directly over MCP.
- **You have to cite your data.** Each result records the page, the time and the robots.txt decision, and each field names the source it was read from, so a reviewer can check it.
- **You don't want silent failures.** A page that was blocked or empty is reported as such, not saved as an empty row.
- **You want it free and open.** The whole tool runs on your computer at no cost, and you can read its code.

## Try it

Paste a public URL on the [home page](/) to see a result and where each field came from. To use Octocrawl from Claude Code, Cursor or OpenCode, follow [Connect MCP](/docs/connect-mcp/).
