# Real-site run 2026-10-06: webscraper.io product page gave 241 characters

Found in the shop-listing work (PR #225): webscraper.io's test-shop product page returned 241 characters of Markdown. This record covers the fix on branch `claude/webscraper-product-page`.

## Setup

- **Source commits:**
  - `f052375` (origin/main) for "before";
  - `fcb2c45` for "after" and the final API runs;
  - `ca8dd72` (an intermediate commit, see Review) has its own lists record.
- **API:** `npm run api` on port 8787, standard mode.
  - Request: `curl --noproxy '*' -X POST localhost:8787/v1/scrape -d '{"url":"<url>","debug":true}'`.
  - The page type is read from the last `extract` event in the trace.
- **Network:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). Every response records `evidence.envProxy: 127.0.0.1:7890`. No direct run was made.
- **When:** 18:05 to 18:42 UTC on 2026-10-05, which is 02:05 to 02:42 on 6 October at UTC+8, the date the record is named by.
- **Raw responses, capture and corpus results:** `.w2l/parity/2026-10-06-webscraper-product/` (git-ignored).

## Reproduction at `f052375`

| Field | Value |
| --- | --- |
| URL | https://webscraper.io/test-sites/e-commerce/allinone/product/60 |
| Scrape | `ac3b17d6-0f0b-4484-8a6f-912ad86b16d2` |
| Result | `success`, http, `product`/`product`, confidence 0.6, 241 characters |
| Warnings | `client_rendered_suspected` (`script_shell`) and `low_content_yield` |
| Escalation | `http → browser_local`, trigger `quality_client_rendered`, `improved: false` |

The Markdown held the picture, $295.99, the title, the description, "HDD:" and "14 reviews".

The page itself, in a `curl` capture made through the proxy, shows that and nothing more, except the HDD sizes 128, 256, 512 and 1024. So the 241 characters were most of the page; what was missing was the option values, and the warnings were false.

## Causes

1. **Option values dropped.** The HDD sizes are `<button>` swatches. `cleanTree` (`packages/extract-tf/src/prune.ts`) and the Markdown converter drop every button as a control.
2. **False shell warning.** The cleaned page has 264 characters of text beside 2,259 characters of inline widget script. `script_shell` (`packages/extract-tf/src/render.ts`) flags any page under 300 characters of text with 2,000 or more characters of script. That flag sent the page to the browser rung, which found nothing more.

## Fix (`fcb2c45`), as chosen by the person who asked

- **Option values on product pages only.**
  - Before cleaning, `markOptionGroups` (`packages/extract-tf/src/product.ts`) sets aside each of the product's option groups as an empty placeholder. An option group is a labelled `<select>`, or a labelled element whose children are two or more non-submit buttons, that either sits in the add-to-cart form (`cart`, `basket` or `bag` in the form's action, id or class), or is named, with its container or children, for a `swatch`, `variant`, `variation` or `attribute`.
  - Left out: a select's empty-valued prompt, and quantity pickers (choices counting up from 0 or 1, zero-padded included).
  - After routing, a placeholder becomes its values as text (" 128, 256, 512, 1024 ") on a `product` page, and is removed on any other page.
- **Narrow shell check.** `script_shell` does not apply when the extracted region shows the name and price the page declares in JSON-LD or microdata.

## Review

- A clean-context review of `ca8dd72` ran the change over 175 saved pages: the 120 Amazon pages under the main checkout's `.w2l/amazon-baseline/raw/` with a `/dp/` URL, and 55 `.w2l/parity` captures.
- 37 of the 70 Amazon pages it compared gained noise, because every labelled select on a product page became values:
  - gift-date month and day pickers ("01, 02, … 12");
  - a video player's caption settings;
  - a review sort, shown on a synthetic page.
- `fcb2c45` requires the cart form or an option name, and counts zero-padded runs as quantities. A re-review over the same corpus found that only the intended pages change, and that no option `ca8dd72` had added was lost.
- The corpus has no Shopify page and no page with option buttons in an unnamed container, so how the rule does there is unknown.

## Tests

The new cases are in `packages/extract-tf/test/extract.test.ts`, under "a small product page whose options are controls", plus one http-lane integration test in `packages/bench/test/resilientHttp.integration.test.ts`. The three targets and the noise case failed before their fix.

| Case | Checks |
| --- | --- |
| Swatch buttons | values shown |
| A select in a WooCommerce cart form | choices shown, without its prompt |
| A quantity picker, plain and zero-padded | left out |
| A link after a select | spaced apart from the values |
| Other labelled controls: review sort, date picker, caption settings in `role=dialog`, review-filter buttons | left out |
| Unlabelled buttons | left out |
| Controls on a non-product page | left out |
| A small page that shows its declared product | not a shell |
| A product page whose region does not show its declared name or price | still a shell |
| http lane | `success` with the values, no warnings, no `quality_client_rendered` |

Removing any one guard fails one of these.

## Comparison: 175 saved pages

- **What was read:** the 120 Amazon pages and 55 `.w2l/parity` captures named in Review.
- **How:** each was read by `extractTf.extract` at `f052375` and with `fcb2c45`'s code, and the Markdown and `render.reason` compared.
- **Result:** 5 pages changed.
  - The two scrapingcourse.com product pages, each captured twice:
    - `| Size |  |` → `| Size | XS, S, M, L, XL |`;
    - `| Color | [Clear](#) |` → `| Color | Blue, Green, Red [Clear](#) |` (or Gray, Orange, Purple).
  - The webscraper.io page: "128, 256, 512, 1024" added, and `script_shell` → none.
- No Amazon page changed.
- **Results:** `before.json` and `after.json` in the raw-response folder.

## API runs at `fcb2c45`

| URL | Scrape | Result | Page type / strategy / confidence | Markdown | Warnings | Lanes tried |
| --- | --- | --- | --- | --- | --- | --- |
| https://webscraper.io/test-sites/e-commerce/allinone/product/60 | `e55794ca-a208-42ae-ab3a-68b30c49c6c3` | `success`, http | product / product / 0.6 | 262 | none | http |
| https://webscraper.io/test-sites/e-commerce/allinone/product/61 | `919418fd-1abd-424b-b17c-6d96b75e0501` | `success`, http | product / product / 0.6 | 286 | none | http |
| https://webscraper.io/test-sites/e-commerce/static/product/60 | `a3d23a25-71e1-4e93-9e73-2d2d08350db5` | `success`, http | product / product / 0.6 | 262 | none | http |
| https://www.scrapingcourse.com/ecommerce/product/abominable-hoodie/ | `68f7f5a9-1adf-45c1-b89f-6f5e2f084cbb` | `success`, http | product / product / 0.6 | 335 | `robots_overridden` | http |
| https://web-scraping.dev/product/1 | `5ae4aaed-e11a-4f3b-8552-7cc2e601b8db` | `success`, http | product / article / 0.75 | 2096 | none | http |
| https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html | `43277660-e7cb-41b4-a8f0-9f48c0c9aa72` | `success`, http | product / product / 0.75 | 1586 | none | http |
| https://www.ikea.com/us/en/p/micke-desk-white-80213074/ | `2e0d732e-cbb8-4204-9cd8-a8fae1727874` | `success`, browser_local | product / product / 0.75 | 15093 | none | http, browser_local |

What the Markdown shows:
- The webscraper.io page ends "HDD:" then "128, 256, 512, 1024".
- scrapingcourse.com shows `| Size | XS, S, M, L, XL |` and `| Color | Blue, Green, Red [Clear](#) |`. Its Description tabs are a separate fix (#227), not on this branch.
- web-scraping.dev's quantity picker does not appear.

## Regression batch

`node research/parity/run-sites.mjs --batch lists --record research/parity/runs/<record>`, proxied, passed 8/8 cases and 34/34 checks, with the same page types and strategies as earlier runs:

| Commit | Record |
| --- | --- |
| `ca8dd72` | `2026-10-06-lists-proxied-ca8dd72.md` |
| `fcb2c45` | `2026-10-06-lists-proxied-fcb2c45.md` |
