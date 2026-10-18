# A PDF read for the /scrape/ page's file card (2026-10-18)

The /scrape/ page's "PDFs and files" card shows the start of a real PDF read. This is that read.

- Server: hosted API at `https://api.octocrawl.dev`. The Evidence Record names extractor commit `714af563856738b8a4d150eb666df0de32b99f25`; the live revision then was tag `h25lean` by the deploy notes, which the saved response does not itself show.
- Caller: keyless REST from Howard's Mac. The request to `api.octocrawl.dev` went through the shell's proxy (127.0.0.1:7890); the page fetch is made by the hosted server, which went direct (`access.egress.source: "direct"`, no proxy).
- Raw response, request body and headers are kept under `.w2l/scrape-demo/2026-10-18b/` (not committed).

Command:

```bash
curl -s -D pdf.headers.txt -X POST https://api.octocrawl.dev/v1/scrape -H 'content-type: application/json' --data @pdf.request.json -o pdf.response.json
```

Request body: `{"url":"https://arxiv.org/pdf/1706.03762","formats":["markdown"]}`

## Result

| Field | Value |
|---|---|
| status | success, HTTP 200 (response `date` 2026-10-18 10:19:44 GMT) |
| fetchedAt | 2026-10-18T10:19:41.743Z |
| finalUrl | https://arxiv.org/pdf/1706.03762 |
| lane | http |
| robots.txt | allowed |
| file | kind `pdf`, markdownFrom `pdf_text`, 2,215,244 bytes, sha256 `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697` (equal to rawSha256) |
| pages | pageCount 15, pagesRead 15 |
| warnings | `tables_unverified` (tables are not reconstructed; their cells become lines of text) |
| Markdown | 957 lines, 10,015 content tokens, outputSha256.markdown `319d1e934f00f5f88da1164b40554127eefa85569af1cb8760ef6bea17cb9f6d` |

The Markdown opens with `<!-- page 1 -->`, the paper's attribution notice, the title "Attention Is All You Need", the author block (names, affiliations, e-mail addresses), "Abstract" and the abstract; page 2 opens with `<!-- page 2 -->` and "1 Introduction". The card quotes the page markers, the title, "Abstract" and the abstract's first two lines, with "…" for the lines it leaves out, including the author block (`apps/public-web/src/product/scrapeRun.ts`, `PDF_READ`).
