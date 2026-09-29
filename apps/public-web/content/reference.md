# Advanced reference

Use the browser preview or [Codex MCP setup](/docs/connect-mcp/) for a first result. REST, SDK, and self-hosted operation are available for developers who need explicit configuration and persistent task control; they currently require a checkout of this repository.

## REST and SDK

The local API has `POST /v1/scrape` for one URL, `POST /v1/batches` for an explicit URL array, and `GET /v1/batches/:id/items?limit=...&cursor=...` for paginated outcomes. Monitor and Delivery have separate REST resources. The `@w2l/sdk` package is currently a private workspace package, not an independently published npm install.

A server started with tokens (`--token`, which can be repeated, or `W2L_API_TOKEN` and the comma-separated `W2L_API_TOKENS`) accepts a request only with `Authorization: Bearer <token>` naming one of them. Give each client its own token; restarting the server without a token revokes it. Tokens are compared as fixed-length SHA-256 digests in constant time. The SDK sends its `token` option, or `W2L_API_TOKEN` from the environment when no `token` is passed.

Scrape results, batch items and crawl pages carry `metadata`: the page's `<title>`, `<meta name="description">`, language (`<html lang>`, else Content-Language), `<meta name="keywords">`, `<meta name="robots">`, the first `<link rel="icon">` as an absolute URL, and `<link rel="canonical">`. Each is `null` when the page does not declare it. `document.title` is a different value: the content's own title, usually its first heading.

A URL that answers with a file (PDF, CSV, JSON, plain text, XLSX, XLS or ZIP, by its `Content-Type` or, under `application/octet-stream`, by its bytes) is saved byte for byte as received under the task root, `files/<sha256>.<ext>`, and is never sent to the browser. The result's `file` block says what it is (`kind`, `detectedBy`, `contentType`), its declared and received size (`declaredBytes`, `bytes`), the cap that applied (`maxBytes`), `sha256` and `path`, and `markdownFrom`: `pdf_text`, `text` or `null`. A PDF's `markdown` is its text layer with a line `<!-- page N -->` before each page, and `file.pdf` gives `pageCount`, `pagesRead`, each page's `number`, printed `label` and `start`/`end` offsets in the Markdown, the PDF's own `info`, and `warnings` (`tables_unverified` whenever there is text, `no_text_layer` per page without text: no OCR is run, `page_cap`, `time_budget`, `page_error`). A PDF with text is `success`, or `partial` when a cap or budget stopped it; one with no text layer at all is `failed` with `empty_unverified`; one that cannot be opened is `failed` with `parse_error`. CSV, JSON and text files give their text as `markdown`; XLSX, XLS and ZIP give none and are `success`. The operator's `W2L_MAX_FILE_BYTES` (default 50 MiB, at most 500 MiB) caps a file; `maxFileBytes` on scrape, batch or crawl can lower it, and a file over the cap is `failed` with `body_too_large` and nothing saved. Images, audio, video, fonts and word-processor or presentation documents are `failed` with `unsupported_content_type`.

## JSON extraction

A `json` format takes a JSON Schema: `{ "type": "json", "schema": { … } }`, with `prompt` and `modelFallback` optional. W2L fills the schema from the page itself, and every value carries its evidence. A format without a schema is refused (`invalid_request`): W2L does not extract JSON from a prompt alone, which would need a model for every page. `prompt` only instructs the model fallback.

The schema may use this subset, which covers what Pydantic's `model_json_schema()` and `zod-to-json-schema` usually write:

| Keywords | What W2L does with them |
| --- | --- |
| `type` (one or a list), `properties`, `required`, `items` (one schema), `additionalProperties`, `enum`, `const`, `$defs`, `definitions`, local `$ref` (`#` or a pointer into the schema) | Maps values by them and checks the result. |
| `anyOf` / `oneOf` of a schema and `{ "type": "null" }`, or of primitive types only | Maps the value by the non-null schema or the types; a missing nullable field is `null` with a `field_unavailable` issue. |
| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `minLength`, `maxLength`, `pattern`, `minItems`, `maxItems`, `uniqueItems` | Checks the result; never fills a value in. A page value that breaks a check makes the result `incomplete` with a `field_unavailable` issue. A `pattern` that can backtrack catastrophically, such as `^(a+)+$`, is refused with `invalid_request`; one with lookaround or a backreference is matched only against text of up to 2,048 characters, and longer text counts as breaking it. |
| `title`, `description`, `$comment`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `format`, `default`; `$schema` (draft-07, 2019-09 or 2020-12) and `$id` at the root only | Accepts and ignores them: `format` is not checked and `default` is never filled in. |

A schema is at most 64 KiB, 8 levels deep and 100 properties. Any other keyword, a union of objects, arrays or references, a keyword other than an annotation beside `$ref`, and `$schema` or `$id` below the root are refused with `unsupported_parameter`; `details.parameters` names the keyword where it was sent, such as `formats[0].schema.properties.author.allOf`.

A result is `complete`, `incomplete` (a required field has no source: `missing_required`; or the page was not a success: `page_unsuccessful`, `page_partial`) or `invalid` (the model's answer did not fit the schema twice). `json.evidence`, like `evidenceRecord.fieldEvidence`, gives each value's source: a label row, `h1[0]` or `title` for the content title (`dom`), `finalUrl` or `requestedUrl` (`fetch`), `document.pageType` (`inferred`), or `model`. The model fallback (`modelFallback: true` and `W2L_EXTRACT_BASE_URL` / `W2L_EXTRACT_MODEL` set) fills only what the page did not give, or a page value that breaks the schema; every other value keeps what the page said and its evidence. It asks the provider for strict structured outputs with a strict-safe copy of the schema, or for the schema as given when strict mode cannot express it; `json.modelUsage.strict` and `strictReason` say which and why.

Start the repository API only after reviewing its network and task-store settings. For full request shapes and examples, use the repository's `docs/onboarding.md`, `docs/batch-scrape.md`, and `examples/monitor-workflow.ts` from the **same checkout and commit** as the running service. Mixing a guide from another branch with a local server can change the apparent contract.

## Evidence Record

Every scrape result (full or compact, so MCP `scrape` too), batch item and crawl page carries `evidenceRecord`: the evidence for that page in one shape, whichever lane fetched it. Its JSON Schema (draft 2020-12) is [`packages/contracts/schemas/evidence-record.v1.json`](https://github.com/77777R7/w2l/blob/main/packages/contracts/schemas/evidence-record.v1.json) in the repository, which describes every field; each record names it with `schemaVersion: "w2l.evidence/1"`. Every field is always present, and a value W2L did not observe is `null`, never `0` or a guess. The record sits beside the existing fields (`evidence`, `snapshot`, `compliance`, `lane`), which do not change. The Firecrawl-compatible `/fc` routes keep Firecrawl's shape and do not carry it.

`w2l.evidence/1` changes only additively: a later revision of the schema file accepts every record an earlier one accepted. A field added later is optional in the schema, so older records stay valid, though W2L writes it on every record from then on (so far `bytes` and `contentType` on artifacts, added with file download); enums only gain values; no field changes its meaning. Anything else would get a new `schemaVersion` and schema file.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `w2l.evidence/1`. |
| `requestedUrl` | The URL as requested. |
| `finalUrl` | The last URL W2L requested for the page, after redirects. `null` when it sent none: a robots.txt disallow, a DNS failure or a policy refusal came first. |
| `redirectChain` | `{ urls, complete }`. `urls` runs from `requestedUrl` to `finalUrl` (`[requestedUrl]` without a redirect, `[]` when nothing was requested). `complete` is `true` when every hop is listed: on the HTTP lane, which requests each hop itself, and on the browser lane, which lists each redirect Chromium followed (`false` there when a follow-up navigation or a script moved the page on). It is `false` on the provider lane, which sees only where its vendor started and ended. |
| `fetchedAt` | When the reported response was received, UTC ISO 8601 with milliseconds: its headers on the HTTP lane, the capture of the rendered page on browser lanes, the vendor's answer on the provider lane. `null` without a response. |
| `httpStatus` | The response's HTTP status; `null` without one. |
| `status`, `reason` | W2L's verdict, and the failure, block or budget reason (`null` for other statuses). |
| `lane` | `http`, `browser_local`, `browser_local_authed`, `browser_proxy` or `provider`. |
| `robotsDecision` | `{ decision, robotsUrl, robotsSha256, unreachable, crawlDelayMs, userOverride }`, or `null` when the result ended before robots.txt was checked. `decision` is `allowed`, `disallowed` or `no_robots` (the site has none); `unreachable` says why robots.txt could not be fetched, which counts as a disallow. `userOverride` is `false`: W2L has no override. |
| `rawSha256` | SHA-256 of the body W2L read, as `evidence.rawBodySha256`: for a file (PDF, CSV, ...), the bytes received in any lane, equal to its artifact's `sha256`; for a web page, the response body as UTF-8 text on the HTTP lane, the rendered HTML on browser lanes, the vendor's HTML on the provider lane. |
| `outputSha256` | `{ markdown, json }`: SHA-256 of the UTF-8 bytes of the `markdown` delivered in this response, and of `json.data` as canonical JSON (RFC 8785: keys sorted at every level, no whitespace). `null` for what was not delivered. |
| `extractor` | `{ name, version, commit }`: `extract-tf` and its version (`extract-tf/3`) for a web page, `pdf-text` (`pdf-text/1`) for a PDF, `file-text` (`file-text/1`) for another file; and the source commit when the operator sets `W2L_SOURCE_COMMIT`, else `null`. |
| `fieldEvidence` | For a JSON request, each field's JSON Pointer mapped to `{ source, locator }`: the source is `jsonld`, `microdata`, `meta`, `hydration`, `dom`, `text`, `inferred`, `model`, `fetch` (the fetch's own URL, not the page) or `pdf`, and the locator says where, such as `table[0] tr[3] "UPC"`, `h1[0]`, `title`, `finalUrl`, or `page 14 "KPI 2"` for a `Label: value` line of a PDF (page N is the `<!-- page N -->` marker). JSON-LD, microdata and meta values outside the Amazon adapter have no locator yet (`null`), nor has `model`. A field that is absent or `null` has no entry. `null` without a JSON request. |
| `artifacts` | Files saved for the result, each `{ kind, path, sha256, bytes, contentType }`: a file saved as received (`kind: "file"`, with its size and `Content-Type`), and the page snapshot (`kind: "snapshot"`, size and type `null`) when `W2L_CAPTURE_RAW_DIR` is set; otherwise `[]`. |
| `proxy` | `host:port` of the environment proxy the request went through (local mode). `null` when it went direct or the lane does not report its route, which the provider lane never does. |
| `identity` | `{ userAgent, mode, contact }`: the User-Agent observed on the request for the page (`null` when none was sent or observed), the crawl mode, and the contact a research-mode User-Agent declares (`W2L_CONTACT`). |

To check a cited value, hash the `markdown` you received as UTF-8 and compare it with `outputSha256.markdown`; for JSON, serialize `json.data` with sorted keys and no whitespace first.

## Errors

When the API refuses or fails a request, it returns an error body instead of a result:

```json
{ "error": "unsupported format: html (supported: markdown, links, json)", "code": "unsupported_format", "details": { "formats": ["html"] } }
```

Branch on `code`; `error` is written for people. `details` appears only with `unsupported_parameter` and `unsupported_format` and lists the rejected names as sent, in `parameters` and `formats`. The Firecrawl shim (`/fc`) returns the same fields after `"success": false`.

| Code | HTTP | Meaning | Typical cause | What to do |
| --- | --- | --- | --- | --- |
| `invalid_json` | 400 | The body is not valid JSON. | A truncated or hand-edited body. | Send one JSON object. |
| `invalid_request` | 400 | A value is missing, malformed or out of range. | No `url`, a non-HTTP(S) URL, an invalid `includePaths` pattern, a `json` format without a schema, a JSON Schema over its limits or with a malformed value. Also, for now, a batch refused because another is still being accepted or the active-batch limit is reached. | Correct what the message names; retry a refused batch later. |
| `unsupported_parameter` | 400 | The request names a parameter W2L does not support, or a value it cannot honour. Nothing is ignored silently. | A Firecrawl option such as `actions` or `proxy`, `limit` on native crawl (it takes `maxPages`), `ignoreSitemap: false` on `/fc`, a JSON Schema keyword outside the [supported subset](#json-extraction) such as `allOf`. | Remove or change what `details.parameters` lists. |
| `unsupported_format` | 400 | A requested format is not produced. | `html`, `rawHtml` or `screenshot`. | Ask for `markdown`, `links` or `json` (on `/fc`: `markdown`, `links`). |
| `unauthorized` | 401 | The bearer token is missing or is not one of the server's tokens. | A server started with `--token`, `W2L_API_TOKEN` or `W2L_API_TOKENS`, which `--hosted` requires. | Send `Authorization: Bearer <token>`; the SDK reads `W2L_API_TOKEN` when no `token` is passed. |
| `not_found` | 404 | The task, monitor, run, destination, delivery or session does not exist, or no route matches. | A mistyped ID, another task directory, a Firecrawl v2 path on `/fc`. | Check the ID and the path. |
| `conflict` | 409 | The resource's current state does not allow the request. | A monitor revision out of sequence or on a running monitor; a run queued on a paused, busy or unknown monitor; a retry of a delivery that is not dead-lettered; resuming a crawl that is completed, cancelled or still running. | Read the resource's state first; the same request fails again. |
| `internal_error` | 500 | W2L failed unexpectedly. | A bug or a storage failure. | Retry once, then report it. A local server returns the underlying message; a hosted server (`--hosted`, remote MCP) returns `internal error` and writes the cause to its log. |

These codes describe the request, not the page. A page that was fetched but blocked or failed is a normal result with its `status` and reason (see [result states](/docs/limits/)); on `/fc` it is HTTP 200 with `success: false`, no `code`, and the reason in `data.metadata.error`.

The SDK throws `W2LError` for every error response. It carries `status`, `code` (when the body had one), `method`, `path` and the parsed `body`; its message is still `<METHOD> <path> failed: <status> <body>`, or `crawl not found: <id>` and `batch not found: <id>` for those lookups. A request that never reached the API throws the underlying `fetch` error. `waitBatch` / `waitCrawl` (and `batchAndWait` / `crawlAndWait`) retry a status request that fails with a network error, 408, 429 or 5xx, up to `maxRetries` (default 5) in a row, before throwing its error; they throw other errors at once, and `WaitTimeoutError` (`taskId`, `timeoutMs`, `last`: the last status read or null) when `timeoutMs` runs out.

```ts
import { W2LError } from '@w2l/sdk'

try {
  await w2l.getCrawl(taskId)
} catch (error) {
  if (!(error instanceof W2LError) || error.code !== 'not_found') throw error
  // The ID is wrong or belongs to another task directory.
}
```

MCP tool errors start with the same code, for example `unsupported_format: POST /v1/scrape failed: 400 {"error":...}`, and their JSON-RPC error `data` is `{ "code": "unsupported_format", "status": 400 }`. Successful tool results are unchanged.

## Self-hosted operation

The local managed MCP service starts the API, scheduler, and delivery worker together; task state is SQLite-backed. Keep its task directory across restarts. The anonymous page preview is a separate request-based service and does not run persistent Monitor or Delivery tasks. A remote owner-only MCP implementation exists, but its WorkOS login, public URL, and hosted restart acceptance have not been completed.

If you are evaluating a hosted deployment, verify the authentication resource identifier, HTTPS receiver, persistent disk, outbound restrictions, quota store, and actual client flow before sharing a link. Do not point another user's Codex installation at the loopback URL; `127.0.0.1` refers to their own computer.

## Evidence and boundaries

The [result states](/docs/limits/) page explains user-facing outcomes. Repository evidence separates tested local transport, delivery recovery, Amazon field review, and still-open hosted gates. A green unit test or local sample is not evidence of a deployed service or an independent first-time user completing the flow.
