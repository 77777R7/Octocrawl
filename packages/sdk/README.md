# @octocrawl/sdk

TypeScript and JavaScript client for the Octocrawl API (a local `octocrawl serve` or a hosted Octocrawl): scrape, map, crawl and batch, each page with its **Evidence Record**. No dependencies; ESM and CommonJS, with types.

```ts
import { W2L } from '@octocrawl/sdk'

const client = new W2L({ baseUrl: 'http://127.0.0.1:8787' })
const page = await client.scrape('https://books.toscrape.com/', { formats: ['markdown', 'tables'] })
console.log(page.status, page.evidenceRecord.fetchedAt, page.tables?.[0]?.csv)

const { report, items } = await client.batchAndWait(['https://example.com/a', 'https://example.com/b'])
```

Start a local API with `npx octocrawl serve`. Requires a runtime with `fetch` (Node.js 18 or later, browsers, Deno, Bun).

Use `verification.status` to read configured task checks separately from fetch `status`:

```ts
const checked = await client.scrape('https://example.com/report', {
  formats: ['markdown'], // Return the data this check reads.
  verify: { checks: [{ type: 'markdownIncludes', text: 'Annual report' }] },
})
switch (checked.verification?.status) {
  case 'passed': console.log('The configured checks passed', checked.markdown); break
  case 'failed': console.log('Checks failed', checked.verification, checked.readiness); break
  default: console.log('Content has not been verified against a task contract'); break
}
```

This example checks a phrase, not the truth of the report's fields. `passed` covers only the checks supplied; field accuracy needs independent source checks. `success` alone and extraction `confidence` are not verified completion. A failed check is not an instruction to retry a login, captcha or unavailable-data page automatically. Explicit formats must include `markdown` for Markdown checks, including `minTables`; conflicting requests are rejected before a fetch or job start.

Licence: MIT. Website and docs: https://octocrawl.dev/?utm_source=npm&utm_medium=readme&utm_campaign=sdk. Source and the API reference: https://github.com/77777R7/Octocrawl
