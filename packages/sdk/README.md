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

Licence: MIT. Source and the API reference: https://github.com/77777R7/Octocrawl
