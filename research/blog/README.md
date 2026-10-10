# Blog research briefs

One folder per octocrawl.dev blog article (`/blog/<slug>/`), each with the `brief.md` written before the article, as the article standard asks: the search task, the live top 5 Google results audited in a real browser, the content gap, the product connection and the claims the article must prove.

Method, for every brief (2026-10-10):

- **Demand**: Google autocomplete (`suggestqueries.google.com`, `hl=en&gl=us`). No keyword-volume tool was available, so monthly volume and difficulty are **unknown**, not zero.
- **SERP**: Google `hl=en&gl=us`, read in Chrome on macOS through the local proxy. The top 5 organic results were opened one by one and measured with the same script: title, H1, H2s, word count of the main region, tables, code blocks, images wider than 200 px, videos, the date the page states, and the `application/ld+json` types. A result the browser policy would not open (reddit.com) is listed as not audited.
- Word counts include navigation inside the main region, so they are approximate.
