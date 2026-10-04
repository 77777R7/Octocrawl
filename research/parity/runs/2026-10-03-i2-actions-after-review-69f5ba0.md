# Real-site run 2026-10-03

Command: `node research/parity/run-sites.mjs --batch actions --record research/parity/runs/2026-10-03-i2-actions-after-review-69f5ba0.md`
Source commit: `69f5ba0d4e27da518bcb94248e036fa2ff85dc6c`
Run: 2026-10-03T10:50:30.155Z → 2026-10-03T10:53:26.456Z against http://127.0.0.1:8787
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 18 of 22 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 12/22; checks passing: 68/84.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AC01 | https://quotes.toscrape.com/js/ | 6/7 | field status (actions-pipeline) |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 1/4 | field status (action-wait-duration); markdownIncludes "Hello World!" (action-wait-duration); traceEvent (action-wait-duration) |
| AC03 | https://the-internet.herokuapp.com/dynamic_loading/1 | 1/3 | field status (action-wait-selector); markdownIncludes "Hello World!" (action-wait-selector) |
| AC04 | https://the-internet.herokuapp.com/key_presses | 1/3 | field status (action-press); markdownIncludes "You entered: ENTER" (action-press) |
| AC05 | https://quotes.toscrape.com/scroll | 2/4 | field status (action-scroll); field actions.javascriptReturns.1.value (action-scroll) |
| AC06 | https://www.scrapethissite.com/pages/ajax-javascript/ | 1/3 | field status (action-click); markdownIncludes "Spotlight" (action-click) |
| AC07 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 2/3 | field status (action-click) |
| AC08 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 2/3 | field status (action-scroll) |
| AC09 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 3/4 | field status (action-click) |
| AC10 | https://example.com/ | 5/5 | — |
| AC11 | https://example.com/ | 2/2 | — |
| AC12 | https://example.com/ | 6/7 | markdownIncludes "Example Domain" (actions-pipeline) |
| AC13 | https://quotes.toscrape.com/js/ | 7/7 | — |
| AC14 | https://quotes.toscrape.com/scroll | 3/3 | — |
| AC15 | https://www.scrapethissite.com/pages/ajax-javascript/ | 3/3 | — |
| AC16 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 3/3 | — |
| AC17 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 3/3 | — |
| AC18 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
| AC19 | https://quotes.toscrape.com/js-delayed/ | 4/4 | — |
| AC20 | https://webscraper.io/test-sites/e-commerce/more/phones/touch | 3/3 | — |
| AC21 | https://webscraper.io/test-sites/e-commerce/ajax/phones/touch | 3/3 | — |
| AC22 | https://webscraper.io/test-sites/e-commerce/scroll/phones/touch | 3/3 | — |

Failed checks with the observed value:

- AC01 [actions-pipeline] field `status`: failed
- AC02 [action-wait-duration] field `status`: failed
- AC02 [action-wait-duration] markdownIncludes `Hello World!`: no markdown
- AC02 [action-wait-duration] traceEvent: 0 of 6 events match
- AC03 [action-wait-selector] field `status`: failed
- AC03 [action-wait-selector] markdownIncludes `Hello World!`: no markdown
- AC04 [action-press] field `status`: failed
- AC04 [action-press] markdownIncludes `You entered: ENTER`: no markdown
- AC05 [action-scroll] field `status`: failed
- AC05 [action-scroll] field `actions.javascriptReturns.1.value`: 20
- AC06 [action-click] field `status`: failed
- AC06 [action-click] markdownIncludes `Spotlight`: absent
- AC07 [action-click] field `status`: failed
- AC08 [action-scroll] field `status`: failed
- AC09 [action-click] field `status`: failed
- AC12 [actions-pipeline] markdownIncludes `Example Domain`: absent
