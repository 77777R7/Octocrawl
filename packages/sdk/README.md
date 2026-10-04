# @w2l/sdk

TypeScript and JavaScript client for the W2L API (a local `w2l serve` or a hosted W2L): scrape, map, crawl and batch, each page with its **Evidence Record**. No dependencies; ESM and CommonJS, with types.

```ts
import { W2L } from '@w2l/sdk'

const w2l = new W2L({ baseUrl: 'http://127.0.0.1:8787' })
const page = await w2l.scrape('https://books.toscrape.com/', { formats: ['markdown', 'tables'] })
console.log(page.status, page.evidenceRecord.fetchedAt, page.tables?.[0]?.csv)

const { report, items } = await w2l.batchAndWait(['https://example.com/a', 'https://example.com/b'])
```

Start a local API with `npx @w2l/cli serve`. Requires a runtime with `fetch` (Node.js 18 or later, browsers, Deno, Bun).

Licence: MIT. Source and the API reference: https://github.com/77777R7/w2l
