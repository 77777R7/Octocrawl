# @octocrawl/ai-sdk

Octocrawl's `scrape` and `map` as [AI SDK](https://ai-sdk.dev) tools. `scrape` reads a web page as Markdown (or links, cleaned HTML, tables), and `map` lists a site's URLs. Every page carries an Evidence Record: the final URL, HTTP status, robots.txt decision and hashes of what was read. A page that is blocked, empty or not the page asked for comes back with that status and the reason, not as content.

The tools call hosted Octocrawl by default: no account and no key, 20 pages a day per address.

```bash
npm install @octocrawl/ai-sdk ai zod
```

```ts
import { generateText, isStepCount } from 'ai'
import { octocrawlTools } from '@octocrawl/ai-sdk'

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5.5',
  tools: octocrawlTools(),
  stopWhen: isStepCount(5),
  prompt: 'Find the pricing page on https://example.com and summarize it. Cite the final URL you read.',
})
```

With `ai` 6, use `stepCountIs(5)` in place of `isStepCount(5)`. The tools need `zod` 4. With `ai` 7, which needs Node.js 22, a CommonJS project needs Node.js 22.12 or later to load it.

## Options

`octocrawlTools(options)` returns `{ scrape, map }`. `scrapeTool(options)` and `mapTool(options)` return one tool each.

- `apiKey`: an Octocrawl key (`oc_…`), sent as `Authorization: Bearer`. A key raises the daily allowance. Defaults to `OCTOCRAWL_API_KEY`.
- `baseUrl`: the Octocrawl API to call. Defaults to `OCTOCRAWL_API_URL`, else `https://api.octocrawl.dev`. Point it at `http://127.0.0.1:8787` to use a server you run with `npx octocrawl serve`: no daily limit, and the browser lane for pages that only appear in a browser.
- `fetch`: a fetch to send the requests with.

## What the tools return

`scrape` returns `status`, `requestedUrl`, `finalUrl`, `httpStatus`, `title`, the formats asked for (`markdown` by default), `warning` and `agentHints` when there are any, and `evidenceRecord`. Only `success` and `partial` carry the page's content. For the other statuses, `failureReason` or `blockReason` says why.

`scrape` accepts the API's optional `verify` contract and preserves `verification` and `readiness` when the server supplies them. Ask for the formats a check reads, for example `formats: ['tables']` and `verify: { checks: [{ type: 'tableRowsMin', tableIndex: 0, columns: [0, 1], min: 1 }] }`. Output formats are unchanged; this tool does not offer list selectors or JSON extraction.

Read `verification.status` separately from fetch `status`: `passed` means only the configured checks passed, `failed` needs the failed checks, readiness and access reason examined, and `not_requested` or a missing field means the task has not been verified. A successful navigation-only page is not a completed product task. Neither `success` nor extraction confidence proves field accuracy. Login walls, captchas and unavailable source data are not instructions to retry automatically. `emptyOk` permits an already verified empty result, not an unknown or unavailable one. The server enforces contract validation; hosted Octocrawl refuses regex checks and their refusal is returned without retrying.

`map` returns `status`, `links` (`url`, with `title` and `description` when known), and `counts` of the URLs returned and of those left out: outside the site, disallowed by robots.txt, repeated, filtered by `search` or past `limit`.

When the API refuses a call, the tool answers `{ status: 'refused', httpStatus, code, error, agentHints, retryAfterSeconds }` instead of throwing, so the model can read what to do next. A refusal can be the daily allowance used up (`quota_exhausted`, reset at 00:00 UTC), a rate limit or an invalid key. A network failure still throws.

## More

- Guide: https://octocrawl.dev/docs/integrations/ai-sdk/?utm_source=npm&utm_medium=readme&utm_campaign=ai-sdk
- Limits of hosted Octocrawl: https://octocrawl.dev/docs/limits/?utm_source=npm&utm_medium=readme&utm_campaign=ai-sdk
- The same tools over MCP: https://octocrawl.dev/docs/connect-mcp/?utm_source=npm&utm_medium=readme&utm_campaign=ai-sdk

Licence: MIT, for this package. The Octocrawl server is AGPL-3.0-only. Source: https://github.com/77777R7/Octocrawl
