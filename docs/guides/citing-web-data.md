# Citing web data in a paper

A reader of your paper should be able to tell which pages you used, when you read them, what you got, how it became text or numbers, and what you could not get. Octocrawl records all of that for every URL, in its Evidence Record. This guide shows where each fact is, how to write it into a methods section and a reference list, and what to keep so a reviewer can check it.

It continues from [From a URL list to a CSV with evidence](url-list-to-csv.md) and uses that guide's run: ten data-centre sources read on 2026-10-03 with Octocrawl at commit `8356314`.

## 1. Keep the evidence

Before you write anything, keep these files from the run, unchanged:

- `results.jsonl`: the full Evidence Record of every URL, failed ones included. Everything below can be rebuilt from it.
- `results.csv`: the same evidence as a table.
- The `.md` files and table `.csv` files you analysed.
- The files Octocrawl saved as received, such as PDFs, under the task root's `files/` directory.
- `rawHtml` from `results.jsonl`, if you asked for that format, for HTML pages.

Deposit them with your data (for example on Zenodo or OSF), or keep them where a reviewer can ask for them. The hashes in the records let anyone confirm that a deposited file is the one Octocrawl read and produced, without trusting you or Octocrawl.

## 2. Which field answers which question

Every Evidence Record has the same fields (schema `w2l.evidence/1`, in [packages/contracts/schemas/evidence-record.v1.json](../../packages/contracts/schemas/evidence-record.v1.json)). An unknown value is `null`, never a guess.

| A reader asks | Field | In the example |
| --- | --- | --- |
| Which page? | `finalUrl` (after redirects); `requestedUrl` and `redirectChain` for how it got there | `https://datacenters.google/efficiency/`, no redirect |
| When? | `fetchedAt`, UTC | `2026-10-03T06:31:24.334Z` |
| Did it work? | `status`, `reason`, `httpStatus` | `success`, `null`, `200` |
| What was read, before extraction? | `rawSha256` (a file's bytes; the HTML text on the `http` lane; the rendered HTML on a browser lane); `contentEncoding` | `1c12744d…`, `identity` (not compressed) |
| What did you analyse? | `outputSha256.markdown`; each table's `csvSha256` | `3235ac0f…`; `cf379cfd…` for table 0 |
| How was it turned into text? | `extractor.version`, `extractor.commit`; `lane` | `extract-tf/6`, `8356314…`, `http` |
| Were you allowed to read it? | `robotsDecision.decision`; `robotsDecision.userOverride` | `no_robots` (no robots.txt was found), `false` |
| Who asked, and how? | `identity.mode`, `identity.userAgent`, `identity.contact`, `identity.device`, `identity.requestHeaders` | `standard`, a desktop browser User-Agent, no contact, `desktop`, no extra headers |
| Through what network? | `proxy` | `127.0.0.1:7890`, a local proxy |

`identity.requestHeaders` lists the names of any custom headers you sent, each with a SHA-256 of its value, never the value itself, so a cookie or token you used does not end up in your evidence.

When a result came from Octocrawl's cache (`cache_state` `hit`), its Evidence Record is the one from the original fetch, and `cached_at` gives that fetch's time. Cite that time, not the time you ran the batch.

## 3. The methods section

Say what you collected, how, when, what failed, and where the evidence is. A paragraph built from the example run:

> We collected 10 public web sources on data-centre capacity and efficiency (operator web pages and two PDF reports) on 3 October 2026 at 06:31 UTC, using Octocrawl (commit 8356314; https://github.com/77777R7/w2l). Octocrawl requested each URL over HTTP, rendering it in a headless Chromium browser when the plain response did not yield the page's content (1 of 10), followed robots.txt, and identified itself with a standard browser User-Agent through a local HTTP proxy. HTML pages were converted to Markdown with the extract-tf/6 extractor and PDF text with pdf-text/1; HTML tables were exported as one CSV file per table. Six of the 10 sources were read. Four were not: two because robots.txt disallowed them (in one case because robots.txt could not be retrieved, which counts as a disallow), one because the site rate-limited the request (HTTP 429), and one because the server refused it (HTTP 403). We report all 10 in the supplementary table, with the time of access, the HTTP status and SHA-256 hashes of each page as read and of the text analysed. The full Octocrawl evidence records and the analysed files are deposited at [repository and DOI].

Adapt it, but keep three things in it:

- **The denominator.** "Six of the 10" and the reason for each of the other four. A reader cannot judge coverage from the six alone.
- **The versions.** The Octocrawl commit and the extractor versions. A later extractor may turn the same page into different text.
- **How you identified yourself.** In `standard` mode Octocrawl presents an ordinary browser User-Agent. With `--mode research` it declares itself as a bot, and with `W2L_CONTACT` it names you. Some sites, such as sec.gov, require that; state which one you used.

If you used a `robotsOverride` for any URL, `robotsDecision.userOverride` is `true` in its record. Say so in the methods, and why: for example, that the file is the publisher's own report and was fetched once for citation.

## 4. Citing a single page

Treat a page like any other online source: author or publisher, title, year when known, URL, and the date you accessed it. Use `final_url` and the date part of `fetched_at` (UTC). The hash is optional in the reference itself, but it makes the citation checkable. Put it in a note, or in the supplementary table.

APA style:

> Google. (n.d.). *Power usage effectiveness – Google Data Centers*. Retrieved October 3, 2026, from https://datacenters.google/efficiency/

BibTeX (biblatex):

```bibtex
@online{google_pue,
  author  = {{Google}},
  title   = {Power usage effectiveness -- Google Data Centers},
  url     = {https://datacenters.google/efficiency/},
  urldate = {2026-10-03},
  note    = {Accessed 2026-10-03T06:31:24Z with W2L (commit 8356314). SHA-256 of the extracted Markdown: 3235ac0f85cc90b6751e5288781f683fc2940b2c5dff9f9265f8e98b0c535c93}
}
```

The title is the page's own `<title>`, in `metadata.title` in `results.jsonl`.

Which hash should you cite? Cite `markdown_sha256` (or a table's `csvSha256`) for what you analysed. `raw_sha256` identifies the page as Octocrawl read it (for a browser-rendered page, the HTML after rendering), but many sites change their HTML on every request: Google's page, read three times within four minutes, had three different `raw_sha256` values and identical Markdown. For a PDF or another file the two are stable, and `raw_sha256` identifies the document itself.

A web page can change or disappear after you read it. The hash proves which version you used only if you keep that version (section 1). If the page matters to your argument, consider also submitting it to a public web archive and citing the archived copy alongside it.

## 5. Personal data and permission

Octocrawl follows robots.txt and records what it decided, but robots.txt is not permission to use the content for any purpose. Before you collect:

- **Personal data.** If your sources contain information about identifiable people (names, contact details, posts, profiles), your project may need ethics approval or another legal basis under the data-protection law that applies to you, such as the GDPR. Ask your institution's ethics board before collecting, not after.
- **Terms of use and copyright.** A site's terms may restrict automated access or reuse. Quoting and analysing for research is often allowed; republishing the full text is often not. Deposit hashes and your derived data where you cannot deposit the pages themselves.
- **Blocked is an answer.** A `blocked` row (a CAPTCHA, a login wall, a rate limit) means the site did not want automated access at that moment. Report it as missing data rather than finding another way around it.

## 6. Beyond this guide

Octocrawl Pro's Evidence Pack, planned for a later release, will bundle these files with a generated methods paragraph and citation files; nothing in this guide depends on it.
