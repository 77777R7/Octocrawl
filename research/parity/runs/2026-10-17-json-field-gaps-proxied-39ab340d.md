# JSON field gaps re-run 2026-10-17

Command: `node run-json-gaps.mjs http://127.0.0.1:8787` (script below, kept outside the repository), against `npm run api` on port 8787.
Source commit: `39ab340d` (branch `claude/json-field-gaps`, on main `67d01484`).
Run: 2026-10-17T08:02:29Z → 2026-10-17T08:02:34Z.
Network: proxied. The API followed `HTTPS_PROXY=http://127.0.0.1:7890` from the shell (its start-up line says so); the runner reached the API directly (`NO_PROXY=127.0.0.1`). Every request sent `fastMode: true`, so each page was read over HTTP alone, as the hosted scrapes that showed the gaps were (server commit `cd0cbec7`).

Gaps seen on hosted scrape at `cd0cbec7` and what this run returned (— : the hosted run did not ask for that field):

| Page | Field | Hosted at `cd0cbec7` | This run |
| --- | --- | --- | --- |
| arXiv 1706.03762 | `title` | `Computer Science > Computation and Language` (first h1) | `Attention Is All You Need` (`meta[name="citation_title"]`) |
| arXiv 1706.03762 | `authors` | null | the eight `citation_author` values |
| arXiv 1706.03762 | `date` | — | `2017/06/12` (`citation_date`) |
| arXiv 1706.03762 | `submitted` | null | null, `field_unavailable`: the page states it only in prose ("Submitted on 12 Jun 2017"), and `citation_date` names a publication date |
| arXiv 1706.03762 | `doi` | null | null, `field_unavailable`: the page has no `citation_doi` tag, and its DOI row's label cell is empty (`&nbsp;`) |
| arXiv 1706.03762 | `citeAs` | — | `arXiv:1706.03762 [cs.CL]` (row label `Cite as:`) |
| GOV.UK news story | `description` | null | the `<meta name="description">` text |
| GOV.UK news story | `headline`, `datePublished` | null | from the NewsArticle JSON-LD (`name`, `datePublished`) |
| github.com/python/cpython | `description` | null | the `<meta name="description">` text |
| Wikipedia Octopus | `kingdom`, `order` | null | `Animalia`, `Octopoda Leach, 1818[1]` (rows `Kingdom:`, `Order:`) |
| Wikipedia Octopus | `tables` | 7 tables, cladogram layout | 1 table (the taxobox, 15×2) |

The GOV.UK story the gap was first seen on was not named; this run used the newest news story on 2026-10-17, `approved-training-course-for-inquests`. The arXiv page has no `citation_doi` tag, contrary to the gap report; the DOI is only a link in an unlabelled row.

Controls: the Python article's infobox labels (`th` cells) still match (`paradigm`, `designedBy`), and its tables are unchanged in kind (24×2 infobox, 17×4 data table).

Seen but not changed here: GitHub's `title` is the README's first heading (`This is Python version 3.16.0 alpha 1+dev`), not the repository name; Wikipedia's `order` keeps the page's reference marker `[1]`.

## Second run at `82fa9600`

After review, `82fa9600` stopped declared values from filling a field whose labels disagree, a product page's `description` and a `name` key. The same command ran against it, proxied in the same way, 2026-10-17T08:19:08Z → 2026-10-17T08:19:13Z. On all five pages `json.data`, `json.issues`, statuses and table sizes were identical to the first run below.

## Results (first run, `39ab340d`)

### https://arxiv.org/abs/1706.03762

HTTP 200; status `success`; lane `http`; json.status `complete`

```json
{
 "data": {
  "title": "Attention Is All You Need",
  "authors": [
   "Vaswani, Ashish",
   "Shazeer, Noam",
   "Parmar, Niki",
   "Uszkoreit, Jakob",
   "Jones, Llion",
   "Gomez, Aidan N.",
   "Kaiser, Lukasz",
   "Polosukhin, Illia"
  ],
  "date": "2017/06/12",
  "comments": "15 pages, 5 figures",
  "citeAs": "arXiv:1706.03762 [cs.CL]",
  "author": null,
  "doi": null,
  "submitted": null
 },
 "evidence": [
  {
   "path": "/title",
   "source": "meta",
   "evidencePath": "meta[name=\"citation_title\"]"
  },
  {
   "path": "/authors",
   "source": "meta",
   "evidencePath": "meta[name=\"citation_author\"]"
  },
  {
   "path": "/date",
   "source": "meta",
   "evidencePath": "meta[name=\"citation_date\"]"
  },
  {
   "path": "/comments",
   "source": "dom",
   "evidencePath": "table[0] tr[0] \"Comments:\""
  },
  {
   "path": "/citeAs",
   "source": "dom",
   "evidencePath": "table[0] tr[2] \"Cite as:\""
  }
 ],
 "issues": [
  {
   "code": "field_unavailable",
   "path": "/author",
   "message": "the page declares 8 values for citation_author (meta[name=\"citation_author\"]); a string holds one, so none was chosen"
  },
  {
   "code": "field_unavailable",
   "path": "/doi",
   "message": "no verified source for this nullable field on the selected page"
  },
  {
   "code": "field_unavailable",
   "path": "/submitted",
   "message": "no verified source for this nullable field on the selected page"
  }
 ]
}
```

### https://www.gov.uk/government/news/approved-training-course-for-inquests

HTTP 200; status `success`; lane `http`; json.status `complete`

```json
{
 "data": {
  "title": "Applications open for inquest training course",
  "description": "Applications are now open for training providers to submit an inquest training course to us for approval.",
  "headline": "Applications open for inquest training course",
  "datePublished": "2026-10-08T15:53:00+01:00",
  "dateModified": "2026-10-16T13:00:37+01:00",
  "published": "8 October 2026"
 },
 "evidence": [
  {
   "path": "/title",
   "source": "dom",
   "evidencePath": "h1[0]"
  },
  {
   "path": "/description",
   "source": "meta",
   "evidencePath": "meta[name=\"description\"]"
  },
  {
   "path": "/headline",
   "source": "jsonld",
   "evidencePath": "ld+json[0] NewsArticle.name"
  },
  {
   "path": "/datePublished",
   "source": "jsonld",
   "evidencePath": "ld+json[0] NewsArticle.datePublished"
  },
  {
   "path": "/dateModified",
   "source": "jsonld",
   "evidencePath": "ld+json[0] NewsArticle.dateModified"
  },
  {
   "path": "/published",
   "source": "dom",
   "evidencePath": "dl[0] dt[1] \"Published:\""
  }
 ],
 "issues": []
}
```

### https://github.com/python/cpython

HTTP 200; status `success`; lane `http`; json.status `complete`

```json
{
 "data": {
  "title": "This is Python version 3.16.0 alpha 1+dev",
  "description": "The Python programming language. Contribute to python/cpython development by creating an account on GitHub."
 },
 "evidence": [
  {
   "path": "/title",
   "source": "dom",
   "evidencePath": "h1[0]"
  },
  {
   "path": "/description",
   "source": "meta",
   "evidencePath": "meta[name=\"description\"]"
  }
 ],
 "issues": []
}
```

### https://en.wikipedia.org/wiki/Octopus

HTTP 200; status `success`; lane `http`; json.status `complete`; tables 1

```json
{
 "data": {
  "title": "Octopus",
  "kingdom": "Animalia",
  "order": "Octopoda Leach, 1818[1]",
  "phylum": "Mollusca"
 },
 "evidence": [
  {
   "path": "/title",
   "source": "dom",
   "evidencePath": "h1[0]"
  },
  {
   "path": "/kingdom",
   "source": "dom",
   "evidencePath": "table[0] tr[4] \"Kingdom:\""
  },
  {
   "path": "/order",
   "source": "dom",
   "evidencePath": "table[0] tr[10] \"Order:\""
  },
  {
   "path": "/phylum",
   "source": "dom",
   "evidencePath": "table[0] tr[5] \"Phylum:\""
  }
 ],
 "issues": []
}
```

Table sizes (rows×columns): 15×2

### https://en.wikipedia.org/wiki/Python_(programming_language)

HTTP 200; status `success`; lane `http`; json.status `complete`; tables 2

```json
{
 "data": {
  "title": "Python (programming language)",
  "paradigm": "Multi-paradigm: object-oriented,[1] procedural (imperative), functional, structured, reflective",
  "designedBy": "Guido van Rossum"
 },
 "evidence": [
  {
   "path": "/title",
   "source": "dom",
   "evidencePath": "h1[0]"
  },
  {
   "path": "/paradigm",
   "source": "dom",
   "evidencePath": "table[0] tr[2] \"Paradigm\""
  },
  {
   "path": "/designedBy",
   "source": "dom",
   "evidencePath": "table[0] tr[3] \"Designed by\""
  }
 ],
 "issues": []
}
```

Table sizes (rows×columns): 24×2, 17×4

## Script

```js
// Re-runs the 2026-10-17 JSON field gaps against a local Octocrawl API and prints a Markdown summary.
const api = process.argv[2] ?? 'http://127.0.0.1:8787'
const s = { type: 'string' }
const ns = { type: ['string', 'null'] }
const cases = [
  { url: 'https://arxiv.org/abs/1706.03762', properties: { title: ns, authors: { type: ['array', 'null'], items: s }, author: ns, date: ns, doi: ns, submitted: ns, comments: ns, citeAs: ns } },
  { url: 'https://www.gov.uk/government/news/approved-training-course-for-inquests', properties: { title: ns, description: ns, headline: ns, datePublished: ns, dateModified: ns, published: ns } },
  { url: 'https://github.com/python/cpython', properties: { title: ns, description: ns } },
  { url: 'https://en.wikipedia.org/wiki/Octopus', properties: { title: ns, kingdom: ns, order: ns, phylum: ns }, tables: true },
  { url: 'https://en.wikipedia.org/wiki/Python_(programming_language)', properties: { title: ns, paradigm: ns, designedBy: ns }, tables: true },
]
for (const c of cases) {
  const body = { url: c.url, fastMode: true, formats: [{ type: 'json', schema: { type: 'object', properties: c.properties } }, ...(c.tables ? ['tables'] : [])] }
  const res = await fetch(`${api}/v1/scrape`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const out = await res.json()
  const data = out.data ?? out
  const json = data.json ?? {}
  console.log(`### ${c.url}\n`)
  console.log(`HTTP ${res.status}; status \`${data.status}\`; lane \`${data.lane ?? data.metadata?.lane ?? '?'}\`; json.status \`${json.status}\`${c.tables ? `; tables ${data.tables?.length}` : ''}\n`)
  console.log('```json')
  console.log(JSON.stringify({ data: json.data, evidence: json.evidence, issues: json.issues?.map(i => ({ code: i.code, path: i.path, message: i.message })) }, null, 1))
  console.log('```\n')
  if (c.tables) console.log(`Table sizes (rows×columns): ${(data.tables ?? []).map(t => `${t.rows.length}×${t.columns}`).join(', ')}\n`)
}
```
