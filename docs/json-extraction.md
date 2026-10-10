# JSON extraction

Send a JSON Schema in `formats` and Octocrawl fills it from what the page itself says. A model is called only when you turn on `modelFallback`.

Request deterministic structured data with a JSON Schema alongside, or instead of, Markdown:

```ts
const product = await w2l.scrape('https://www.amazon.com/dp/B08KT2Z93D', {
  debug: false,
  formats: [{
    type: 'json',
    schema: {
      type: 'object',
      properties: {
        asin: { type: 'string' },
        title: { type: 'string' },
        price: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        seller: { type: ['string', 'null'] }
      },
      required: ['asin', 'title', 'price', 'currency', 'seller'],
      additionalProperties: false
    }
  }]
})
```

Octocrawl maps supported product fields directly from subject-bound HTML, JSON-LD, metadata and DOM evidence. A top-level key that no such fact covers is matched to the page's own labels, two-cell `th`/`td` table rows and `dt`/`dd` pairs in the main content, compared without case, spaces or punctuation (`Number of reviews` fills `numberOfReviews`; `Price (excl. tax)` fills `price` when no label is exactly `Price`). `title` (or `pageTitle`) takes the content title, `url` (or `finalUrl`) and `requestUrl` the fetch's final and requested URL, and `pageType` the page type Octocrawl classified. A number is read only from text that is one amount, such as `£51.77` or `1.299,00 €`, never from text like `HL-1`, `4.7 out of 5` or a URL (see below); labels that state different values leave the field out with a `field_ambiguous` issue. A missing nullable field is `null` with a `field_unavailable` issue; a missing required field is left out with a `missing_required` issue and the result is `incomplete`. Every value has an `evidence` entry (the same map is `evidenceRecord.fieldEvidence`): the label's table or list, row and label; `dom` with `h1[0]` (the main content's first heading) or `title` (the page's `<title>`) for the title; `fetch` with `finalUrl` or `requestedUrl` for a URL; `inferred` with `document.pageType` for the page type, and with `document.product.images` (`prices`, `variants`, `specifications`) for a list or map the product extractor reported empty, since nothing on the page locates an absence; `model` for a value the model fallback wrote. `json.evidence` also quotes the text each number was read from (`text`, whitespace collapsed); the Evidence Record keeps `source` and `locator`.

Numbers are read as the page writes them. An amount is an optional sign, a currency symbol or code before or after the number (`€`, `EUR`, `US$`, `kr`, `円`, or a symbol before and a code after, as in `$12.99 USD`) and one number: its decimal separator is `.` or `,`, its thousands are grouped by `.`, `,`, a space (no-break and narrow no-break spaces too) or an apostrophe in groups of three, or in India's lakh groups, and `,-` or `.–` after it ends a whole amount. So `12,99 €` is 12.99; `1.299,00 €`, `1 299,00 €`, `CHF 1'299.–` and `$1,299.00` are 1299; `₹1,29,999` is 129999. A single `.` or `,` before exactly three digits (`1.299 €`, `$1,299`) is 1299 in one notation and 1.299 in the other, so it is read only when the value settles it: a review count is whole, so is an amount in a currency without minor units (`JPY`, `KRW`, `ISK`, `VND`, `CLP`, `₩`, `円`, in the text or as the page's `priceCurrency`), and a JSON-LD or `product:price:amount` price writes `.` as its decimal point. Octocrawl does not guess from the page's language, currency or domain: an English page of a German shop can write `1.299 €`, Irish shops write `€1,299`, and a German page can quote `$1,299`. Such a number, and a product price that is not a number at all (`Call for price`), is left out, or `null` when the field is nullable, with a `field_unavailable` issue quoting the text and where it is (a required one also gets `missing_required`); asked for as a string, the field is the text. An amount in the Amazon adapter's `prices` list that cannot be read stays its text, with a `field_unavailable` issue at `/prices/<i>/amount`.

The schema may use the JSON Schema subset Octocrawl can honour, which covers what Pydantic's `model_json_schema()` and `zod-to-json-schema` usually write:

- **Structure:** `type` (one or a list), `properties`, `required`, `items` (one schema), `additionalProperties`, `enum`, `const`, local `$ref` (`#`, `#/$defs/…`, `#/definitions/…` or another pointer into the schema) with `$defs` or `definitions`, and `anyOf` / `oneOf` of a schema and `{ "type": "null" }` (Pydantic's `Optional`) or of primitive types only.
- **Checked on the result, never used to fill a value in:** `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `uniqueItems`, and `enum` / `const`. A page value that breaks one stays in `data` and the result is `incomplete` with a `field_unavailable` issue quoting the check (the model fallback, when on, may replace it). A `pattern` has at most 2,000 characters, and one that can backtrack catastrophically, such as `^(a+)+$`, is refused with `invalid_request`. The rest run on V8's linear-time engine, except a pattern with a lookaround, a backreference, a counted repetition above 16 (such as `[0-9a-f]{32}`), a `\p{…}` or `\u{…}` escape or a character outside the Basic Multilingual Plane, and any text holding such a character (an emoji): those are matched only against text of up to 2,048 UTF-16 code units and within 100 ms, and text they cannot decide counts as breaking the pattern.
- **Accepted and not acted on:** `title`, `description`, `$comment`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `format` (not checked), `default` (never filled in: a field the page does not give stays missing), and at the root only `$schema` (draft-07, 2019-09 or 2020-12) and `$id`.
- **Bounds:** 64 KiB, 8 levels of nesting and 100 properties.

Anything else is refused with HTTP 400 `unsupported_parameter`, whose `details.parameters` names the keyword where it was sent (for example `formats[0].schema.properties.author.allOf`): `allOf`, `not`, `if`, `patternProperties`, `prefixItems`, OpenAPI's `nullable`, a union of objects, arrays or references, a keyword other than an annotation beside `$ref`, `$schema` or `$id` below the root. A malformed value, such as an invalid `pattern` or a `$ref` that does not resolve, is `invalid_request`. A `json` format needs a schema: `{ "type": "json", "prompt": "…" }` alone is refused with `invalid_request`, because Octocrawl does not extract JSON without one (that would need a model for every page); `prompt` only instructs the model fallback.

Model fallback is opt-in with `modelFallback: true` and runs only when a required field is missing or a value breaks the schema; configure an OpenAI-compatible endpoint through `W2L_EXTRACT_BASE_URL`, `W2L_EXTRACT_MODEL` and optional `W2L_EXTRACT_API_KEY`. Without those variables, page content is never sent to a model and the JSON result reports `model_unavailable`. The model receives the main-content Markdown and the values already read. It fills only what is missing, or replaces a page value that breaks the schema; every value read from the page keeps its value and evidence whatever the model answers, and every value the model wrote has `model` evidence. The request uses strict structured outputs (`json_schema` with `strict: true`) with a strict-safe copy of the schema: every object closed, every property required and the optional ones nullable, assertions and annotations left out. The answer is still checked against your schema, with one repair round, and a `null` your schema does not allow is dropped as "not found". A schema strict mode cannot express, such as an object without `properties`, is sent as given without strict mode; `json.modelUsage.strict` says which was used and `strictReason` why not.

## Did the page give what the task needs? (`verify`)

A fetch can succeed without the data a task asked for: a page of navigation, a sheet drawn on a canvas, a listing that had not loaded. A request (`POST /v1/scrape`, `POST /v1/batches` and `POST /v1/crawl`, for every page) may carry a task contract, and the answer then says whether the page met it, in `verification`, beside a `status` that stays the fetch's ([ADR 0006](adr/0006-task-verification.md)):

```json
{ "url": "https://example.com/laptops", "verify": { "checks": [
  { "type": "markdownCountMin", "pattern": "\\$\\d", "min": 5 },
  { "type": "recordFields", "fields": ["name", "price", "url"], "min": 5 }
], "emptyOk": false } }
```

- **Checks:**
  - `markdownIncludes` (`text`), `markdownMatches` (`pattern`, `flags`) and `markdownCountMin` (`pattern`, `flags`, `min`): on the page's Markdown.
  - `minTables` (`min`): GFM tables in the Markdown.
  - `listRecordsMin` (`min`) and `recordFields` (`fields`, `min`): records of the `list` format; `recordFields` counts the records that hold every field named.
  - `field` (`path`, and one of `equals`, `in`, `present`, or `min`/`max`): a value of the result, such as `json.data.price`.
  - `emptyOk: true` passes an empty result (`empty_verified`), such as a search with no hits.
- **Limits:** at most 32 checks. Patterns take the flags `i`, `m`, `s`, `u` and `y`, must compile, and are refused when they can backtrack catastrophically. A hosted server refuses `markdownMatches` and `markdownCountMin`, since a regular expression cannot be bounded in time there.
- **The answer:** `verification.status` is `passed`, `failed` or `not_requested` (no contract).
  - When failed, `reason` is `checks_failed` (the page was read and a check failed), `page_not_read` (no check ran) or `empty_not_allowed`.
  - Each check carries `passed` and a sentence of what was seen; count checks also carry `observedCount` and `asked`.
  - The Evidence Record carries `verification` too: status, verifier version (`verify/1`), the contract's SHA-256, and the checks that failed.
- The checks are those of the access task runner (`research/access/run-set.mjs`), judged the same way, so its tasks can be sent unchanged.
- **Where it is taken:** REST (`verify` in the body), the MCP `scrape`, `batch_scrape` and `crawl` tools (`verify`), the command line (`--verify '<json>'`), the TypeScript SDK (the request types) and the Python client (`verify=` passed through). The command line's `results.csv` and the Python client's rows carry a `verification` column: the status, or empty from a server that does not verify.
- **The access task runner** sends each task's predicates as its contract and records, beside its own verdict, on how many attempts the product agreed, naming each disagreement (`--no-contract` sends none).

## The Amazon baseline

Run the fixed 10-product, three-round Amazon MCP baseline with:

```bash
node scripts/section-b/amazon-public-state.mjs
npm run baseline:amazon -- --concurrency 1
npm run baseline:amazon -- --concurrency 2
# After 1 and 2 are comparable and unblocked:
npm run baseline:amazon -- --concurrency 4
```

The setup uses an anonymous Singapore public delivery preference for this benchmark only. Round 1 pins the observed context; later unobserved or mismatched region/currency records remain in the report and do not count as comparable. Reports and raw HTML stay under ignored `.w2l/amazon-baseline/`; the URL manifest and schema are versioned. The [signed ten-product result](evidence/amazon-adapter-integration-2026-09-23.md) passed at limited concurrency, but Amazon remains beta pending the 100/1000 promotion gates. The [older baseline](../research/amazon-product-baseline-2026-09-22.md) is historical.
The concurrency-1 command can exit nonzero because its ten-page median exceeds 20 seconds; inspect its report for comparability and blocking before continuing to 2. The signed run had 37.93 seconds at 1, 19.92 at 2, and 12.39 at 4.
This signed Amazon slice was merged into `main` by [PR #52](https://github.com/77777R7/w2l/pull/52), after the `v0.4.0-rc.1` source prerelease, so that prerelease does not contain it.
