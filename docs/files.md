# Files: PDF, CSV, XLSX, ZIP, JSON

A URL that answers with a file is read the same way as a web page.

Scrape, batch items, crawl pages, MCP and `/fc` take a URL that answers with a file the same way as a web page. A 2xx response is a file when its `Content-Type` says PDF, CSV (including `+csv` types such as Eurostat's SDMX-CSV), JSON (and `+json`), plain text, XLSX, XLS or ZIP; when it says nothing useful (`application/octet-stream` and its kin, or none), the bytes decide: a `%PDF-` header in the first 1024 bytes, a ZIP header (an XLSX when the file is named `.xlsx`), an OLE header named `.xls`, or text named `.csv`, `.json` or `.txt`. A PDF header at the start overrides `text/html` or `text/plain`, and an HTML document sent as `text/plain` is still a page. The name is the `Content-Disposition` filename, else the URL path.

- **Saved as received, never sent to the browser.** The HTTP lane saves every byte to `<W2L_TASK_ROOT>/files/<sha256>.<ext>` (`.w2l/api/files/` by default; `npm run scrape` uses the same place, `npm run crawl` its task directory's `files/`), so the same bytes are stored once however many URLs serve them. A file never escalates to the browser, whatever its outcome. The result's `file` block gives the kind, how it was detected, the `Content-Type` as received, the declared and received size, the SHA-256, the path, and for a PDF its pages; `evidence.rawBodySha256` and the Evidence Record's `rawSha256` are the SHA-256 of the bytes. A request refused before anything is fetched (robots.txt, policy, DNS) saves nothing, and so does a non-2xx answer.
- **The browser lane catches the download.** When the browser is the first rung (`waitFor`) or otherwise reaches a file, it takes the file from the download the navigation starts, or from the response it displays (JSON, text), instead of failing with `Download is starting`, and saves the same bytes the same way.
- **Size cap.** `W2L_MAX_FILE_BYTES` sets the largest file in bytes (default 52 428 800, 50 MiB; at most 524 288 000, 500 MiB; anything else stops the service at start). A request, batch or crawl can lower it with `maxFileBytes`, never raise it (a larger value is HTTP 400 `invalid_request`). A file over the cap is `failed` with `body_too_large`, with its declared size in `file.declaredBytes` when the server sent one; it is not read further and nothing is saved or truncated. Web pages keep the 10 MiB body cap.
- **Other binary types** (images, audio, video, fonts, Word and PowerPoint documents, other archives) are `failed` with `unsupported_content_type`: not downloaded, not saved, not sent to the browser.
- A body that stalls or breaks off after the headers is `failed` with `timeout` or `connection_error`, with nothing saved (it was an internal error before).

What each kind returns:

| Kind | `markdown` | Status |
| --- | --- | --- |
| PDF | The text layer, a `<!-- page N -->` line before each page (below) | `success` with text; `partial` when the page cap (1000), the time budget (60 s, or less when the scrape's `timeout` is nearer) or an unreadable page stopped it short; `failed`/`empty_unverified` when no page has a text layer (a scan: no OCR); `failed`/`parse_error` when it cannot be opened (no PDF header, encrypted, malformed); `failed`/`timeout` when it did not open in time |
| CSV, JSON, text | The text as received, decoded by its byte-order mark, its declared charset or UTF-8 (the mark dropped) | `success`; without text and with a `text_not_decoded` warning when the bytes are not valid in that encoding |
| XLSX, XLS, ZIP | `null` | `success`; the file is the deliverable. Tables → CSV and XLSX parsing come later |
| Any, with no bytes | `null` | `empty_verified` |

`onlyMainContent`, `includeTags` and `excludeTags` do not apply to files, and `waitFor` is not waited for once the file arrives. A file result has no `document` or `metadata` and no `links`, and its `html` and `rawHtml`, when asked for, are `null`. The Evidence Record lists the file in `artifacts` as `{ kind: "file", path, sha256, bytes, contentType }` and names the extractor `pdf-text` (`PDF_TEXT_VERSION`) for a PDF or `file-text` (`FILE_TEXT_VERSION`) for another file; `outputSha256.markdown` covers the Markdown delivered.

JSON extraction reads a PDF deterministically: a schema key is matched, as on a web page, to the labels of the PDF's `Label: value` lines (for example `KPI 2: Reduction of carbon intensity` fills `kpi2`), and `fieldEvidence` gives each such field `{ source: "pdf", locator: "page N \"label\"" }`. Labels that state different values leave the field out with `field_ambiguous`; prose and table cells are not read, the PDF's metadata is not used, and `modelFallback` is not applied to PDF text (a `model_unavailable` issue says so), so a field not found is reported missing, never guessed. PDF text runs on the API process's thread: the 304-page IEA report takes under a second.

## PDF text

`pdfToMarkdown(bytes, options?)` in `packages/extract-tf` turns the bytes of a PDF into Markdown with page numbers, so a figure quoted from a report can be traced to its page. Scrape, batch, crawl, MCP and `/fc` use it for every PDF they fetch (see [Files](#files-pdf-csv-xlsx-zip-json)).

What it does:

- Reads the PDF's own text layer with Mozilla pdf.js (`pdfjs-dist` 6.3.289, Apache-2.0), in Node, without rendering.
- Starts each page with a line `<!-- page N -->`, N being the page's position in the file, and returns `pages[]`: each page's `text`, its printed `label` when the PDF declares one, and the `start` / `end` offsets of that text in the Markdown. `pdfPagesForSpan(pages, start, end)` names the pages any span of the Markdown came from.
- Rebuilds lines, spaces and paragraphs from text positions, reads multi-column pages column by column and keeps table rows as lines. A word hyphenated at a line end is joined; the hyphen is removed only where the document spells the word without it elsewhere.
- Reports `info` as the PDF declares it (title, author, producer, dates, language), null where it declares nothing.

What it does not do:

- No OCR: a page without a text layer (a scan) comes back empty with a `no_text_layer` warning.
- No table reconstruction: cells become lines of text, and every result with text carries `tables_unverified`.
- Running headers and footers stay in the text unless `repeatedLines: 'remove'`, which lists the removed lines per page.
- `maxPages` (default 1000) and `timeBudgetMs` (default 60 000, checked before each page) stop with a `page_cap` or `time_budget` warning and the pages read so far. Encrypted, malformed and non-PDF input returns `{ ok: false, error: { code, message } }` instead of throwing.

It is checked on 10 public reports, six of them the seed user's PDFs: [manifest](../research/pdf-corpus/manifest.v1.json), `node research/pdf-corpus/run.mjs`, runs in [research/pdf-corpus/runs/](../research/pdf-corpus/runs/).

Scrape, batch and crawl take Firecrawl's `parsers` to choose how a PDF is read (REST, SDK, MCP and `/fc`); other files are unaffected:

- Absent: every PDF's text layer, with the defaults above and page markers.
- `[]`: no PDF text. The file is saved as received and the result is `success` with `markdown: null` and a `pdf_not_parsed` file warning, as for a spreadsheet.
- One `pdf` entry, the string `"pdf"` or `{ "type": "pdf", "mode", "maxPages", "pages", "pageMarkers" }`:
  - `mode` is `fast` or `auto`, both the text-layer reader; `ocr` and the `image` parser are refused with HTTP 400 by name, since Octocrawl runs no OCR.
  - `maxPages` (1 to 10 000) reads the first pages. A document cut by the request's own `maxPages` stays `success`, with `file.pdf.pagesRead`, `pageCount` and a `page_cap` warning saying how much was read; only the default cap's cut is `partial`.
  - `pages: true` adds `pages: [{ pageNumber, markdown }]`, each page's text as the Markdown has it, without its marker (full and compact scrape responses, batch items, crawl pages, `/fc` `data.pages`).
  - `pageMarkers: false` leaves the `<!-- page N -->` lines out; `file.pdf.pages` offsets still locate each page in the Markdown. Natively they are on by default; on `/fc` they are off unless asked, as on Firecrawl.

A second entry, an unknown key or a value out of range is HTTP 400 naming it.
