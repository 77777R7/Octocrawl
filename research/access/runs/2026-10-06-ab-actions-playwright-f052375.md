# Real-site run 2026-10-05

Command: `node research/parity/run-sites.mjs --batch actions --record .w2l/access/ab-compat/actions-playwright.md`
Source commit: `f052375b0907c38999a9e7f24a78725a3c3f8241`
Run: 2026-10-05T17:01:01.294Z → 2026-10-05T17:04:09.500Z against http://127.0.0.1:8797
Network: HTTPS_PROXY, HTTP_PROXY, NO_PROXY set in the runner's environment; 20 of 24 cases' responses record an environment proxy in evidence.envProxy (127.0.0.1:7890).

Cases fully passing: 18/24; checks passing: 84/96.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AC01 | https://quotes.toscrape.com/js/ | 7/7 | — |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 1/4 | field status (action-wait-duration); markdownIncludes "Hello World!" (action-wait-duration); traceEvent (action-wait-duration) |
| AC03 | https://the-internet.herokuapp.com/dynamic_loading/1 | 3/3 | — |
| AC04 | https://the-internet.herokuapp.com/key_presses | 1/3 | field status (action-press); markdownIncludes "You entered: ENTER" (action-press) |
| AC05 | https://quotes.toscrape.com/scroll | 3/4 | field actions.javascriptReturns.1.value (action-scroll) |
| AC06 | https://www.scrapethissite.com/pages/ajax-javascript/ | 1/3 | field status (action-click); markdownIncludes "Spotlight" (action-click) |
| AC07 | https://webscraper.io/test-sites/e-commerce/more/computers/laptops | 3/3 | — |
| AC08 | https://webscraper.io/test-sites/e-commerce/scroll/computers/laptops | 3/3 | — |
| AC09 | https://webscraper.io/test-sites/e-commerce/ajax/computers/laptops | 4/4 | — |
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
| AC23 | https://example.com/ | 8/8 | — |
| AC24 | https://the-internet.herokuapp.com/key_presses | 1/4 | field status (action-step); traceEvent (action-step); markdownIncludes "You entered: ESCAPE" (action-press) |

Failed checks with the observed value:

- AC02 [action-wait-duration] field `status`: failed
- AC02 [action-wait-duration] markdownIncludes `Hello World!`: no markdown
- AC02 [action-wait-duration] traceEvent: 0 of 6 events match
- AC04 [action-press] field `status`: failed
- AC04 [action-press] markdownIncludes `You entered: ENTER`: no markdown
- AC05 [action-scroll] field `actions.javascriptReturns.1.value`: 20
- AC06 [action-click] field `status`: failed
- AC06 [action-click] markdownIncludes `Spotlight`: absent
- AC12 [actions-pipeline] markdownIncludes `Example Domain`: absent
- AC24 [action-step] field `status`: failed
- AC24 [action-step] traceEvent: 0 of 6 events match
- AC24 [action-press] markdownIncludes `You entered: ESCAPE`: no markdown
