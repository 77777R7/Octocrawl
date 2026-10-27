# SEO research for the Octocrawl core SEO framework (2026-10-27)

This is a dated record of one research run. It is not edited afterwards; a later run gets its own dated file. The framework that uses it is [docs/seo/core-seo-framework.md](../../docs/seo/core-seo-framework.md).

- Requested by: Howard, to ground a core SEO framework modelled on a reference plan for another product.
- Source commit of the checkout: `6a57fc3b` (branch `claude/core-seo-framework-a6ced2`).
- Run on 2026-10-27, on one Mac. `curl`, `gh` and `gcloud` calls went through the shell proxy (`HTTPS_PROXY=http://127.0.0.1:7890`); the `WebSearch` and `WebFetch` tools did not go through it. Where a result depends on the route, the section says so.
- Raw results (JSON per group, GSC responses, scout summaries) are kept in `.w2l/seo/2026-10-27/` (git-ignored). Raw sitemaps and page captures were in the session scratchpad only.
- No keyword-volume tool, backlink tool or rank tracker was available. Every search volume, keyword difficulty and backlink count below is therefore **unknown, not zero**, unless a third-party page printed it (marked as an estimate).

## 1. What ran, and what did not

Two workflows. First, 5 read-only scouts read the repository and memory notes. Second, 32 agents: 26 research agents in 7 groups, each group followed by one verifier that tried to refute a sample (6 verifiers; the GSC group has none, its window C is cross-checked against the documented baseline instead).


| Group | What it did | Outcome |
|---|---|---|
| Fresh GSC | Search Console API for `sc-domain:octocrawl.dev`, 3 windows | Worked. Window C reproduced the documented baseline exactly. |
| Competitor structure (11 sites) | Sitemaps counted by path group; sample pages fetched | Worked for all 11. Page anatomy sampled on 7 to 15 pages per site, not exhaustive. |
| Keyword SERPs (6 clusters, 71 keywords) | Autocomplete + top results | **Weak SERP source.** Bing through curl returned unrelated results and DuckDuckGo answered 202 challenges, so every row but two rests on the `WebSearch` tool list (9 to 10 results, no region control). The two B rows `context7 alternative` and `context7 rate limit` were read from DuckDuckGo html before it started answering 202; a second source did not reproduce them. No Google SERP was requested. People Also Ask and AI answer boxes were not observable. |
| Community (HN, Reddit, GitHub) | Algolia HN API, Reddit routes, `gh` read-only | HN 94 items and GitHub 120 items worked. **Reddit failed on every route** (see 6.3); 1 mirror item only. |
| Market proxies and traffic estimates | npm, PyPI, GitHub APIs; free estimator pages | Package and GitHub numbers worked. Semrush free pages printed numbers for 4 of 10 domains; Similarweb 403, Ahrefs needs JS, others behind Cloudflare challenges (not bypassed). |
| External-link candidates | 25 listicle pages and 15 ecosystems read | 20 of 25 listicle pages readable; 4 returned 403 challenges, 1 a 404. |
| Search-engine policy | 14 official Google, Bing and IndexNow pages | Worked. Bing guidelines needed a headless browser. |

## 2. Verification results (one verifier per group)

Each verifier received only the first ~60 KB of its group's JSON, so it could check only the part it saw. What each verifier says it did not check is listed under the table.

| Group | Confirmed | Mismatch | Unverifiable | Verdict |
|---|---|---|---|---|
| Competitors | 22 | 2 | 1 | The sitemap counts and path groups for Firecrawl, Jina AI and Apify reproduce exactly (0 percent difference, except one regex-dependent blog count off by 1), and the compare and pagesPresent claims I checked all hold. Two defects found: the wrong H1 ('ESPN') stored for Firecrawl's uniprot-org sample, and the Jina /news count of 150 that should be 159. Only 3 of the requested 5 competitors could be checked because th… |
| Keywords | 14 | 7 | 0 | The SERP rows for the 10 sampled keywords mostly reproduce (8 of 10), but 7 of 7 reproducing rows come from the same WebSearch tool as the original, so they are a determinism check, not an independent re-read; the two B-wedge rows that were read from DuckDuckGo (context7 alternative, context7 rate limit) could not be reproduced because DuckDuckGo now returns a 202 challenge. Several secondary claims are wrong or ove… |
| Community | 13 | 3 | 0 | The HN items are mostly sound: of 15 HN items checked against the Algolia API, 12 match on text, date and thread counts, and 3 have a paraphrase error (one invented 'halved bill', one misattributed WebFetch limit, one wrong 'tried both'). The Reddit entry exists and its counts match, but it wrongly says no comment text was captured, and the three theme counts I rechecked (token-cost 9, js-rendering 4, self-host-pref… |
| External links | 12 | 2 | 0 | The sampled routes, costs and rel attributes mostly reproduce: 12 of 14 items matched the live pages fetched on 2026-10-27, including all 7 rel re-reads (Proxyway, Geekflare, HackerNoon, eesel, WebCrawlerAPI, Octoparse, ZenRows) and the Vercel AI SDK tool-page links. Two cost fields are overstated or one-sided (Claude Market omits that its form intro says 'Basic listing is free' while offering only paid plans; Enter… |
| Policy | 13 | 1 | 0 | Of 14 sampled items from 8 official Google pages, 13 are reproduced as claimed with matching wording: scaled content abuse, the sitemap 50,000 URL / 50 MB limit, no special AI markup on the AI features page, llms.txt ignored, and SoftwareApplication requirements. The one mismatch is minor: the FAQ quote is cited to the #removing-faq-rich-result anchor, but it sits in the May 8 deprecation entry, while the cited anch… |
| Market | 21 | 0 | 0 | Every sampled metric reproduced: 7 npm counts and 5 PyPI counts matched exactly, and 6 GitHub repos matched, with star drift of 1 to 3 and forks, issues and dates unchanged. All three re-opened Semrush pages (HTTP 200, via the shell proxy) print the claimed visits, organic traffic, authority score, referring domains, backlinks and rank. No metric is a number without an openable source page in the sample. |

Not sampled, per verifier (so silence is not read as coverage):

- **Competitors**: "The input was truncated after the start of the Apify entry (mid-way through its integrations sample), and any competitors after Apify were not visible, so only Firecrawl, Jina AI and Apify were checked, not 5. Not checked: the other competitors; blog.apify.com (835 posts, 991 URLs) and docs.apify.com (722 URLs) counts; Firecrawl docs sitemap hreflang; the Apify /.well-known/ard.json claim; Jina's robots.txt comments about 140 URLs and /pricing/ returning 404; per-page word counts, JSON-LD types, difflib similarit…
- **Keywords**: The input was truncated partway through the B-wedge cluster. B rows 'convert documentation to markdown for llm', 'scrape documentation website for llm' and 'give claude code access to documentation' were cut off, and every later B row and every other cluster (C onward) never reached me. None of those were checked. Within what I received, not sampled: A rows 'web scraper for llm', 'web crawler api', 'crawl website to markdown', 'mcp server web scraping', 'web scraping api' (SERP; the first has autocomplete checked…
- **Community**: GitHub: no GitHub items were in the supplied JSON (there are files under research/comm-github that I did not check). Of the 94 curated HN items I opened 15 (16%), skewed to high-relevance and SIGNAL items. I did not check the other 79, including the 'Story:' market items, the llms.txt/Accept-markdown group (only 49468328's thread was seen), and the docs-for-coding-agents group beyond 44681524. I did not recount theme membership against the page text, only the per-theme totals in curated_items.json and three themes…
- **External links**: AlternativeTo, KDnuggets, Upwork, DesignRush, Clay (the blocked or 404 pages; I did not retry them); Techjockey, Gumloop, Olostep, Skyvern, TinyFish, ScrapingBee, Scrapfly, WebScraping.AI and the second ZenRows page; Geekflare's disclosure page. Ecosystem group not checked: Dify, n8n, Flowise, CrewAI, Haystack, LlamaIndex, Hugging Face, lorien/h4ckf0r0day/Shubhamsaboo awesome lists, PyPI/npm metadata and npm download counts, Claude Code directory and claude-plugins-official, cursor.directory, and the rel attribute…
- **Policy**: "Not re-opened: sd-policies, crawl-budget, seo-starter-guide, creating-helpful-content, Bing webmaster guidelines (client-rendered, needs a headless browser) and Bing Link Building page, IndexNow documentation and FAQ, Microsoft Advertising blog. Also not checked: the sampled spam-policies claims on keyword stuffing, cookie-cutter templates and the 'policy circumvention' implication were only partly read, and I did not re-check the year (2023) on the FAQ government/health entry. All the gates (G1 to G20) are inter…
- **Market**: "Not re-checked: @octocrawl/sdk, @octocrawl/cli, firecrawl-cli, tavily-mcp, @playwright/mcp, @brightdata/mcp and @icjia/forgecrawl npm counts; the stale /last-month window claim and the @modelcontextprotocol/server-fetch not-found claim; GitHub data for brightdata-mcp, mcp-read-website-fast and firecrawl-mcp-server, and all release-date and license notes; the landscape list, npm search ranks and topic-search star counts (Scrapling, webclaw, crw and others); the publish dates of octocrawl on npm and PyPI. Semrush:…

Corrections the verifiers asked for (applied below where the item is used):

- Firecrawl programmaticPatterns /alexandria/<provider-slug> sampleAnatomy for uniprot-org: h1 should be 'UniProt', not 'ESPN' (fetched 2026-10-27).
- Jina programmaticPatterns /news/<slug> count: change 150 to 159 (160 English /news URLs including the index; the original already flagged 150 as unmeasured).
- Firecrawl blog best-/top- slug count: my regex gives 60, the original says 61; treat as 60 to 61 depending on the regex (not a material difference).
- Firecrawl /alexandria/<provider-slug> 383: path depth is two segments (/alexandria/<slug>), not depth 3 as the note says; the number 383 itself is right (384 minus the alternatives index).
- A web data api for ai agents: change 'launch listing shows 4 Product Hunt upvotes' to '0 upvotes and 1 comment (hunted.space, fetched 2026-10-27)'.
- A web scraper for llm: demandSignals 'exact phrase plus 9 extensions' should be 'Google echoes the typed phrase plus 9 neighbouring queries; none starts with the phrase'. exactPhraseInAutocomplete is true only via the echo.
- B context7 alternative: 'all extensions of the phrase' should be '6 of 10 start with the phrase; 4 insert words (best, better, oss, offline)'.
- B context7 rate limit: pageType of https://context7.com/plans should be 'pricing page', not 'vendor homepage'.
- A web scraping api for ai agents: pageType of the scrapegraphai.com glossary URL should be 'blog/glossary article', not 'vendor comparison'.
- A website to markdown api: reason says 'no Firecrawl, Apify or Jina in view'; Apify (apify.com/imapp/web-markdown-api) now appears at rank 5 in my list.
- B context7 alternative and B context7 rate limit: mark the top5 lists as unreproduced by a second source. My WebSearch lists share 0 and 2 domains with the DuckDuckGo-based lists. Do not read 'official Context7 pages hold ranks 1,3,7,8' as verified.
- All rows: ranks come from a search-tool list order, not Google or Bing. State that wherever a 'rank N' is quoted.
- HN 48848110: remove 'customers halved bill and error rate'. The comment says only that customers anecdotally saw error rates 'drop quite dramatically', with no claim about the bill.
- HN 44681524: replace 'another says they tried both' with 'a reply (eikaramba) says ref.tools did really bad in their tests and hallucinated wrong documentation'. This is counter-evidence to the Ref recommendation.
- HN 48867021: the 'returns nothing on JS-rendered and some anti-bot pages' remark is about Claude Code's built-in WebFetch (quotes.toscrape.com/js, nike.com 403), not about 'Markdown stripping'. Also mark the post as a promo by the author of an open-source stealth-browser MCP.
- Reddit r/rag item: 'the 7 comments were not captured' is wrong. The snapshot shows 4 captured comments (Scrapy; Spider, Screaming Frog, ParseHub, Octoparse; a residential-proxy vendor ad; a short remark). 'Posted' reads 173 days ago, not 172. Note the post author is the Context.dev founder who also appears on HN as TheYahiaBako…
- The results given to me contain only the HN and Reddit sources and end mid-sentence in the Reddit takeaways. No GitHub source or items appear in them, so the 'three sources' coverage is not shown in what I received. The GitHub raw files exist under comm-github but are not part of this payload.
- Claude Market (claudemarket.ai/submit): cost 'paid' should read 'paid options only in the form ($10 Standard, $79/mo top of feed); the intro text says Basic listing is free but no free plan is selectable'. Note the contradiction on the page.
- Enterprise DNA Directories (enterprisedna.co/directories/submit): cost 'free' should be 'unknown (no price shown on the page)'.
- HackerNoon: 'All 5 external links sponsored' should read '6 sponsored anchors: 4 oxylabs.go2cloud.org, 1 import.io, 1 self-link to the same HackerNoon article (not external)'. Conclusion unchanged.
- Cursor Publisher Terms: the copyleft exclusion is in the Plugin publication section next to 3.3/3.4 (the sentence precedes '3.3 License Grant to Users'); do not cite 'Terms 3.3' without re-reading the exact number. The free-of-charge claim is in 3.1.
- FAQ rich results are gone: the quote 'This feature will no longer appear in Google Search starting May 7, 2026' is in the 'May 8 Deprecating the FAQ rich result feature' entry (anchors #faq-deprecation / #deprecating-the-faq-rich-result-feature), not at #removing-faq-rich-result. The #removing-faq-rich-result anchor is the June…
- Keyword ranks: every "rank" is the order in a search-tool result list, not a Google or Bing position. Do not quote them as rankings.

## 3. Fresh Google Search Console baseline (fetched 2026-10-27)

Method: `gcloud auth application-default print-access-token`; header `x-goog-user-project: octopus-w2l-20260924-7r7`; `POST https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aoctocrawl.dev/searchAnalytics/query`; 13 calls, all HTTP 200; through the shell proxy. Raw JSON: `.w2l/seo/2026-10-27/raw-gsc/`.

| Window | Dates | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|---|
| A (28d) | 2026-09-28 to 2026-10-25 | 6 | 17465 | 0.034% | 72.2 |
| B (last 14d) | 2026-10-12 to 2026-10-25 | 6 | 17086 | 0.035% | 72.3 |
| C (cross-check) | 2026-09-16 to 2026-10-13 | 0 | 1689 | 0.000% | 69.8 |

Window C equals `docs/seo/measurement.md:9` (0 clicks, 1,689 impressions, position 69.8): the documented baseline is reproducible.

Weekly roll-up (sums of the API date table, computed here): week of 2026-09-28: 0 clicks, 5 impressions; week of 2026-10-05: 0 clicks, 374 impressions; week of 2026-10-12: 3 clicks, 7594 impressions; week of 2026-10-19: 3 clicks, 9492 impressions. The first week covers 2026-09-30 to 2026-10-04 only (the API has no rows before 09-30).

Pages, window A (top 12 by impressions):

| Page | Clicks | Impressions | Position |
|---|---|---|---|
| /blog/find-all-pages-on-a-website/ | 0 | 17176 | 72.7 |
| /tools/link-extractor/ | 0 | 562 | 80 |
| /changelog/ | 0 | 35 | 5.3 |
| / | 5 | 33 | 4.2 |
| /scrape/ | 1 | 30 | 27.9 |
| /docs/reference/ | 0 | 22 | 15.8 |
| /blog/claude-code-web-scraping/ | 0 | 21 | 67.9 |
| /docs/ | 1 | 19 | 4.1 |
| /docs/connect-mcp/ | 0 | 19 | 7.2 |
| /blog/scrape-website-with-login/ | 0 | 17 | 28.4 |
| /blog/extract-structured-data-from-web-page/ | 0 | 13 | 48.3 |
| /docs/integrations/ai-sdk/ | 0 | 11 | 45.3 |

Queries, window A: 107 query strings returned (rowLimit 250 not reached). 77 of them (72%) are "find / list / see all pages of a website" variants and hold 17,227 of 17,303 listed impressions (99.6%), mostly at positions 64 to 84 and nine regex-matched variants at 85 to 99, 0 clicks. 99.6% is of the 17,303 listed impressions; against the 17,465 property total it is 98.6%. The 77/30 split is a regex on the query text and is approximate. The other 30 queries hold 76 impressions together; the API/MCP-flavoured ones ("web scraping mcp", "website crawler mcp", "markdown scraper api", "sitemap parser api", "website link extractor api") have 4 to 6 impressions each at positions 69 to 88. No query contains "octocrawl". The 6 clicks cannot be tied to a query (162 impressions and all 6 clicks are not attributed to a listed query, which Google anonymises).

Visibility cross-check (computed here from `raw-gsc/A_page.json` and `A_querypage.json`, not by the agent): the page table holds 18,035 impressions in total (a different aggregation from the 17,465 property total); 21 page rows with average position <= 20 hold 193 of them (1.1%), led by `/changelog/` 35, `/` 33, `/docs/reference/` 22, `/docs/` 19, `/docs/connect-mcp/` 19. The query x page table (129 rows) has only 2 rows at position <= 20, each 1 impression (`http://127.0.0.1:8791`, `octoscrape`), because the queries behind the well-ranked pages are anonymised. `/tools/link-extractor/` has 33 query rows and 559 impressions, all of the "find all pages" kind, at positions about 72 to 92.

Top queries (window A):

| Query | Impressions | Position |
|---|---|---|
| how to see all pages of a website | 392 | 70.1 |
| find all subpages of a website | 380 | 64.2 |
| how to find all the pages on a website | 373 | 71.8 |
| see all pages of a website | 359 | 75.1 |
| list all pages on a website | 353 | 68.1 |
| how to find all pages on a website | 346 | 69.7 |
| find all pages on a website online | 332 | 79.1 |
| list all web pages on a website | 298 | 70.4 |
| how to find all pages in a website | 297 | 70.5 |
| find all pages on website | 295 | 73 |

Clicks by country: France 2, Singapore 2, Jordan 1, Pakistan 1 (rows with very few impressions). Devices: desktop 14,397 impressions (82%), mobile 2,748, tablet 320.

Unknown (from the agent's report): why impressions jumped on 2026-10-10 and 2026-10-13 (the earlier note blames one blog post at position ~75 plus a scanner; not re-verified); the full country split (the API call used rowLimit 15 and returned countries ordered by clicks); whether a brand query with a very low volume is hidden by anonymisation; the page table sums to 8 clicks against 6 at property level (aggregation difference).


## 4. Competitor site structure from sitemaps (fetched 2026-10-27)

Counts are `<loc>` entries in the sitemaps each `robots.txt` names, grouped by path. A sitemap entry is not proof of indexing and says nothing about traffic. Coverage and skipped files are in `.w2l/seo/2026-10-27/comp.json`.

| Site | Host counted | URLs counted | Largest groups |
|---|---|---|---|
| Firecrawl | firecrawl.dev (canonical host www.firecrawl.dev; docs.firecrawl.dev) | 2,827 | docs.firecrawl.dev/{es,fr,ja,pt-BR,zh}/... 1,235; /alexandria/<provider-slug> 383; /blog 350; docs.firecrawl.dev/ (English, all) 250 |
| Jina AI (Reader) | jina.ai | 1,510 | locale mirrors /{de,fr,es,it,zh-CN,zh-TW,ja,ko,ru}/ (cross-cutting view) 1,305; /news/ (all 10 locales) 1,060; /models/ (all 10 locales) 310; /api-dashboard/ (pricing, playground) 20 |
| Apify | apify.com | 827,662 | /<owner>/<actor>/examples/<slug> 117,445; /<owner>/<actor> 100,528; /<owner>/<actor>/api 98,239; /<owner>/<actor>/api/cli 98,239 |
| ScrapingBee | scrapingbee.com (canonical host www.scrapingbee.com) | 1,136 | /scrapers/ 431; /blog/ 392; /webscraping-questions/ 163; /tutorials/ 47 |
| ZenRows | zenrows.com (canonical host www.zenrows.com; apex 301-redirects to www) | 840 | /blog 435; /glossary 98; /use-cases 61; /scrape 58 |
| Crawl4AI | docs.crawl4ai.com | 89 | /core/ 23; /blog/releases/ 18; /advanced/ 16; /api/ 9 |
| Spider | spider.cloud | 340 | /scrapers 91; /proxy-locations 71; /docs 46; /blog 41 |
| Tavily | tavily.com (and docs.tavily.com, separate host with its own sitemap) | 296 | docs.tavily.com/documentation/* 83; tavily.com/blog 81; docs.tavily.com/documentation/integrations 51; tavily.com/integrations 42 |
| Context7 (Upstash) | context7.com | 142,921 | /<owner>/<repo> 93,934; /websites/<slug> 45,090; /llmstxt/<slug> 2,851; /soenneker/* 1,054 |
| Octoparse | octoparse.com (canonical host www.octoparse.com) | 1,719 | /template/<slug> 681; /blog/<slug> 478; /docs/en/ 199; /docs/jp/ 162 |
| Axiom.ai | axiom.ai | 693 | /docs/no-code-tool/ 258; /guides/ 91; /docs/no-code-tool/reference/steps/ 90; /blog/ 80 |

Page types present, as the agents reported them (trimmed):

| Site | Compare / alternatives | Use cases | Integrations | Per-site / entity pages |
|---|---|---|---|---|
| Firecrawl | 22 pages at /alternatives (21 firecrawl-vs-<competitor>, e.g. firecrawl-vs-tavily, firecrawl-v… | 20 pages at /use-cases (e.g. coding-agents, deep-research, seo-teams) + 13 at docs.f… | 23 pages at /integrations (e.g. claude-code, cursor, codex, langchain, mcp/windsurf,… | 383 pages at /alexandria/<provider-slug> (e.g. uniprot-org, espn-com) + 24 at /alexandria/cate… |
| Jina AI (Reader) | none found (0 URLs in the sitemap; no /vs/, /alternatives/ or /compare/ paths) | none found as a section. Reader-related use-case content exists only as /news/ posts… | none found as a section (0 URLs). Some /news/ posts cover third-party integrations (… | 31 English URLs at /models/ (30 model pages plus the index; 310 with locales). No per-site or… |
| Apify | 27 pages at /alternatives/<competitor>-alternative(s) plus the /alternatives root (28 URLs), e… | 32 pages at /use-cases/<slug> plus the root (33 URLs), e.g. /use-cases/data-for-ai-a… | 108 pages at /integrations (root, 13 platform pages like /integrations/n8n and /make… | 817,178 URLs in actors1..17.xml: 100,528 /<owner>/<actor> pages, 98,239 each of six /api* sub-… |
| ScrapingBee | 35 pages at /<competitor>-alternative/ (firecrawl-alternative, zenrows-alternative, apify-alte… | none found as a use-case folder. Closest: 15 pages at /features/ (ai-web-scraping-ap… | 1 hub page at /integrations/ (title 'Integrations: Connect ScrapingBee to Your Workf… | 431 pages at /scrapers/<slug> (airbnb-api, 99acres-scraper-api, amazon-asin-api, costco-scrape… |
| ZenRows | 32 pages: 21 at /alternatives (firecrawl, tavily, exa, apify, scrapingbee, serpapi, zyte and o… | 61 pages at /use-cases (lead-enrichment, hotel-data-scraping, ai-training-data and o… | 39 pages at /integrations (claude-code, cursor, windsurf, vscode, claude-desktop, n8… | 58 pages at /scrape (amazon, zillow, linkedin-profile, google-maps-reviews, reddit-posts and o… |
| Crawl4AI | none found | none found | none found (no /integrations path; framework integrations appear only inside docs/co… | none found |
| Spider | 1 page at /compare/ (cost comparison with calculator) plus 16 blog posts: 4 at /blog/best-*-al… | 12 pages at /use-cases/<slug>/ (rag, ai-agents, ai-training, coding-agents, price-mo… | 3 pages at /integrations/ (langchain, llamaindex, crewai) plus /mcp/, /mcp/connect/,… | 90 pages at /scrapers/<site>-scraper/ (amazon, zillow, linkedin, indeed, olx-ba, ...) and 70 c… |
| Tavily | 4 pages at tavily.com/competitors/<x> (serp, brave, firecrawl, perplexity-sonar), plus 11 blog… | 3 pages at tavily.com/solutions/<vertical> (financial-services, insurance, post-trai… | 41 pages at tavily.com/integrations/<tool> (langchain, zapier, n8n, crewai, claude,… | 19 author pages at tavily.com/author/<name> (e.g. rotem-weiss, 12 posts). No per-website or pe… |
| Context7 (Upstash) | 6 pages at /guides (mintlify-alternatives, docusaurus-alternatives, gitbook-alternatives, mint… | none found as a separate path; use-case style content sits in 34 /guides articles (e… | 14 pages at /docs/integrations (6) and /docs/clients (8) (examples /docs/integration… | 141,642 pages: 93,934 at /<owner>/<repo>, 45,090 at /websites/<slug>, 2,851 at /llmstxt/<slug>… |
| Octoparse | 7 pages at /alternatives (index + apify, phantombuster, listly, pigdata, brightdata, thunderbi… | 5 pages at /use-cases (index, e-commerce, lead-generation, social-media, news-media-… | 2 pages at /mcp (index, /mcp/google-maps-mcp-server); 11 docs at /docs/en/mcp; /cli,… | 681 pages at /template/<slug> (e.g. /template/agoda-hotel-scraper, /template/hwahae, /template… |
| Axiom.ai | No dedicated section. 3 stray URLs in the sitemap: /blog/alternatives-to-selenium/, /blog/pupp… | 28 pages at /automate/ (index + 27 children, e.g. /automate/doordash/, /automate/red… | 15 pages at /docs/no-code-tool/integrations/ (index + 14, e.g. /n8n/, /zapier/, /mak… | 11 pages at /scrape/ (index + 10, e.g. /scrape/telegram/, /scrape/patreon/, /scrape/roblox/).… |

Programmatic patterns (20 or more sibling URLs with parallel slugs) and what a sampled page contained:

| Site | Pattern | Count | Sample words | Page-specific content or boilerplate (agent judgement) |
|---|---|---|---|---|
| Firecrawl | /alexandria/<provider-slug> | 383 | 1577 | Page-specific: a long paragraph describing what this one data source exposes (UniProt REST fields, license CC BY 4.0, cross-references) plus example… |
| Firecrawl | /glossary/<category>/<question-slug> | 233 | 501 | Page-specific short answer (a definition and explanation of about 400 words) beside a sidebar of sibling questions and a generic 'Ready to build' CTA… |
| Firecrawl | /articles/{chatgpt,claude}/<task-slug> (same 28 tasks per assistant) | 56 | 1985 | Mixed: an 11-section template filled with task-specific details (Skyscanner, a starter prompt); the Claude twin of the same task shares only about 47… |
| Jina AI (Reader) | /news/<slug> (editorial posts, not parallel template pages) | 159 | 1086 | Page-specific: a long-form article with its own sections and Article JSON-LD. About 1,086 visible words including nav and footer. The count of 150 is… |
| Jina AI (Reader) | /models/<model-slug> (31 English URLs: the index plus 30 models; 310 with locales) | 30 | 664 | Mostly templated: a fixed spec card (license, release date, input and output, parameters, base model, languages) is filled with per-model values, so… |
| Jina AI (Reader) | /<locale>/<same path> where locale is one of de, fr, es, it, zh-CN, zh-TW, ja, ko, ru (full translated mirror) | 1,305 | 5137 | Translated copy of the English /reader/ page: same 9-section structure, with title, meta description and H2s in German. The self-referencing canonica… |
| Apify | /<owner>/<actor>/examples/<slug> | 117,445 | 393 | Mostly templated: the title, one-line description, input values and related-task links are specific, but the 'How it works' and 'Integrate into your… |
| Apify | /<owner>/<actor> | 100,528 | 4158 | Page-specific: a long README written by the actor's author plus live stats (172K total users, 4.6 rating) and per-actor pricing, wrapped in a thin sh… |
| Apify | /<owner>/<actor>/api/{,cli,javascript,mcp,openapi,python} (six parallel sub-pages per actor, 98,239 actors each) | 589,434 | 608 | Mostly templated: a code snippet with the actor ID substituted, the description sentence 'Learn how to interact with ... API in Python', and the shar… |
| ScrapingBee | /scrapers/<site-or-endpoint>-api | 431 | 2156 | Mostly templated: the 15 H2 headings repeat the same skeleton with the site name swapped, and 8-word-phrase overlap with the 99acres page is 72% (mea… |
| ScrapingBee | /blog/<slug> | 392 | 4396 | Page-specific editorial content: the 12 H2s are topic-specific and 8-word-phrase overlap with the other sampled blog post is 6 to 9% (measured), whic… |
| ScrapingBee | /webscraping-questions/<tool-or-topic>/<question-slug> | 163 | 643 | Page-specific answer to one question with its own code example, but short and wrapped in shared footer, related-questions and sign-up blocks; 8-word-… |
| ZenRows | /glossary/<hub>/<what-is-...> (5 hubs) | 98 | 1075 | Mostly page-specific: the term definition, TL;DR and FAQ are unique, and identical text blocks make up about 54% of words versus the other glossary s… |
| ZenRows | /use-cases/<slug> | 61 | 1944 | A fixed 8-section template with the keyword swapped into the H2s, but the body names concrete data sources (company sites, G2, Crunchbase) and has 7… |
| ZenRows | /scrape/<site-or-site-subpage> | 58 | 3434 | Long page with a fixed 11-section template. Input and Output hold site-specific fields, with 13 FAQ pairs and sibling links. Identical text blocks ar… |
| Crawl4AI | /blog/releases/<version>/ | 18 | 438 | Page-specific: the bug fixes and upgrade notes are written per release; only the section skeleton and site banner are shared. |
| Crawl4AI | /core/<topic>/ (and /advanced/<topic>/, /api/<name>/) | 48 | 1051 | Page-specific: each page documents a distinct feature with its own code; this is mkdocs-rendered hand-written docs, not a slug template (core 23 + ad… |
| Crawl4AI | /blog/articles/<slug>/ (and /apps/llmtxt/<slug>/) | 6 | 445 | Page-specific announcement article; below the 20-URL threshold so not a programmatic pattern. |
| Spider | /scrapers/<site>-scraper/ | 90 | 1176 | Mixed: the page embeds a real captured Spider response for that site (HTTP 200, 355 ms, 80.5 KB, $0.002719, captured Aug 7, 2026), plus a per-site us… |
| Spider | /proxy-locations/<country>/ | 70 | 769 | Mixed: country-specific intro paragraph, IP count in title, comparison and usage sections for a large market, then a shared cURL snippet and proxy-ty… |
| Spider | /blog/<slug>/ (editorial, not templated; third group with 20 or more siblings, 40 posts) | 40 | 5289 | Page-specific: a 23-minute hand-written comparison with pricing table, per-vendor sections, FAQ and a Sources list, dated September 2, 2026 (compare/… |
| Tavily | tavily.com/blog/<slug> | 80 | 2370 | Page-specific: a long hand-written editorial comparison (roughly 2,370 words with nav and footer) that names each rival and the use case it fits, so… |
| Tavily | docs.tavily.com/documentation/integrations/<tool> | 50 | 2086 | Page-specific: working install steps and code for each Tavily endpoint in that framework; only the docs chrome and the 'Documentation Index' block re… |
| Tavily | tavily.com/integrations/<tool> | 41 | 292 | Mostly templated: an identical H2 skeleton on both samples, with only a one-line description, three bullets, two links and three related-tool blurbs… |
| Context7 (Upstash) | /<owner>/<repo> | 93,934 | 5570 | Page-specific: server-rendered body is a list of that library's own documentation snippets (title, source URL, description, code) plus stats like tok… |
| Context7 (Upstash) | /websites/<slug> | 45,090 | 5214 | Page-specific: body is snippets crawled from react.dev with source URLs and an LLM-written meta description; the same template as the GitHub pages. |
| Context7 (Upstash) | /llmstxt/<slug> | 2,851 | 3669 | Page-specific: snippets derived from Amazon's llms.txt content with a unique description; same template, different body data. |
| Octoparse | /template/<site-or-task-slug> | 681 | 636 | Mostly templated: the same 10 sections, with the scraper name substituted into the sentences, but the one-line description, the field list and a real… |
| Octoparse | /blog/<slug> (semi-programmatic: 70 how-to-scrape-<site> posts, 34 scrape-<x>, 9 alternatives, 12 vs) | 478 | 1493 | Page-specific: the H2s cover Etsy API availability, a 15-listing test with stated cost and Etsy compliance, and only the closing call to action and r… |
| Octoparse | /docs/<lang>/... (en 199, jp 162, de/es/fr/it/ko 24 each; api-reference/<group>/<endpoint> and datahub/api/reference/<group>/<endpoint>) | 481 | 876 | Page-specific API reference: it has endpoint request and response details and the docs shell is shared, but the content comes from one endpoint each. |
| Axiom.ai | /guides/<workflow-or-app> | 90 | 1481 | Page-specific: the steps, screenshots and wording are written for Baserow, and only the skeleton (getting started, testing, wrapping up) repeats; I m… |
| Axiom.ai | /docs/no-code-tool/reference/steps/<step-name> | 90 | 655 | Same two-section skeleton for every step, but the content describes that step's behaviour; the word count includes the docs sidebar menu, so real bod… |
| Axiom.ai | /automate/<task-or-site> | 27 | 358 | Mostly templated: the old two-H2 layout swaps the site name into a fixed pitch and a short list of ideas; thin (9 of 27 children are this style at 28… |

Verifier corrections applied: Jina `/news` is 159 posts (not 150); Firecrawl `/alexandria/<slug>` is two path segments deep (383 pages); the Firecrawl `uniprot-org` sample H1 is "UniProt".

The reference plan cites axiom.ai's `/scraper/` and `/automate/` folders. Measured: `/scraper/` returns 404; the folder is `/scrape/` (10 child pages) and `/automate/` has 27, 37 of 693 sitemap URLs (5.3%). Docs are 351 URLs (50.6%). The reference's claim that these two folders carry most of the organic traffic cannot be checked from a sitemap and no traffic number for axiom.ai was retrievable.


## 5. Keyword and SERP reads (fetched 2026-10-27)

**Read this first.** The SERP source is the `WebSearch` tool for every row except two B rows marked (DDG) below (Bing via curl returned unrelated results; DuckDuckGo html returned a 202 challenge after the first two B keywords; Google was not requested because earlier work recorded a verification wall after about six SERPs). The "Exact phrase in autocomplete" column is true when either Google or Bing lists the exact phrase or an extension that starts with it. Google lists the typed phrase back as its first suggestion even when the other entries are unrelated, so a "yes" can rest on that echo alone (the verifier found this for `web scraper for llm`; the raw notes in `kw.json` flag it for other rows). The column is weak demand evidence, not a volume or interest signal. A result list is not a fixed-locale SERP, has 9 or 10 entries, and says nothing about volume. "Winnable" is the agent's judgement for a one-month-old domain, from what the list shows. `octocrawlInTop10` is unknown for most rows (9 results returned). The keyword verifier re-read 10 keywords: 14 claims confirmed, 7 mismatched (autocomplete counts, two page-type labels, one upvote count), and could not reproduce two rows that had come from DuckDuckGo. Treat every row as a lead.


### A. Category and product terms

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| web scraping api | yes | direct | product-page | hard | softwareadvice.com.au, cloud.browserless.io, browserless.io, joinmassive.com |
| web scraping api for ai agents | no | direct | product-page | plausible | scrapingant.com, scrapegraphai.com, scrapfly.io, scraperapi.com |
| web scraper for llm | yes | direct | product-page | plausible | arxiv.org, zenrows.com, zenrows.com, apify.com |
| scrape website to markdown | yes | direct | blog-tutorial | plausible | firecrawl.dev, geekflare.com, pypi.org, glama.ai |
| website to markdown api | yes | direct | product-page | plausible | zylalabs.com, creators.zylalabs.com, stork.ai, microlink.io |
| web crawler api | yes | direct | product-page | hard | apify.com, olostep.com, elastic.co, elastic.co |
| crawl website to markdown | yes | direct | blog-tutorial | plausible | apify.com, apify.com, yarnpkg.com, apify.com |
| web scraping mcp server | yes | direct | product-page | hard | webscraping.ai, mcpservers.org, mcpservers.org, mcpservers.org |
| mcp server web scraping | no | direct | product-page | hard | webscraping.ai, scrapling.readthedocs.io, glama.ai, mcpservers.org |
| best mcp server for web scraping | no | direct | listicle-target | hard | scrapfly.io, proxyway.com, proxyway.com, zenrows.com |
| open source web scraping api | yes | direct | home | plausible | ycombinator.com, getapp.com, npmjs.com, crnet.net |
| web data api for ai agents | no | adjacent | home | plausible | hunted.space, olostep.com, parallel.ai, webmail.hunted.space |

### B. Wedge: documentation for coding agents

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| context7 alternative (DDG, unreproduced) | yes | adjacent | compare-page | hard | neuledge.com, firecrawl.dev, github.com, mcp.directory |
| context7 rate limit (DDG, unreproduced) | yes | weak | blog-tutorial | plausible | context7.com, deepwiki.com, context7.com, blog.picassoia.com |
| llms.txt generator | yes | adjacent | free-tool | plausible | writesonic.com, writesonic.com, nanonets.com, app.getlaunchlist.com |
| convert documentation to markdown for llm | no | direct | blog-tutorial | plausible | apify.com, enterprisedna.co, github.com, microlink.io |
| scrape documentation website for llm | no | direct | blog-tutorial | plausible | glama.ai, glama.ai, images.glama.ai, pkg.go.dev |
| give claude code access to documentation | yes | direct | scenario-page | plausible | github.com, docs.ref.tools, claudeissues.com, mcpcat.io |
| mcp server for documentation | yes | adjacent | listicle-target | hard | glama.ai, mcpservers.org, glama.ai, glama.ai |
| claude code cannot read website | no | adjacent | blog-tutorial | plausible | growtika.com, claudeissues.com, ruben.substack.com, northlabapps.com |
| cursor docs alternative | no | weak | none | hard | gnuzilla.gnu.org, livedocs.com, shawnesquivel.notion.site, alternativeto.net |
| crawl docs site for rag | no | direct | blog-tutorial | plausible | apify.com, docs.fused.io, apify.com, firecrawl.dev |
| documentation scraper markdown | no | direct | scenario-page | plausible | apify.com, github.com, pkg.go.dev, pkg.go.dev |

### C. Free tool terms

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| url to markdown | yes | direct | free-tool | hard | g2.com, apify.com, apify.com, chrome.google.com |
| website to markdown | yes | direct | free-tool | hard | geekflare.com, glama.ai, olostep.com, apify.com |
| webpage to text | yes | direct | free-tool | hard | geekflare.com, firecrawl.dev, olostep.com, packagist.org |
| extract all links from a website | yes | direct | free-tool | plausible | ria-compute.csir.co.za, cloud.fieecs.uni.edu.pe, grabz.it, dev.to |
| url extractor | yes | adjacent | free-tool | plausible | olostep.com, chemicloud.com, apify.com, apify.com |
| can i scrape this website | no | adjacent | free-tool | plausible | cloud.browserless.io, publish.obsidian.md, medium.com, browserless.io |
| is web scraping allowed on this website | no | adjacent | blog-tutorial | plausible | dev.to, clay.com, dev.to, scrape.do |
| robots.txt checker | yes | weak | free-tool | plausible | 365i.co.uk, resolve247.ai, 365i.co.uk, growtika.com |
| webpage token counter | no | adjacent | free-tool | plausible | chromewebstore.google.com, extensionauditor.com, chromewebstore.google.com, huggingface.co |
| count tokens in a url | no | adjacent | free-tool | plausible | huggingface.co, hapifhir.io, glama.ai, codeql.github.com |
| html to markdown | yes | weak | none | hard | docsearch.algolia.com, textwizard.readthedocs.io, github.com, github.com |
| sitemap url extractor | yes | adjacent | free-tool | hard | apify.com, apify.com, wotnot.io, peerlist.io |

### D. How-to and tutorial terms

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| claude code web scraping | yes | direct | blog-tutorial | plausible | scrapfly.io, dev.to, docs.anycrawl.dev, groupbwt.com |
| web scraping for rag | yes | direct | blog-tutorial | hard | olostep.com, zenrows.com, zenrows.com, browserless.io |
| scrape website for rag | yes | direct | blog-tutorial | plausible | firecrawl.dev, scrapegraphai.com, olostep.com, myscale.com |
| scrape website with login | no | adjacent | blog-tutorial | hard | hasdata.com, zenrows.com, webscraper.helpscoutdocs.com, zenrows.com |
| scrape list of urls | yes | direct | blog-tutorial | plausible | octoparse.com, octoparse.com, parsehub.com, forum.webscraper.io |
| extract structured data from web page | yes | direct | blog-tutorial | plausible | etalpykla.vilniustech.lt, etalpykla.vilniustech.lt, researchportal.ip-paris.fr, scitepress.org |
| web scraping with claude code mcp | no | direct | scenario-page | plausible | glama.ai, glama.ai, docs.zenrows.com, composio.dev |
| scrape website with cursor | no | adjacent | scenario-page | hard | zenrows.com, zenrows.com, firecrawl.dev, docs.zenrows.com |
| ai agent web scraping | yes | adjacent | listicle-target | hard | scrapfly.io, scrapegraphai.com, eastgate-software.com, eastgate-software.com |
| crawl a website to markdown python | no | adjacent | blog-tutorial | plausible | pypi.org, github.com, pypi.org, pypi.org |
| scrape javascript rendered website | no | direct | blog-tutorial | hard | octoparse.com, medium.com, scrapegraphai.com, scrapingbee.com |
| give ai agent access to the web | no | adjacent | blog-tutorial | plausible | joinmassive.com, devopscareers.substack.com, gaas.it.com, docs.lime-connect.com |

### E. Comparison and alternative terms

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| firecrawl alternative | yes | direct | compare-page | hard | eesel.ai, brand.dev, webscraping.ai, octoparse.com |
| firecrawl alternatives open source | yes | direct | listicle-target | hard | openalternative.co, webcrawlerapi.com, openalternative.co, apify.com |
| firecrawl vs crawl4ai | yes | weak | none | hard | blog.apify.com, openalternative.co, keywordsai.co, brightdata.com |
| firecrawl vs jina reader | yes | adjacent | compare-page | plausible | firecrawl.dev, blog.apify.com, learn.engineering.vips.edu, keywordsai.co |
| jina reader alternative | no | direct | compare-page | plausible | aipicks.jp, en.wikipedia.org, jump.wordstream.com, evri-delivery.blogto.com |
| crawl4ai alternative | yes | direct | compare-page | hard | apify.com, capterra.co.za, capterra.co.uk, alternativeto.net |
| firecrawl pricing | yes | weak | none | hard | scrapegraphai.com, tinyfish.ai, eesel.ai, webscraping.ai |
| best web scraping api for llm | no | direct | listicle-target | hard | zenrows.com, scrappey.com, zenrows.com, zenrows.com |
| best web scraping api 2026 | yes | adjacent | listicle-target | hard | sequenzy.com, scrape.do, thunderbit.com, dev.to |
| scrapingbee alternative | yes | weak | none | plausible | scrapegraphai.com, blog.apify.com, siteintel.duckdns.org, listly.io |
| apify alternative | yes | weak | none | hard | alternativeto.net, alternativeto.net, getmagical.com, firecrawl.dev |
| octoparse alternative | yes | weak | none | hard | help.listly.io, help.listly.io, alternativeto.net, alternativeto.net |

### F. Scenario and per-site terms

| Keyword | Exact phrase in autocomplete | Octocrawl fit | Owner page type | Winnable (judgement) | First 4 domains in the list |
|---|---|---|---|---|---|
| scrape amazon product data | yes | weak | none | hard | crawlbase.com, octoparse.com, blog.aimultiple.com, scrapfly.io |
| scrape reddit | yes | none | none | hard | scrapfly.io, speakai.co, scrapfly.io, octoparse.com |
| scrape hacker news | yes | direct | scenario-page | plausible | apify.com, apify.com, dev.to, docs.gumloop.com |
| scrape wikipedia | yes | direct | scenario-page | hard | crawlbase.com, oxylabs.io, scrapingbee.com, blog.apify.com |
| scrape github repository | no | adjacent | blog-tutorial | plausible | crawlbase.com, scrapecreators.com, scrapecreators.com, dev.to |
| scrape youtube transcript | yes | weak | none | hard | apify.com, apify.com, serpapi.com, scrapingdog.com |
| scrape google search results | yes | none | none | hard | scrapfly.io, octoparse.com, techjury.net, crawlee.dev |
| scrape news articles | yes | direct | blog-tutorial | hard | grepsr.com, bardeen.ai, olostep.com, scrapfly.io |
| scrape linkedin | yes | none | none | hard | scrapfly.io, scrapfly.io, octoparse.com, speakai.co |
| scrape twitter | yes | none | none | hard | speakai.co, speakai.co, scrapingant.com, webharvy.com |
| scrape shopify store | yes | adjacent | scenario-page | plausible | apify.com, apify.com, octoparse.com, dev.to |
| scrape ecommerce product pages to json | no | direct | scenario-page | plausible | zenrows.com, olostep.com, zenrows.com, github.com |

Robots facts read by the scenario agent (fetched 2026-10-27): reddit.com, linkedin.com and x.com robots.txt end in `User-agent: * / Disallow: /`; hosted Octocrawl obeys robots.txt, so a hosted page for those sites would be refused. news.ycombinator.com allows front page and item pages with a crawl delay of 30; en.wikipedia.org disallows only `/w/` and special pages.


## 6. Community signals

### 6.1 Hacker News (Algolia API, items from 2025-01-01, 37 queries, 94 curated items)

| Theme | Items | Maps to |
|---|---|---|
| pricing-and-limits | 13 | compare-page (Firecrawl, Context.dev, Jina price and credit model); home (clear local-free vs hosted pricing) |
| llms-txt-and-accept-markdown | 12 | blog-tutorial; free-tool (check a site for llms.txt and Markdown support) |
| market-and-alternatives | 11 | compare-page |
| blocked-pages | 10 | docs (what Octocrawl will not read, blockReason); blog-tutorial (when to fall back); compare-page |
| setup-friction-and-reliability | 10 | blog-tutorial (WebFetch replacement for Claude Code, Codex, Cursor); docs (npx and MCP setup); home |
| trust-robots-and-source-tracking | 10 | docs (Evidence Record, robots decision, research identity); compare-page; blog-tutorial |
| docs-for-coding-agents | 10 | blog-tutorial (docs site to Markdown for Claude Code); compare-page (vs Context7 approach) |
| token-cost | 9 | free-tool (HTML vs Markdown token counter); blog-tutorial |
| self-host-preference | 5 | docs; home (local-first, npx octocrawl); blog-tutorial |
| js-rendering | 4 | docs (browser lane, fastMode, waitFor); compare-page |

Verifier: 12 of 15 sampled HN items matched; three paraphrases were wrong (a "halved bill" claim that the comment does not make; a misattributed WebFetch limit; a wrong "tried both"). Theme counts for token-cost (9), js-rendering (4) and self-host-preference (5) were recounted and match. Comment points are not exposed by the API, so engagement for comments is the parent thread's.

### 6.2 GitHub issues (`gh`, read-only; Firecrawl, Crawl4AI, Jina Reader, Context7 and three more MCP repos; 469 issues examined)

| Theme | Issues | Maps to |
|---|---|---|
| mcp-install-connect-auth | 61 | Per-client MCP setup and troubleshooting docs (Claude Code, Codex, Cursor), keyless vs key vs OAuth FAQ |
| spam-promo-listings | 60 | none |
| docs-index-coverage-requests | 51 | Docs-to-Markdown use-case page (map plus crawl or scrape a docs site on demand with fetch time per page) |
| feature-request-or-other | 46 | Integrations page; SDK reference |
| self-host-docker-ops | 45 | Local-first quickstart (npx octocrawl, no Docker) and a self-host comparison page |
| markdown-and-js-render-quality | 43 | Markdown quality examples page with fixtures; JavaScript-rendered pages guide; token comparison |
| timeout-hang-reliability | 40 | Reliability guide: documented timeouts, status semantics (failed vs empty), retry and idempotencyKey |
| mcp-tool-schema-and-token-cost | 30 | Blog and benchmark on MCP token cost per session, plus token counter tool |
| rate-limit-credits-pricing-billing | 23 | Pricing and credits explainer with per-page cost (1 HTTP page, 5 browser page, 1 map) |
| security-ssrf-cve-privacy | 20 | Security and data-handling page (private-address guard, robots decision, fetched content is untrusted) |
| maintenance-or-internal | 19 | none |
| own-docs-wrong-or-missing | 18 | Keep Octocrawl quickstarts tested; client list in docs |
| antibot-blocked-cloudflare | 13 | Honest-limits page: what Octocrawl can and cannot read, how blocked pages are reported (status plus blockReason) |

About 11 to 13 percent of the 469 issues are automated badge, scan or payment solicitations. Engagement is low everywhere (at most 11 reactions and 27 comments in 12 months), so GitHub issues are a weak demand signal on their own. The agent's theme assignment used rules; counts carry some error.

### 6.3 Reddit: not researched

Blocked on every route on 2026-10-27: `curl` to `reddit.com/.../search.json` returned HTTP 403 (network-security block page) through the proxy and no connection at all with the proxy unset (re-tested by hand); the `agent-reach` Reddit backend returned "forbidden"; the OpenCLI backend had no browser extension connected; `WebFetch` and `WebSearch` refuse reddit.com; the built-in browser pane refuses reddit.com. One r/rag thread was read through a third-party mirror. **This record supports no claim about what Reddit says.** The reference plan lists Reddit complaints as a research input; that input is still missing.


## 7. Market size proxies and third-party estimates (fetched 2026-10-27)

### 7.1 Registry and API numbers (not estimates)

The npm `/last-month` endpoint returned a stale window (2026-06-02 to 2026-07-01) for every package, so all npm figures use an explicit range 2026-09-27 to 2026-10-26. npm and PyPI counts include CI runs, mirrors and bots; Octocrawl's own installs are included and not separable.

| Subject | Metric | Value | Note |
|---|---|---|---|
| @mendable/firecrawl-js | npm downloads, 30 days | 4,154,811 | The /last-month endpoint returned a stale window (2026-06-02..2026-07-01: 3,844,996), so every npm number her… |
| firecrawl-mcp | npm downloads, 30 days | 528,008 |  |
| firecrawl-cli | npm downloads, 30 days | 84,236 |  |
| @upstash/context7-mcp | npm downloads, 30 days | 2,423,982 | Stale-window figure was 4,159,165 (2026-06-02..2026-07-01); not comparable. |
| @tavily/core | npm downloads, 30 days | 1,313,340 |  |
| tavily-mcp | npm downloads, 30 days | 74,261 |  |
| @playwright/mcp | npm downloads, 30 days | 23,330,401 | A browser-automation MCP, not a Markdown scraper; shown as the upper bound for agent browser tooling. |
| octocrawl | npm downloads, 30 days | 944 | Raw registry count. It includes installs by the maintainers' own CI, release checks and registry mirrors; how… |
| @octocrawl/mcp | npm downloads, 30 days | 1,676 | Same caveat: includes own CI and mirrors, share unknown. |
| @octocrawl/sdk | npm downloads, 30 days | 1,332 |  |
| @octocrawl/cli | npm downloads, 30 days | 1,431 |  |
| @brightdata/mcp | npm downloads, 30 days | 46,339 | Extra MCP server 1; npm search rank 7 for 'mcp web scraping'. |
| @just-every/mcp-read-website-fast | npm downloads, 30 days | 2,512 | Extra MCP server 2 (page to Markdown); npm search rank 11 for 'mcp crawl'. The closest functional peer to Oct… |
| @icjia/forgecrawl | npm downloads, 30 days | 127 | Extra MCP server 3; npm search rank 1 for 'mcp web scraping'. |
| firecrawl-py | PyPI downloads, last_month | 5,339,910 | last_week 1,418,047. pypistats counts include mirrors and CI. |
| crawl4ai | PyPI downloads, last_month | 1,275,996 | last_week 363,305. |
| tavily-python | PyPI downloads, last_month | 9,588,826 | last_week 1,715,376 while last_month is 9.6M, so the month figure looks inflated by a spike; the cause is unk… |
| mcp-server-fetch | PyPI downloads, last_month | 506,506 | Official MCP fetch reference server (run via uvx); last_week 247,436. |
| octocrawl-client | PyPI downloads, last_month | 124 | last_week 67, last_day 4. Version 0.7.0, first upload 2026-10-05 (pypi.org JSON). Includes mirrors and own in… |
| firecrawl/firecrawl | GitHub stars | 195,932 | forks 10,342; open issues 686; created 2024-04-15; pushed 2026-10-27; latest release v2.11.0 on 2026-06-19; A… |
| unclecode/crawl4ai | GitHub stars | 86,387 | forks 8,985; open issues 277; created 2024-05-09; pushed 2026-10-26; latest release v0.9.5 on 2026-10-14; Apa… |
| jina-ai/reader | GitHub stars | 12,197 | forks 895; open issues 37; created 2024-04-10; last push 2026-05-22; no GitHub releases (404); Apache-2.0. |
| upstash/context7 | GitHub stars | 63,761 | forks 3,149; open issues 48; created 2025-03-26; pushed 2026-10-27; latest release tag @upstash/context7-sdk@… |
| 77777R7/Octocrawl | GitHub stars | 2 | forks 0; open issues 1; created 2026-08-19; pushed 2026-10-27; latest GitHub release v0.4.1 on 2026-10-10 (np… |
| brightdata/brightdata-mcp | GitHub stars | 2,689 | forks 336; open issues 40; created 2025-04-15; pushed 2026-10-26; latest release v4.1.0 on 2026-10-20; MIT. |
| just-every/mcp-read-website-fast | GitHub stars | 163 | forks 27; open issues 1; created 2025-06-11; pushed 2026-09-29; no GitHub releases; MIT. |
| ICJIA/forgecrawl-mcp | GitHub stars | 0 | Real value 0 as returned by the API, not a missing value. Forks 0; created 2026-05-01; pushed 2026-08-04; no… |
| firecrawl/firecrawl-mcp-server | GitHub stars | 7,698 | forks 919; open issues 187; created 2024-12-06; pushed 2026-10-27; last GitHub release v3.2.1 on 2025-09-26 (… |

Verifier: 21 sampled metrics all reproduced (npm and PyPI exact; GitHub stars drifted by 1 to 3).

### 7.2 Semrush free overview pages (third-party estimates, data month Sep 2026)

| Domain | Metric | Value | Source | Note |
|---|---|---|---|---|
| firecrawl.dev | monthly visits (Semrush traffic estimate, all devices) | 2,160,000 | Semrush free overview (all devices, Semr | Printed as 2.16M. The same page prints Aug 1.85M and Jul 1.36M, and +16.55% vs Aug in the text (+17… |
| firecrawl.dev | monthly visits, previous month | 1,850,000 | Semrush free overview | Printed as 1.85M. Jul 2026 is printed as 1.36M. |
| firecrawl.dev | organic search traffic (monthly, Semrush estimate) | 152,870 | Semrush free overview | Printed as 152.87K, +15% month on month. Paid search traffic is printed as 530 (-21%). This is abou… |
| firecrawl.dev | authority score (Semrush, 0-100) | 44 | Semrush free overview |  |
| firecrawl.dev | referring domains (Semrush backlink index) | 10,160 | Semrush free overview | Printed as 10.16K, +16% month on month. |
| firecrawl.dev | backlinks (Semrush backlink index) | 453,840 | Semrush free overview | Printed as 453.84K, +72% month on month. |
| firecrawl.dev | Semrush global rank (worldwide, by estimated traffic) | 26,589 | Semrush free overview | The page also prints 'Country Rank: Bangladesh 10,130'. Bangladesh is also the top audience country… |
| firecrawl.dev | AI-platform referral visits, 6 months (Semrush 'AI Traffic' block) | 136,000 | Semrush free overview | Sum of the printed ChatGPT 78K and Claude 58K. Gemini is about 1K, openrouter.ai 1K and Perplexity… |
| context7.com | monthly visits (Semrush traffic estimate, all devices) | 680,580 | Semrush free overview (page 'Last update | Printed as 680.58K. Aug is printed as 629.35K and Jul as 563.65K. Pages per visit 4.13, bounce rate… |
| context7.com | organic search traffic (monthly, Semrush estimate) | 69,660 | Semrush free overview | Printed as 69.66K, about +0% month on month. Paid search traffic is printed as 0. Traffic Journey (… |
| context7.com | authority score (Semrush, 0-100) | 45 | Semrush free overview |  |
| context7.com | referring domains (Semrush backlink index) | 3,460 | Semrush free overview | Printed as 3.46K, +21%. Backlinks are printed as 49.47K (+5%). |
| context7.com | backlinks (Semrush backlink index) | 49,470 | Semrush free overview |  |
| context7.com | Semrush global rank (worldwide) | 71,526 | Semrush free overview |  |
| context7.com | AI-platform referral visits, 6 months | 42,000 | Semrush free overview, 'AI Traffic' bloc | Sum of the printed Claude 31K and ChatGPT 11K. Gemini is about 2K and Perplexity 229. Last-month sh… |
| tavily.com | monthly visits (Semrush traffic estimate, all devices) | 1,260,000 | Semrush free overview (page 'Last update | Printed as 1.26M. Aug is printed as 1.04M and Jul as 969.99K. Pages per visit 5.56, bounce rate 29.… |
| tavily.com | organic search traffic (monthly, Semrush estimate) | 41,260 | Semrush free overview | Printed as 41.26K, -3%. Paid search traffic is printed as 6.25K (-36%). Traffic Journey (desktop) s… |
| tavily.com | authority score (Semrush, 0-100) | 45 | Semrush free overview | Referring domains 5.93K (+15%), backlinks 67.64K (+26%), worldwide rank 42,417, all as printed. |
| tavily.com | referring domains (Semrush backlink index) | 5,930 | Semrush free overview |  |
| tavily.com | AI-platform referral visits, 6 months | 33,000 | Semrush free overview, 'AI Traffic' bloc | Sum of the printed ChatGPT 22K and Claude 11K. Gemini is about 5K. The sum is mine, from rounded nu… |
| octoparse.com | monthly visits (Semrush traffic estimate, all devices) | 244,800 | Semrush free overview (page 'Last update | Printed as 244.8K. Aug is printed as 232.45K and Jul as 226.15K. Pages per visit 2.59, bounce rate… |
| octoparse.com | organic search traffic (monthly, Semrush estimate) | 43,460 | Semrush free overview | Printed as 43.46K, +35%. Paid search traffic is printed as 994 (-26%). Traffic Journey (desktop) sa… |
| octoparse.com | authority score (Semrush, 0-100) | 39 | Semrush free overview | Referring domains 5.48K (+6%), backlinks 78.75K (+5%), worldwide rank 164,559, all as printed. |
| octoparse.com | referring domains (Semrush backlink index) | 5,480 | Semrush free overview |  |

Not obtained: jina.ai, scrapingbee.com, zenrows.com, apify.com, spider.cloud and crawl4ai.com return 404 on Semrush's free overview; Similarweb returned 403; Ahrefs renders no numbers without JavaScript; Statvoo and HypeStat sit behind Cloudflare challenges (not bypassed). The free Semrush keyword tables show 3 to 5 rows from one regional database (labelled Bangladesh) and many rows look unrelated to the product, so they are not a keyword picture. Verifier re-opened three Semrush pages and the printed figures matched.


## 8. External-link candidates

Nothing was submitted, posted or contacted. "Link attribute" is the `rel` value read from the fetched page where the page could be read.

### 8.1 Third-party lists and comparisons

| Page | Type | Cost | Link attribute | How a tool is included (as the page shows) |
|---|---|---|---|---|
| Proxyway - Best MCP Servers for Web Scraping (2026) | independent-looking affiliate review site | unknown | Firecrawl is #4 (modified 2026-10-21). Its 'Visit Firecrawl' links are internal /get/fire… | No submission form, contact address or paid-placement wording on the page. Page states 'We use affiliate links' and shows promo c… |
| Geekflare - 12 Web Scraping MCP Servers (2026) | media site owned by a scraping-API vendor | unknown | Firecrawl MCP is entry 02 but the static HTML has no outbound link to Firecrawl, only an… | No submission route on the page. Footer has an Advertise page with an enquiry form (price sent by email) saying paid placement is… |
| AlternativeTo - Firecrawl alternatives | software-alternatives directory | unknown | unknown | unknown: page blocked |
| Techjockey - 15 Best Firecrawl Alternatives (2026) | software marketplace / lead-gen site | unknown | No outbound link to Firecrawl or the other tools: tool names link to internal /detail/ an… | No submission form on the page. Footer links 'Advertise With Us', 'Write with us', 'Sell With Us'. I did not follow them; a guess… |
| KDnuggets - Top 7 AI Web Scraping Tools | independent data-science media | unknown | unknown | unknown: page blocked |
| HackerNoon - The Best AI Web Scraper Tools in 2025 | publishing platform article | unknown | All 5 external links are rel 'noopener noreferrer sponsored': 4 Oxylabs go2cloud.org affi… | No route visible on the page. |
| mcpservers.org - Web Scraping MCP Servers | MCP directory | free | Topic page links only to internal /servers/ pages (blog and codex-resets.com rel 'noopene… | Submit form at /submit with a 'Web Scraping' category. Free listing: review within 2 weeks. Premium: $39 one-time, review within… |
| Claude Market - The Best MCP Servers for Web Scraping in 2026 | independent directory and blog | paid options only in the form ($10 / $79 per month); the intro says Basic listing is free but no free plan is selectable | Sponsor cards and Hostinger links carry rel 'sponsored nofollow noopener noreferrer'. Edi… | /submit form (MCP server, plugin, skill, connector; category 'Browser & Scraping'). Standard listing $10 one-time, 48 h review, r… |
| Upwork - The Best Web Scraping Tools in 2026 | marketplace resource article | unknown | unknown | unknown: page blocked |
| DesignRush - 10 Web Scraping Tools (2026) | agency directory article | unknown | unknown | unknown: page blocked |
| eesel AI - 7 Firecrawl alternatives (2026) | vendor blog (eesel AI, a support-automation product) | unknown | Links to Firecrawl (firecrawl.com x2) are rel nofollow. All competitor links are nofollow… | No visible route. Footer has Calendly links for eesel's own demos only. |
| Gumloop - 8 Firecrawl alternatives I've tested | vendor blog | unknown | 40 external links, all rel none (followable): g2.com x7, capterra.com x4, apify.com x2, b… | No visible route. |
| ZenRows - Best AI Web Scraping Tools for LLM & RAG Pipelines (2026) | vendor blog (ZenRows) | unknown | Firecrawl link is https://github.com/firecrawl/firecrawl with rel 'nofollow noopener nore… | No visible route. The page advertises ZenRows's own affiliate and partner program, which is not an inclusion route. |
| ZenRows - 7 Best MCP Servers for Web Scraping (2026) | vendor blog (ZenRows) | unknown | Firecrawl MCP link is https://github.com/firecrawl/firecrawl-mcp-server with rel 'nofollo… | No visible route. |
| Scrapfly - 5 MCP Servers for Web Scraping in 2026 | vendor blog (Scrapfly) | unknown | Does not mention Firecrawl. GitHub links are mostly rel 'noopener' (followable, 5) or non… | No visible route. Page states its criteria: a screened shortlist of independent or reference open-source servers plus Scrapfly MC… |
| Olostep - Best Web Scraping MCP Servers in 2026: Top 10 | vendor blog (Olostep) | unknown | Mentions Firecrawl 13 times in text but no external link to Firecrawl in the static HTML.… | No visible route. Footer shows info@olostep.com (company contact, not an inclusion route). |
| Skyvern - 6 Top MCP Servers for Web Scraping (May 2026) | vendor blog (Skyvern) | unknown | Firecrawl MCP link is internal (skyvern.com/blog/firecrawl-reviews-pricing-alternatives/,… | No visible route. Page has a HubSpot meeting link and an HS form for Skyvern's own sales. |
| TinyFish - 8 Best Firecrawl Alternatives in 2026 | vendor blog (TinyFish) | unknown | 144 Firecrawl mentions but no external link to Firecrawl (only tinyfish.ai/compare/tinyfi… | No visible route. Footer has Contact Us for TinyFish itself. |
| WebCrawlerAPI - Top 5 Best Firecrawl Alternatives | vendor blog (small vendor) | unknown | All external links rel none (followable): firecrawl.dev, crawlee.dev, spider.cloud, apify… | No visible route. Author states 'Full disclosure: I'm the founder of WebCrawlerAPI, so I'm biased'. |
| ScrapingBee - 17 Best Web Scraping Tools Tested & Ranked For 2026 | vendor blog (ScrapingBee) | unknown | No external links to rival tools in the static HTML; all 12 external links are ScrapingBe… | No visible route. |
| punkpeye/awesome-mcp-servers (GitHub) | GitHub awesome list | free | Not verified on this page: the README is not in the fetched HTML. On the firecrawl-mcp-se… | Pull request flow documented in CONTRIBUTING.md: fork, edit README.md, open a PR, keep alphabetical order, one server per line. S… |
| Enterprise DNA Directories - MCP server entry (scrapeless-ai/scrapeless-mcp-server) | MCP and agent directory run by an AI training firm | unknown (no price shown) | External links on the entry page are rel 'noopener noreferrer' with no nofollow (github.c… | /directories/submit form that opens a pre-filled email draft to sam@enterprisedna.co. Needs a public repo, install command, list… |
| Clay - Top 8 AI Web Scraping Tools | vendor blog (Clay) | unknown | unknown | unknown: page not found |
| WebScraping.AI - Firecrawl Guide (and Firecrawl alternatives FAQ) | vendor blog (WebScraping.AI) | unknown | Firecrawl links rel none (followable): firecrawl.dev x3 and github.com/firecrawl/firecraw… | No visible route. Page states 'Full disclosure: WebScraping.AI (this site) is a scraping API and competes'. |
| Octoparse - Firecrawl Alternatives: 7 Tools Compared by Use Case | vendor blog (Octoparse) | unknown | Firecrawl links (firecrawl.dev pricing, docs, playground; 3 domains matched) are rel 'noo… | No visible route. Page says customer stories are attributed to their publishers and 'are not independent benchmarks'. Footer has… |

Verifier corrections: HackerNoon has 6 sponsored anchors (4 oxylabs, 1 import.io, 1 self-link), not 5; Claude Market and Enterprise DNA cost fields are as above. Reported by the agent: Octocrawl appears on punkpeye/awesome-mcp-servers (README line 529); checked by hand at the end of the run: PR #16029 is merged (2026-10-23T06:08:02Z) and the README line exists. The older note that it was waiting on a Glama badge is out of date.

### 8.2 Ecosystems and directories

| Ecosystem | Cost | Link attribute | Route (official instructions) | Constraints |
|---|---|---|---|---|
| Vercel AI SDK tools registry | unknown | rel="noopener noreferrer" target="_blank" (no nofollow) on the tool p… | Pull request to vercel/ai adding one object to content/tools-registry/registry.ts, PR title 'feat(tools-registry): add <tool>'. Prerequisites in the guide: package publi… | Guide states no fees, review time, quality bar or AI-submission policy; none stated is not none exists. I did not read vercel/ai CONTRIBUTING.md. Check before a PR that… |
| LangChain integrations (external listing) | unknown | rel="noreferrer" target="_blank" (no nofollow) on the external docs l… | Publish an independent package (langchain-<name> on PyPI); new integrations are not accepted as PRs to langchain-ai repos. Then file an 'Integration listing' issue on la… | Rejection reasons listed: failing CI, typos, code examples that do not run, quality standards. 'Do not repeatedly tag maintainers.' AI-assisted content allowed only if e… |
| LlamaIndex integrations / LlamaHub | unknown | unknown (listing route not found, so no listing page to read) | No third-party listing route found. CONTRIBUTING.md says the repo is 'no longer accepting new integration packages' and new ones should live in their own repos on PyPI;… | Route unknown; one WebSearch for a submission guide found nothing. Do not plan on LlamaIndex until a maintainer-stated route is found; a PyPI package named llama-index-r… |
| Dify Marketplace plugins | unknown | Marketplace page for Firecrawl (https://marketplace.dify.ai/plugins/l… | Build a tool plugin, package as .difypkg, fork langgenius/dify-plugins, add <org>/<plugin>/ with source and the .difypkg, open a PR using the PR template. After approval… | Risk classification: a plugin that can 'proxy or crawl arbitrary URLs' is High risk, which gets extra review and requires disclosure of the security boundary, request ti… |
| n8n community nodes (verified) | unknown | rel="noopener noreferrer" (no nofollow) on the outbound links of http… | Publish an npm package named n8n-nodes-* or @scope/n8n-nodes-*, keyword n8n-community-node-package, nodes and credentials declared in the 'n8n' package.json attribute, s… | Docs say n8n may reject nodes that compete with its paid features. Fees, review time and detailed review criteria are not in the page; linked technical and UX guidelines… |
| Flowise document loaders / nodes | free | unknown (no public listing page for a third-party node was found; doc… | Fork FlowiseAI/Flowise, add a node under packages/components/nodes/ (for example documentloaders/<Name>), submit a PR to main; a team member is auto-notified. The CONTRI… | Code goes into someone else's repo and needs maintenance and review by the Flowise team; no quality bar or AI policy in CONTRIBUTING. Whether a merged node earns any lin… |
| CrewAI tools (crewai-tools) and awesome-crewai | unknown | unknown (no listing page read) | Option A: PR to crewAIInc/crewAI under lib/crewai-tools/. First-time contributors must link an existing open issue in the PR or it is closed and labelled needs-issue. Op… | CONTRIBUTING requires the 'llm-generated' label on any PR or issue authored by an AI assistant (it names Claude Code, Cursor, Copilot); unlabeled ones may be closed unse… |
| Haystack integrations page | unknown | rel="noopener" target="_blank" (no nofollow) on external links of htt… | Pull request to deepset-ai/haystack-integrations adding integrations/<name>.md with front matter: layout, name, description, authors, type (including 'Tool Integration',… | No stated review time, quality bar or AI policy in the README. Page body is yours to write, so a few honest sentences with install and one example are enough. The Firecr… |
| Hugging Face (organization page, Spaces, Hub MCP) | unknown | rel="nofollow" target="_blank" on the website, GitHub, X and LinkedIn… | Create an organization or user profile with a website link; optionally a Space or a dataset. Gradio Spaces with mcp_server=True get an MCP badge and can be added as tool… | Nofollow on user-supplied links. A Docker or Gradio Space for a live demo needs a paid plan. I did not read the Hub content policy. Low priority for ranking; consider on… |
| awesome-web-scraping (lorien) | free | unknown (the list is Markdown on GitHub; GitHub renders repo README l… | PR appending one line '* [name]\(url) - one-line description' to the language file (javascript.md, python.md, cli.md, ...), run npm run check locally, describe the chang… | Octocrawl is aimed at AI agents and MCP, which the list restricts, and it also sells a hosted API; a submission that hides that would be dishonest. The local CLI as a pl… |
| awesome-ai-web-scraping (h4ckf0r0day) | free | unknown (Markdown on GitHub, not measured) | README says 'Open a pull request to add a new tool or resource.' No further rules seen. | Small and not recently maintained, so a PR may not be merged; low link value. Found via one GitHub repository search; the search for 'awesome rag tools' hit a 403 rate l… |
| awesome-llm-apps (Shubhamsaboo) | free | unknown (links inside the repo; not measured) | No CONTRIBUTING.md (404) and no contribution section in the README. The list links to app folders in the same repo, so inclusion means a PR adding a runnable example app… | Would only fit if a genuinely useful agent example is built on Octocrawl; submitting a thin 'hello world' to gain a link is the thing to avoid. Maintainer acceptance cri… |
| PyPI and npm package metadata | free | unknown: pypi.org HTML returned a 'Client Challenge' page to curl and… | Set the fields in the package files. PyPI: [project.urls] labels. The Python packaging spec recognises Homepage, Source/Repository, Documentation, Changelog, Release Not… | PyPI and npm are crawled pages with some authority, but whether outbound project links are followed is unconfirmed here. The default 'last-month' npm downloads API call… |
| Claude Code plugins: own marketplace, Anthropic directory, claude-plugins-official | paid | rel="noopener noreferrer" target="_blank" (no nofollow) on the websit… | Three routes. (1) Own marketplace: already in the repo (plugins/octocrawl README: '/plugin install octocrawl --marketplace 77777R7/Octocrawl'); needs no approval. (2) An… | Submission needs a paid claude.ai plan (Pro, Max, Team or Enterprise); free accounts cannot submit. A person reviews a new plugin listing; MCP connectors are scanned and… |
| Cursor Marketplace (and cursor.directory) | free | rel="noopener noreferrer" target="_blank" (no nofollow) on the firecr… | Plugin is a Git repo with .cursor-plugin/plugin.json (only 'name' required); test it from ~/.cursor/plugins/local; submit at cursor.com/marketplace/publish. Docs: all pl… | Publisher Terms (last updated 2026-05-06): free to publish; Anysphere reviews identity and business legitimacy and the code and may reject for any reason without giving… |

Checked by hand: Cursor Marketplace Publisher Terms (last updated 2026-05-06) say a plugin may only use permissive open-source licences and that copyleft licences "(e.g., GPL, AGPL, and LGPL)" may not be included in any plugin; Octocrawl's server, CLI and MCP packages are AGPL-3.0, its client libraries MIT (README.md:60). Whether a plugin that only points at the hosted MCP URL counts as "including" them is not stated.


## 9. Search-engine policy rules and the gates derived from them

Official pages only, fetched 2026-10-27. The verifier re-opened 8 of them and confirmed 13 of 14 claims; the one mismatch is an anchor: the FAQ rich-result end date (2026-05-07) is in the "May 8 Deprecating the FAQ rich result feature" entry, and the "Removed documentation for the FAQ rich result feature" entry is the June one. The gates below are internal proposals derived from the rules, not source claims, and were not tested.

| Topic | Rule (agent's words) | Source |
|---|---|---|
| Scaled content abuse (programmatic/scenario pages) | Generating many pages mainly to rank, by AI or by templates, is spam when each page adds little for users, no matter how the pages are made; the policy page gives no page-count threshold. | https://developers.google.com/search/docs/essentials/spam-policies |
| Scaled content abuse: stitching and scraped sources | Combining or transforming other pages' content (synonyms, translation, stitching) into many pages without added value is also scaled content abuse. | https://developers.google.com/search/docs/essentials/spam-policies |
| Doorway abuse | Many near-identical pages aimed at similar queries, or pages that exist only to funnel visitors elsewhere, are doorways. Pages need a clear browseable hierarchy, not a pile of query variants. | https://developers.google.com/search/docs/essentials/spam-policies |
| Keyword stuffing | Lists of places or names a page wants to rank for, or unnatural repetition, count as keyword stuffing. | https://developers.google.com/search/docs/essentials/spam-policies |
| Misleading functionality | A page that claims a tool or capability it does not deliver is spam. | https://developers.google.com/search/docs/essentials/spam-policies |
| Scraping policy (republishing others' content) | Republishing other sites' content, or lightly altering it, to rank is abusive scraping. | https://developers.google.com/search/docs/essentials/spam-policies |
| Machine-generated traffic to Google | Automated queries to Google Search, including rank checking, are against the spam policies and the Terms of Service unless Google gave express permission. | https://developers.google.com/search/docs/essentials/spam-policies |
| Thin affiliation / cookie-cutter templates | Template pages with the same content repeated across a site, with no added value, are treated as thin. Good pages add testing, comparisons and navigation. | https://developers.google.com/search/docs/essentials/spam-policies |
| Link spam: buying, exchanging, automating, directories, widgets | Links made to manipulate ranking are spam: paid links, link exchanges, automated link creation, low-quality directories, widget or footer links, optimised guest-post anchors. Paid or sponsored links are allowed only if qualified. | https://developers.google.com/search/docs/essentials/spam-policies |
| Qualifying outbound links (sponsored, ugc, nofollow) | Mark paid placements with rel=sponsored, user-generated links with rel=ugc, and links you do not want to vouch for with nofollow. Links with these values are generally not followed. | https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links |
| Site reputation abuse | Third-party content hosted on an established site mainly to borrow its ranking signals is inconsistent with the policy. Editorial, user-generated and first-party content is not. | https://developers.google.com/search/docs/essentials/spam-policies |
| Helpful, people-first content: warning signs | Heavy automation across many topics, summarising others, and writing for search traffic rather than an existing audience are listed warning signs. Crediting sources does not replace original effort. | https://developers.google.com/search/docs/fundamentals/creating-helpful-content |
| Who / How / Why and main-content effort | Show who made the page and how (including automation). Raters judge effort, originality, talent and accuracy of the main content. Interactive tools count as main content. Fabricated author profiles are deception. | https://developers.google.com/search/docs/fundamentals/creating-helpful-content |
| Generative AI content | Generative AI may help research and structure, but generating many pages without value can be scaled content abuse. All AI output, including title, meta description, structured data and alt text, must be fact-checked before publi… | https://developers.google.com/search/docs/fundamentals/using-gen-ai-content |
| AI features (AI Overviews, AI Mode): no extra requirements | A page is eligible as a supporting link only if indexed and snippet-eligible. There are no additional technical requirements, special schema, or AI-specific files. | https://developers.google.com/search/docs/appearance/ai-features |
| Google generative-AI guide: fan-out pages and 'AEO/GEO' | Making a separate page for every query or fan-out variation, primarily to influence rankings or AI answers, violates the scaled content abuse policy. Chunking, rewriting for AI and inauthentic mentions are listed as unneeded. | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide |
| llms.txt and special AI markup, Google | Google Search does not use llms.txt, AI text files, special markup or Markdown copies. They neither help nor harm in Google Search. | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide |
| Structured data for AI | Structured data is not required for generative AI features and no special schema exists; keep using it only for rich-result eligibility. | https://developers.google.com/search/docs/fundamentals/ai-optimization-guide |
| General structured data quality rules | Markup must describe visible, relevant page content; hidden content, fake reviews and misrepresenting the site's purpose can bring a manual action that removes rich-result eligibility. | https://developers.google.com/search/docs/appearance/structured-data/sd-policies |
| FAQ rich results are gone | The FAQ rich result stopped appearing on 2026-05-07 and its documentation was removed; the faqpage URL now redirects to the updates log. | https://developers.google.com/search/updates#removing-faq-rich-result |
| SoftwareApplication structured data | For the software-app rich result Google requires name, offers.price (0 if free) and either aggregateRating or review; applicationCategory and operatingSystem are recommended. Pages with only a VideoGame type are not shown. | https://developers.google.com/search/docs/appearance/structured-data/software-app |
| Sitemap limits and content | One sitemap holds at most 50,000 URLs or 50 MB uncompressed; split with an index (up to 50,000 sitemaps per index, 500 index files per Search Console property). List canonical, absolute URLs only; priority and changefreq are igno… | https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap |
| Large-site crawl budget | Google's crawl budget guide is for sites with 1 million+ pages (weekly changes) or 10,000+ pages (daily changes); it advises consolidating duplicates, returning 404/410 for removed pages, fixing soft 404s, and keeping sitemaps cu… | https://developers.google.com/crawling/docs/crawl-budget |
| SEO starter guide: promotion, duplicate content, copying | Duplicate URLs are not a manual-action issue, but copying others' content is. Promotion can be overdone and perceived as manipulation. Keyword-in-URL and word count have little effect. | https://developers.google.com/search/docs/fundamentals/seo-starter-guide |
| Bing: scale, scraping, duplication, thin pages | Bing lists large-scale content generated without oversight, scraped or lightly rewritten content, near-duplicate pages across URLs, and affiliate-only pages as practices that cut ranking and grounding eligibility, up to delisting. | https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a |
| Bing: link schemes and directories | Bing says links should be earned; link buying, private networks and artificial promotion violate its guidelines. Its separate Link Building page says reciprocal links carry limited value and 10,000 new links in one day looks like… | https://www.bing.com/webmasters/help/link-building-7a3f99b7 |
| Bing: structured data and prompt manipulation | Structured data must match visible content or may be ignored. Content added to manipulate Bing's or Copilot's language models can cut visibility or cause removal. | https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a |
| Bing: IndexNow, sitemaps, lastmod | Bing wants IndexNow for added, updated and removed URLs, preferably streaming rather than batch, canonical-only sitemaps with accurate lastmod, and 404 for removed pages. | https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a |
| IndexNow limits and behaviour | Up to 10,000 URLs per POST; key file at the host root; first use may return 202; avoid resubmitting the same URL many times a day (wait 5 minutes between updates, 10 minutes after a 429); submission does not guarantee indexing; l… | https://www.indexnow.org/faq |
| Microsoft Advertising guidance on AI answers (non-binding) | Microsoft's blog advises consistent title, H1 and description, descriptive headings, short Q&A, lists and tables, JSON-LD, key facts in HTML rather than images or PDFs, and not hiding key answers in tabs or menus. | https://about.ads.microsoft.com/en/blog/post/october-2025/optimizing-your-content-for-inclusion-in-ai-search-answers |

Gates proposed by the agent:

| Gate | Applies to | Test |
|---|---|---|
| G1 Unique evidence per page | scenario ('scrape <site>') pages | Each page in a batch has its own recorded run: command, source commit, run date, whether proxied or direct, and the real Evidence Record fields (final URL, status, robots decision, content hash). No two pages in the batch share the same result table. Fail if… |
| G2 Small-batch pilot before scale | scenario pages and any other programmatic family | Publish at most a small first batch (internal proposal: about 5 pages) and check Search Console after several weeks for indexing and impressions on those URLs before adding more. Any batch where most pages sit in 'Crawled - currently not indexed' or 'Discover… |
| G3 Honest outcome on hard sites | scenario pages and tutorials | If the run for a site returned blocked, empty, wrong or partial content, the page says so using the status/blockReason in the Evidence Record and still counts in the batch. No page claims Octocrawl can read a site it has not read in a recorded run. No wording… |
| G4 Reachable by hierarchy, not by query | scenario pages, comparison pages | Each page is linked from a hub page and a category page by crawlable <a href> links, and has a distinct user task, not just a distinct query phrase. A page fails if its only purpose is to send visitors to install or signup, or if two pages answer the same tas… |
| G5 No target lists or stuffing | all pages | No block listing many sites, cities or keywords, and no repeated exact phrase in an unnatural way. Read the page aloud; if a section exists only to hold keywords, remove it. |
| G6 Excerpt-only use of third-party content | scenario pages, tutorials | Pages show Octocrawl's output (hashes, field names, short excerpts) and never reproduce a target page's full text or large parts of its documentation. Check that quoted third-party text is short and attributed. Basis: scraping and scaled-content policies. |
| G7 First-hand comparison | comparison pages (Octocrawl vs Firecrawl and others) | The page states the competitor version tested (the repository freezes firecrawl-js v4.42.0), the test inputs, the date, the command, and the result for both tools, including cases where Octocrawl loses or cannot read the page. Every competitor claim not teste… |
| G8 Link qualification | comparison pages, tutorials, any page with outbound links | Any paid, sponsored, affiliate or reward link carries rel=sponsored (or nofollow); any user-contributed link carries rel=ugc. Search the built HTML of the batch for outbound links and confirm each one is either editorial (no rel needed) or correctly qualified… |
| G9 AI-assisted content review | tutorials, comparison pages, scenario pages, tool pages | A named person has run every command or checked every claim; titles, meta descriptions, alt text and JSON-LD were also reviewed by a person; a real byline and an About page exist; no invented author, headshot or credential; the page says where automation was… |
| G10 Tool pages must work | free tool pages | On a clean browser profile, the tool completes its stated job on a sample input without login, and the result matches the page's promise. Fail if the tool fails, only redirects to signup, or relies on a bot-defended target in its demo. Also check that the pag… |
| G11 Structured data accuracy | all pages with JSON-LD | Every JSON-LD property is visible on the page or true of the page; validated by the Rich Results Test; no FAQPage markup added for rich results (feature gone since 2026-05-07); no aggregateRating or review unless real, visible user reviews exist; SoftwareAppl… |
| G12 Sitemap hygiene | sitemap.xml and any sitemap index | Only canonical, indexable, 200-status, absolute URLs; UTF-8; at most 50,000 URLs and 50 MB uncompressed per file (index above that); lastmod changes only when main content, structured data or links change; priority/changefreq are not relied on; removed pages… |
| G13 IndexNow discipline | IndexNow submissions | Submit only URLs that passed gates G1 to G12; only new, changed or deleted URLs; at most 10,000 URLs per POST; the key file is served at the host root; the same URL is not resubmitted within 5 minutes (10 after a 429); responses are logged. Fail if the whole… |
| G14 Backlink and directory plan | directory submissions, outreach, guest posts, partner pages | Each target is a curated, editorial listing the team would be comfortable disclosing to a search-engine rep; no payment or goods for a ranking link without rel=sponsored; no automated posting or link-building tools; no reciprocal 'partner' page made for linki… |
| G15 No cloaking via AI or Markdown variants | llms.txt, Markdown mirrors, content negotiation for agents,… | Any alternate version (llms.txt, .md copy, agent-specific response) contains the same substantive claims as the HTML page that users and Googlebot see, with no text served only to bots or only to agents. Never tell AI models what to say about Octocrawl. Treat… |
| G16 No hidden text or links; key answers visible | all pages | No text or links hidden by CSS, off-screen, zero font size, or colour match. Accordions and tabs are acceptable to Google, but the main answer to the page's question is visible without a click (Microsoft advises this for AI answers). |
| G17 Unique titles, one topic, early answer | all pages | Unique <title>, H1 and meta description per page, accurate and not exaggerated; one primary topic per URL; the answer or key fact appears near the top; one canonical URL per piece of content; dates only change when the page changes substantially. |
| G18 Crawlable and indexable | all pages | Robots.txt, CDN and Worker rules allow Googlebot and Bingbot; the page returns 200 with text in the initial HTML or in rendered HTML visible via the URL Inspection tool; not noindex; snippet allowed. Pages that return soft-404 'no data' content must return a… |
| G19 No third-party hosted SEO content | blog, tools, any future guest or partner section | Content on octocrawl.dev is written or editorially owned by the Octocrawl team; any sponsored or partner piece is clearly marked, integrated, and has rel=sponsored links; user-generated areas have spam controls and ugc links. Do not move failing pages to a ne… |
| G20 No automated queries to search engines | research scripts, scenario pages about scraping search resu… | No script or demo sends automated queries to Google Search without express permission. Search demand data comes from Search Console. A tutorial about scraping SERPs is reviewed against the machine-generated-traffic policy and the engine's Terms before publica… |

Official pages give no numeric threshold for scaled content abuse. Google Search ignores `llms.txt` and special AI markup, per the AI-optimisation guide (updated 2026-07-10).


## 10. Unknown after this run

- Search volume and keyword difficulty for every keyword (no tool).
- Backlink and referring-domain counts for octocrawl.dev and for most competitors (no tool; Semrush free pages covered 4 of 10 domains).
- Any fixed-locale Google or Bing SERP position; People Also Ask and AI answer boxes (not observable through the tools used).
- What Reddit says (blocked on every route).
- Whether Octocrawl's hosted and local numbers on the 92-task and 50-task sets can be quoted in SEO copy (they differ by task set; see ROADMAP.md).
- Whether a family of per-site evidence pages would be judged helpful (only Search Console data after a pilot can show it).
- The real share of Octocrawl's npm and PyPI downloads from outside users.
- Traffic and referral value of every external page listed in section 8; the rel attribute of AlternativeTo, KDnuggets, Upwork, DesignRush, PyPI, npm and mcpservers.org detail pages (blocked).
- Page anatomy beyond the 7 to 15 sampled pages per competitor; the Apify sample was cut off in the verifier's input, so only Firecrawl, Jina and Apify were re-counted.

Result files: `.w2l/seo/2026-10-27/{gsc,comp,kw,comm,ext,policy,market}.json` and the six `*Verify.json` files.

