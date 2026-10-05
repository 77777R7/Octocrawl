# From a URL list to a CSV with evidence

You have a list of web pages and PDFs, and you want a table: one row per URL, saying what W2L read, when, from where, and what it could not read and why. This guide builds that table for ten public data-centre sources, first with the `octocrawl` command line and then with the Python client. The two give the same columns.

The example list is [data-centre-urls.txt](data-centre-urls.txt). It holds ten URLs taken from the seed user's public source list ([research/coos-pilot/coos-links.csv](../../research/coos-pilot/coos-links.csv)): operator pages, two PDFs, a sustainability page that needs a browser, and four sources W2L could not read on 2026-10-03. Every output shown below is from that day's run, through an HTTP proxy, on commit `8356314` ([run record](../../research/parity/runs/2026-10-03-p2-guides.md)).

## 1. Install

W2L is not on npm or PyPI yet, so run it from a checkout. You need Node.js 22.13 or later, and Python 3.9 or later for the Python path.

```bash
git clone https://github.com/77777R7/w2l.git
cd w2l
npm ci
npx playwright install chromium
npx tsc -b
```

`npx playwright install chromium` is for pages that only render in a browser; W2L escalates to it on its own when the plain HTTP read is not enough.

`npx octocrawl` can replace `npm run w2l --` below, and `pip install 'octocrawl-client[pandas]'` the local install: the packages are published (0.3.0, 2026-10-05). The run below was made from a checkout.

If your shell sets `HTTPS_PROXY`, W2L sends its requests through that proxy and says so on its first line of output. Results can differ with and without a proxy, so note which one you used.

## 2. The command-line path

```bash
W2L_SOURCE_COMMIT=$(git rev-parse HEAD) npm run w2l -- batch \
  --urls-file docs/guides/data-centre-urls.txt \
  --formats markdown,tables \
  --out results/data-centres
```

- `--urls-file` reads one URL per line; blank lines and lines starting with `#` are skipped. A batch takes up to 1,000 URLs.
- `--formats markdown,tables` asks for the page text as Markdown and every HTML table as its own CSV.
- `W2L_SOURCE_COMMIT` records which W2L code read the pages. Without it, `source_commit` stays empty.

The run took about 10 seconds and ended with:

```
w2l: wrote 10 results (results.jsonl, results.csv), 8 Markdown files and 107 CSV tables to results/data-centres
```

The command exits 0 when the batch completed, even if some URLs failed. A failed URL is a row with its reason, not an error of the command. In `results/data-centres/` you get:

| File | What it holds |
| --- | --- |
| `results.csv` | One row per URL, with the evidence columns described below. |
| `results.jsonl` | Every result in full, one per line, including the complete Evidence Record. |
| `report.json` | The batch's counts: requested, completed, succeeded, failed. |
| `0001-<host-path>.md` … | The Markdown of each page that returned one; `markdown_file` in the CSV names it. |
| `0001-<host-path>.table-<i>.csv` … | Each HTML table of a page, numbered from 0 in page order. |

Rows are in the order the pages finished, not the order of your list. Sort by `url` if you need a stable order.

## 3. The Python path

The Python client talks to a running W2L server. Start one in a second terminal:

```bash
W2L_SOURCE_COMMIT=$(git rev-parse HEAD) npm run w2l -- serve --port 8787
```

Then install the client into a virtual environment, not your system Python:

```bash
python3 -m venv .venv
.venv/bin/pip install './python[pandas]'
```

```python
import octocrawl_client

urls = [line.strip() for line in open("docs/guides/data-centre-urls.txt") if line.strip() and not line.startswith("#")]
result = octocrawl_client.batch(urls, formats=["markdown", "tables"])
print(result.report["status"], result.report["succeeded"], result.report["failed"])

frame = result.to_pandas(include_markdown=False)
frame.to_csv("data-centre-evidence.csv", index=False)
```

Save it as `batch.py` in the checkout and run it with the virtual environment's Python:

```bash
.venv/bin/python batch.py
```

This printed `completed 6 4`: six URLs read, four not. The client reads the server address from `W2L_API_URL` (default `http://127.0.0.1:8787`). If your shell has a proxy, also set `NO_PROXY=127.0.0.1` so the client reaches the local server directly.

`to_pandas()` returns one row per URL, failed ones included, with the same columns as `results.csv` except `markdown_file`. Leave out `include_markdown=False` to get the page text as a `markdown` column. The tables are in `result.items[i]["tables"]`, each with its `csv`.

## 4. What each column means

These are the rows the command line wrote, shortened. Hashes are cut to 8 characters here; the file has all 64.

| url | status | reason | http_status | lane | robots_decision | extractor |
| --- | --- | --- | --- | --- | --- | --- |
| datacenters.google/efficiency/ | success | | 200 | http | no_robots | extract-tf/6 |
| docs.equinix.com/colocation/availability/ | success | | 200 | http | allowed | extract-tf/6 |
| www.ovhcloud.com/…/kpis_fy25.pdf | success | | 200 | http | allowed | pdf-text/1 |
| assets.sttelemediagdc.com/…/…Framework_2024.pdf | success | | 200 | http | no_robots | pdf-text/1 |
| datacenters.atmeta.com/all-locations/ | success | | 200 | http | allowed | extract-tf/6 |
| sustainability.aboutamazon.com/…/aws-cloud | success | | 200 | browser_local | allowed | extract-tf/6 |
| delivery-p112322-e1154416.adobeaemcloud.com/…/Equinix-Inc_2025_Data-Summary.pdf | failed | policy_denied | | http | disallowed | extract-tf/6 |
| investors.gds-services.com/…/gds-releases-2024-esg-report | failed | policy_denied | | http | disallowed | extract-tf/6 |
| www.ironmountain.com/data-centers/colocation | blocked | rate_limit | 429 | http | no_robots | extract-tf/6 |
| www.sec.gov/…/iren-20251231.htm | failed | http_error | 403 | http | allowed | extract-tf/6 |

| Column | Meaning |
| --- | --- |
| `url` | The URL you gave. |
| `status` | `success` or `partial` when there is content to use. `empty_verified` when the page is proven empty. `failed`, `blocked`, `cancelled`, `budget_exceeded` or `duplicate` otherwise. Only `success` and `partial` carry data. |
| `reason` | Why a row is not a success: for `failed`, values such as `http_error`, `timeout`, `dns_error` or `policy_denied`; for `blocked`, `rate_limit`, `captcha`, `cloudflare_challenge`, `login_wall` and the like. Empty for a success. |
| `final_url` | The URL that answered, after redirects. Cite this one. |
| `fetched_at` | When the answer arrived, in UTC (ISO 8601). This is your access date. |
| `http_status` | The server's HTTP status. Empty when no request was made. |
| `lane` | How the page was read: `http` (a plain request) or `browser_local` (a local headless Chromium, used when the page needs scripts to render). |
| `robots_decision` | What the site's robots.txt said about this URL: `allowed`, `disallowed`, or `no_robots` when the site has none. |
| `raw_sha256` | SHA-256 of the page as W2L read it, before extraction: the bytes of a file such as a PDF; the HTML text on the `http` lane (decompressed, as UTF-8); the HTML after rendering on a browser lane, as in the AWS row. |
| `markdown_sha256` | SHA-256 of the Markdown W2L delivered, the text in the `.md` file. |
| `extractor` | The program and version that turned the page into text: `extract-tf/6` for HTML, `pdf-text/1` for PDF text. |
| `source_commit` | The W2L commit that ran, when `W2L_SOURCE_COMMIT` was set. |
| `cache_state`, `cached_at` | `hit` or `miss` when you asked W2L to reuse earlier results with `--max-age`. On a hit, `cached_at` is when the reused copy was fetched. Empty otherwise: by default nothing is reused. |
| `markdown_file` | Command line only: the `.md` file beside the CSV. |

An empty cell means W2L did not observe that value. It is never a stand-in for 0. The Equinix PDF has no `http_status` because W2L never requested it.

A `blocked` or `failed` row can still have a `markdown_file`, as the Iron Mountain and SEC rows do: that file is the error page the site sent, kept as evidence of what happened. It is not data. Filter on `status`, never on whether a file exists.

## 5. Why the failed rows stay

The four rows that did not succeed are part of the result. Deleting them, or swapping in other URLs, would make the table say your sources were complete when they were not.

Each one says why, in terms you can act on:

- **Equinix 2025 Data Summary (PDF): `failed`, `policy_denied`, robots `disallowed`.** The host's robots.txt disallows every path, so W2L did not request the file. That was this run's rule; since 2026-10-05 a local server fetches a URL you name whatever robots.txt says, so the same command now reads the file and records `robots_decision` `disallowed` with a `robots_overridden` warning (a hosted server still refuses it). To put your own reason on the record, give a per-URL `robotsOverride`.
- **GDS ESG report: `failed`, `policy_denied`, robots `disallowed`.** Here the robots.txt itself did not answer within 5 seconds. A robots.txt that cannot be read counts as a full disallow (RFC 9309), and `results.jsonl` records `"unreachable": "timeout"` so it is not mistaken for a rule the site wrote. Since 2026-10-05 a local server fetches a URL you name past an unreadable robots.txt too, and keeps the reason on the record.
- **Iron Mountain: `blocked`, `rate_limit`, HTTP 429.** The site answered "too many requests". Run the URL again later; W2L will not get around a rate limit.
- **SEC 10-Q: `failed`, `http_error`, HTTP 403.** SEC refuses requests that do not identify their sender. Run it with `--mode research` and `W2L_CONTACT="Your Name you@example.org"`, which SEC's fair-access policy asks for. This guide did not re-run it that way.

When you report your data, report these counts too: here, 6 of 10 sources read, 4 not, each with its reason.

## 6. Tables

`--formats markdown,tables` wrote 107 table files: 72 from Google's efficiency page, 33 from Equinix's availability page and 2 from the AWS page. Each is a plain CSV of one HTML table, as plain text: a cell that spans rows or columns gives its value to every slot it covers, so no row is shifted. The same tables are in `results.jsonl` under each result's `tables`, with `tableIndex`, `caption` (`null` when the table has no `<caption>`), `sourceUrl` (the page's final URL) and `csvSha256` (the SHA-256 of the CSV file), so every table can be traced back to its row in `results.csv`. The two PDFs gave no tables: a PDF's tables, if any, are in its Markdown as text.

## 7. Check a hash

The hashes let anyone confirm later that a file is the one W2L recorded.

```bash
shasum -a 256 results/data-centres/0001-datacenters.google-efficiency.md
```

The result, `3235ac0f…`, equals `markdown_sha256` in that row. For a PDF, the file as received is kept under the task root, named by its hash (`.w2l/cli/files/<raw_sha256>.pdf`), so `raw_sha256` can be checked the same way (under `.w2l/api/files/` when the server read it). An HTML page is not kept by default; add `rawHtml` to `--formats` to keep it in `results.jsonl`. On the `http` lane, the SHA-256 of that text equals `raw_sha256`.

`raw_sha256` changes from one fetch to the next on many sites, because the HTML carries session tokens or timestamps. Google's page was read three times for this guide within four minutes: three different `raw_sha256` values, one `markdown_sha256`. Compare `markdown_sha256` to tell whether the content changed.

## Next

[Citing web data in a paper](citing-web-data.md) shows how to turn these columns into a methods section and a reference list.
