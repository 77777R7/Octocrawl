# Scrape pages to Markdown for RAG

A retrieval pipeline needs clean text, and a source for every chunk it answers from. Octocrawl returns a page's main content as Markdown, with headings, tables, code blocks and absolute links kept, plus an Evidence Record. Each chunk can then carry the URL it came from, when that page was fetched, and a hash of the exact text. Octocrawl does not split or embed; that stays in your pipeline.

## One page

Hosted Octocrawl reads a public page with no account, 20 pages a day per address:

```bash
curl -s https://api.octocrawl.dev/v1/scrape \
  -H 'content-type: application/json' \
  -d '{"url": "https://docs.python.org/3/library/json.html", "formats": ["markdown"]}'
```

On 2026-10-09 at 18:17 UTC that page came back in 3.5 seconds as `success`: 33,037 characters of Markdown with 12 headings, 2 tables and 15 code blocks. One of its tables, as written in the Markdown:

```markdown
| JSON | Python |
| --- | --- |
| object | dict |
| array | list |
| string | str |
| number (int) | int |
```

And the fields you keep with each chunk, from the same answer's `evidenceRecord`:

```json
{
  "finalUrl": "https://docs.python.org/3/library/json.html",
  "fetchedAt": "2026-10-09T18:17:19.002Z",
  "httpStatus": 200,
  "outputSha256": { "markdown": "abec4b896a640b5115e809f43bd71b8decdf8842a7281f29d0499e10d588142d" },
  "extractor": { "name": "extract-tf", "version": "extract-tf/16" }
}
```

`metadata` adds the page's `title`, `description`, `language` and `canonicalUrl`. `usage.contentTokens` (8,260 here) is an estimate, about one token per four characters. It is not your model's tokenizer.

## What the Markdown keeps

- **Headings** become `#` to `######`, so you can split a page by section.
- **Tables** become GFM tables with the first row as the header. Add `"tables"` to `formats` to also get each table as rows and CSV.
- **Code** becomes fenced blocks, labelled with the language when the page names it.
- **Links and images** are inline, with relative addresses made absolute.
- **What is left out by default** (`onlyMainContent: true`): navigation, footers, sidebars, forms, buttons, scripts, cookie banners and ads. Set `"onlyMainContent": false` to keep the whole page. `includeTags` and `excludeTags` take CSS selectors to keep or drop parts.
- **A site's own marks stay.** The Python docs put a `[¶](#…)` anchor link after each heading, and it is in the Markdown; drop it in your pipeline if you do not want it.
- **PDFs** give their text layer, with a `<!-- page N -->` line before each page. A scanned PDF has no text layer to read, and Octocrawl does no OCR.

There is no length limit to set. A long page comes back in one piece, so split it on your side.

## Many pages

`map` lists a site's URLs, and `batch` reads up to 1,000 at once. Batch runs on your own computer, with no daily limit:

```bash
npx octocrawl map https://docs.python.org/3/tutorial/ --limit 6 > map.json
jq -r '.links[].url' map.json > urls.txt
npx octocrawl batch --urls-file urls.txt --formats markdown --out out
```

On the same day, with `octocrawl` 0.3.2, `map` returned the tutorial's first 6 pages and `batch` read all 6 as `success` in 5 seconds. `out/` then held one Markdown file per page, `0001-docs.python.org-3-tutorial.md` to `0006-docs.python.org-3-tutorial-datastructures.html.md`. It also held `results.csv`, one row per page with `final_url`, `fetched_at`, `status`, `markdown_sha256` and the Markdown file's name; `results.jsonl`, each page's whole answer with its `evidenceRecord`; and a `report.json`.

## From pages to chunks in Python

With `npx octocrawl serve` running in another terminal, the Python client (`pip install octocrawl-client`) reads the batch, and a few lines split it into chunks that keep their source:

```python
import json
import re

from octocrawl_client import W2L

urls = [line.strip() for line in open("urls.txt") if line.strip()]

with W2L() as client:  # http://127.0.0.1:8787, where `npx octocrawl serve` listens
    job = client.batch(urls, formats=["markdown"])

with open("chunks.jsonl", "w") as out:
    for item in job.items:
        if item["status"] not in ("success", "partial"):
            print("skipped", item["url"], item["status"], item.get("failureReason"))
            continue
        evidence = item["evidenceRecord"]
        # One chunk per section: split before each ## or ### heading.
        sections = re.split(r"\n(?=#{2,3} )", item["markdown"])
        for n, text in enumerate(sections):
            out.write(json.dumps({
                "id": f"{evidence['outputSha256']['markdown'][:16]}-{n}",
                "url": evidence["finalUrl"],
                "fetched_at": evidence["fetchedAt"],
                "markdown_sha256": evidence["outputSha256"]["markdown"],
                "text": text.strip(),
            }) + "\n")
```

Run against the same 6 URLs with `octocrawl-client` 0.3.2, it wrote 47 chunks, from 1 for the shortest page to 19 for the longest. One of them:

```json
{
  "id": "7796ececec1d7b26-1",
  "url": "https://docs.python.org/3/tutorial/interpreter.html",
  "fetched_at": "2026-10-09T18:18:34.976Z",
  "markdown_sha256": "7796ececec1d7b2694653908dbca0bf7bf476c5f0f2ea4b6d496bdf713d182f3",
  "text": "## 2.1. Invoking the Interpreter[¶](#invoking-the-interpreter)\n\nThe Python interpreter is usually installed as …"
}
```

Sections vary in size; the largest here was 17,212 characters. If your embedding model has a smaller limit, split further by paragraph or by length.

## Keep the source with every chunk

- **Cite** `finalUrl` and `fetchedAt`: where the text was read, and when.
- **Recognise unchanged pages** by `outputSha256.markdown`, the SHA-256 of the Markdown as delivered. The json page read through hosted Octocrawl and again through the local CLI gave the same hash, and so did the tutorial pages across two local runs. Skip re-embedding a page whose hash has not changed.
- **Do not deduplicate on `rawSha256`.** It hashes the response body, which on many sites changes between fetches when the content does not.
- **Check a chunk's page** by hashing the page's Markdown as UTF-8 and comparing it with `outputSha256.markdown`.

## Filter on status

Only `success` and `partial` carry the page's content. Any other result may still carry Markdown kept as evidence, such as the body of an error page, so filter on `status` and not on whether `markdown` is present. In a test batch with a 404 URL, that item came back `failed` with `failureReason: "http_error"`, and the code above skipped it.

See [Map a site](/docs/guides/map-site/) to choose the pages, [Page through batch results](/docs/guides/batch-results/) for larger batches, and the [Evidence Record](/docs/reference/#evidence-record) for every field it records.
