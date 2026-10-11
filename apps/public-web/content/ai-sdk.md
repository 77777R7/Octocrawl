# Octocrawl with the AI SDK

`@octocrawl/ai-sdk` gives a model built with the [AI SDK](https://ai-sdk.dev) two tools. `scrape` reads a web page as Markdown (or links, cleaned HTML, tables) with its Evidence Record. `map` lists a site's URLs. The tools call hosted Octocrawl: no account, no key, 20 pages a day per address. A page that is blocked, empty or not the page asked for comes back with that status and the reason, so the model does not mistake an error page for the content.

## Install

```bash
npm install @octocrawl/ai-sdk ai zod
```

The tools work with `ai` 7 and `ai` 6, and with `zod` 3.25 or 4. The package is MIT-licensed.

## Give the tools to a model

```ts
import { generateText, isStepCount } from 'ai'
import { octocrawlTools } from '@octocrawl/ai-sdk'

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5.5',
  tools: octocrawlTools(),
  stopWhen: isStepCount(5),
  prompt: 'Find the blog posts on https://octocrawl.dev that are about logins, read one, and cite the final URL you read.',
})
```

With `ai` 6, write `stepCountIs(5)` in place of `isStepCount(5)`. The same tools go to `streamText` or an agent. `scrapeTool()` and `mapTool()` return one tool each, if the model should have only one.

## What comes back

On 2026-10-11 we ran the tools against hosted Octocrawl with the AI SDK's mock model calling them, so no model provider was involved. `map` on `https://octocrawl.dev/` with `search: "blog"` returned 7 URLs, status `completed`. `scrape` on `https://example.com/` returned this, shortened:

```json
{
  "status": "success",
  "requestedUrl": "https://example.com/",
  "finalUrl": "https://example.com/",
  "httpStatus": 200,
  "title": "Example Domain",
  "markdown": "This domain is for use in documentation examples without needing permission. …",
  "truncated": false,
  "evidenceRecord": {
    "schemaVersion": "w2l.evidence/1",
    "fetchedAt": "2026-10-11T06:05:09.043Z",
    "httpStatus": 200,
    "robotsDecision": { "decision": "no_robots", "robotsUrl": "https://example.com/robots.txt" },
    "rawSha256": "25ddf2c883e0d1958ea971d279a7e4f0fd446724ee3db7db19dadabd4a62e484",
    "outputSha256": { "markdown": "0a080719be9fbb82a86a45b80dc8c2a430fbe17dc93d23758debac092864d00f", "json": null }
  }
}
```

The scripts and full output of that run are in the [run record](https://github.com/77777R7/Octocrawl/tree/main/research/docs/ai-sdk/runs/2026-10-11-hosted).

Only `success` and `partial` carry the page's content. For the other statuses (`blocked`, `failed`, `empty_verified`), `failureReason` or `blockReason` says why. `warning` and `agentHints` appear when the read has a caveat or a next step. `map` returns `links` (each a `url`, with `title` and `description` when known) and `counts` of the URLs returned and of those it left out.

## When a call is refused

When the API refuses a call, the tool returns the refusal instead of throwing, so the model can read what to do next. Once the daily allowance is used up, the answer has this shape:

```json
{ "status": "refused", "httpStatus": 429, "code": "quota_exhausted", "error": "the keyless allowance of 20 pages a day is used up", "agentHints": ["a key raises the allowance: …", "the allowance resets at 00:00 UTC, in 3600 s"], "retryAfterSeconds": 3600 }
```

The daily allowance resets at 00:00 UTC. A network failure still throws, as any failed tool call does.

## A key, or your own server

```ts
octocrawlTools({ apiKey: process.env.OCTOCRAWL_API_KEY })        // a key raises the daily allowance
octocrawlTools({ baseUrl: 'http://127.0.0.1:8787' })            // your own server: npx octocrawl serve
```

`apiKey` defaults to `OCTOCRAWL_API_KEY`, and `baseUrl` to `OCTOCRAWL_API_URL`, else hosted Octocrawl. Keys are issued by hand for now: see [Add a key for more](/docs/connect-mcp/#add-a-key-for-more). A server you run with `npx octocrawl serve` has no daily limit, and reads pages that only appear in a browser once `npx playwright install chromium` has run. [Limits](/docs/limits/) lists what hosted Octocrawl does and does not do. The same tools over MCP are on [Connect MCP](/docs/connect-mcp/).
