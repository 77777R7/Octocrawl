# Page intent and first-round decisions — 2026-10-16

Priority is a qualitative decision from business fit, observed query/page signals, existing asset depth and verification cost. It is not search volume, keyword difficulty, a ranking score or demonstrated paid demand. Owner for each row: Octocrawl site/content maintainer (Howard); Codex prepared this local batch. Technical URL inventory: `.w2l/seo-20261016/built-audit.json` and `audit-baseline.md`.

| Canonical page | Main intent / query family | Reader’s next step | Evidence / gap | Priority and local action |
| --- | --- | --- | --- | --- |
| `/` | Brand; web scraper for AI agents | Preview or choose API/MCP | Existing category/audience/value/CTA clear; 12 page impressions | Medium; retain layout/headline; correct stale privacy FAQ to match capability POST body |
| `/scrape/` | Web scraping API; page to Markdown API | Copy call, then reference/account | Real historical sandbox example and hosted/local distinctions exist; 3 impressions | High business fit; retain content, fix code-copy observation only |
| `/tools/` | Choose a free conversion tool | Pick distinct task | Hub has all three live tools | Medium; scope link-discovery card correctly |
| `/tools/url-to-markdown/` | URL/website to Markdown online | Run, inspect, copy/download; API/MCP | Existing form and limitations; no tool rows in GSC export | High useful entry; local output example and scoped claims |
| `/tools/website-to-text/` | Website/page to text | Plain-text copy/download | Same fetch, browser-side Markdown→text transform | High; same input example shows address/table/code differences |
| `/tools/link-extractor/` | Extract/discover sitemap and page links | Run whole-site/page mode, filter/export | Indexed URL verified; real map is capped discovery, not recursive crawl | High; title/description/hero match actual limits |
| `/blog/find-all-pages-on-a-website/` | Methods to find pages; completeness limits | Existing link extractor, then local crawl if needed | 1,632 page impressions; existing methods + evidence + tool link | High observed signal; keep substantive guide, do not duplicate as a new page |
| `/docs/connect-mcp/` | Connect web scraping MCP | Configure client and inspect first result | 17 impressions; existing client setup and historical run record | High; add result acceptance/troubleshooting boundary |
| `/blog/claude-code-web-scraping/` | Claude Code task walkthrough | Follow map→scrape→cite task, then setup | Existing task flow with historical examples; 6 impressions | Medium; keep task narrative distinct from configuration reference |
| `/blog/web-scraping-for-rag/` | Source-aware RAG ingestion | Batch locally, inspect/skips, split in own code | 2 impressions; historical 0.3.2 evidence; unsafe partial auto-ingestion in snippet | High evidence fit; conservative gate, preserve date/scope |
| `/docs/` | Product documentation/start | MCP or task-specific guide | Existing static entry, 7 impressions | Medium; unchanged |
| `/docs/reference/` | REST/SDK/options/Evidence Record | Implement exact API call | 13 impressions; implementation source supports reference | High supporting page; unchanged, linked contextually |
| `/docs/integrations/ai-sdk/` | Vercel AI SDK tools | Follow integration | Registered official integration doc | Medium; unchanged; current SDK compatibility not rerun |
| `/blog/extract-structured-data-from-web-page/` | Deterministic fields and evidence | Extraction options/reference | Historical field/source case, 2 impressions | Medium; unchanged |
| `/blog/scrape-list-of-urls/` | Batch URLs and retain failures | Local batch guide | Existing substantive case; 3 Web page impressions, 2 AI-report impressions | High supporting asset; retain; no duplicate “quality benchmark” |
| `/blog/scrape-website-with-login/` | Authorized own-browser reading | Local setup/access guide | Hosted and local scope must stay separate; 4 impressions | Medium; unchanged |
| `/docs/guides/amazon-product/` | Amazon.sg Beta verification | Exact supported workflow | Supported region/adapter boundary; 4 impressions | Medium; no SEO-driven product expansion |
| `/docs/guides/monitor-webhook/` | Local monitor→webhook | Run monitor locally | Existing task instructions; 5 impressions | Medium; unchanged |
| `/docs/limits/` | Limits/states/access | Choose eligible route | Existing states and support boundaries; 6 impressions | High trust/support; linked, no quota edits |
| `/blog/` | Browse six tutorials | Relevant article | Existing index + noindex categories | Medium; unchanged |
| `/changelog/` | Changes/releases | Release details | Dynamic history; 11 impressions | Low acquisition; no artificial lastmod |
| `/docs/privacy/`, `/docs/terms/`, `/docs/acceptable-use/`, `/docs/contact/` | Trust / policies / contact | Relevant policy/support | Real existing pages | Supporting; retain; no new credentials/auth flows |
| Conditional comparison draft | Firecrawl v1 migration scope | Audit actual calls, local shim or native API | Current Firecrawl docs use v2; Octocrawl shim is limited v1; no paid comparable runtime | Conditional; one unregistered local draft, no performance table |
| Quality-case draft | HTTP 200 vs task completion | Inspect status/readiness/configured checks | Four synthetic verdicts and existing rendered regression suite | Local fixture case only; keep separate from product/competitor performance claims |

Home explains the product; `/scrape/` explains programmatic use; tools perform individual tasks; MCP is setup; Claude Code is a task walkthrough; RAG is ingestion with provenance. The discovery article explains several discovery methods; Link Extractor performs one bounded method. Overlapping vocabulary is expected. No query-to-page cannibalization has been demonstrated, so no merge/delete is proposed.

## Bounded search and official-source review

Observed 16 Oct 2026; English queries. The web-search backend does not expose a fixed locale or ranking order: record discovery, not Google rank. A separate Google query with `hl=en&gl=us&pws=0` for `url to markdown` reached a verification page; stopped there, no CAPTCHA or UA bypass. Therefore no geographically controlled Google SERP baseline is claimed.

Search queries reviewed: `url to markdown converter`, `website to text link extractor`, `web scraping MCP Claude Code RAG`, `Octocrawl Firecrawl alternative` Follow-up searches also covered `find all pages on a website`, `web scraping API`, `link extractor online`, `website to text converter`, `web scraping MCP` and `web scraping for RAG` (plus the initial broad seeds). Results surfaced actual conversion tools, comparison articles and walkthroughs; only original vendor/product documentation supports product claims below. Search snapshots are in `search-results.tool.json`; snippets are not runtime tests.

| Observed source / type | Inspectable strengths | Octocrawl action / boundary |
| --- | --- | --- |
| [MarkdownTools URL converter](https://www.markdowntools.io/url-to-markdown) — conversion UI from search | Visible URL form, scope choice, copy/download instructions | Existing Octocrawl form already covers this; add concrete format example, not another form |
| [Markdown Please](https://www.markdownpls.com/url-to-markdown) — conversion UI from search | Preview/raw/copy/download and input restrictions | Keep first action obvious; show output differences and actual Octocrawl HTTP-only limits |
| [Firecrawl introduction](https://docs.firecrawl.dev/introduction) — official API docs | API examples and broader endpoint families; v2 paths | Do not equate partial `/fc/v1` shim with current Firecrawl compatibility |
| [Firecrawl self-host](https://docs.firecrawl.dev/contributing/self-host) and [pricing](https://www.firecrawl.dev/pricing) — official docs | Deployment and credit definitions | Compare deployment modes consistently; no synthetic cost/speed ranking. Pricing page has differing Monitor statements; exclude that number |
| [Crawl4AI docs](https://docs.crawl4ai.com/) — official quickstart | Python/browser setup plus cloud entry; broader extraction options | Do not describe Crawl4AI as local-only; distinguish documented capabilities from runtime checks |
| [Jina Reader](https://jina.ai/reader/) — official tool/docs | Prefix-URL entry, output controls, examples and API options | Simple next step matters; Octocrawl keeps its own MCP/API routes and evidence/status explanation |

The commercial comparison pages surfaced in search establish a comparison-page format, not their claimed performance or an Octocrawl opportunity size. No third-party traffic estimate, purchased backlink, new directory submission or search-volume number was used.

## First-round scope chosen from evidence

1. Correct discovery promises at the tool’s search snippet and first screen.
2. Show the same converted input as Markdown and plain text, with visible limits and reciprocal links.
3. Clarify acceptance of a connected MCP result and source-aware RAG ingestion.
4. Repair first-party proxy-event semantics and missing map/product actions.
5. Keep one migration draft and one fixture quality case outside route registration, llms output and sitemap.

New comparison intent is not served by a setup guide: it answers what does and does not migrate. New quality case isolates HTTP/content/task verdicts, rather than repeating a list-of-URLs tutorial. Both remain local review drafts; no new indexable route is created.
