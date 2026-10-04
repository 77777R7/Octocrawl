# Real-site run 2026-10-03

Command: `node research/parity/run-sites.mjs --batch actions --only AC02,AC03,AC04 --record research/parity/runs/2026-10-03-i2-actions-direct-d88c8eb.md`
Source commit: `d88c8eb435a188df4f7c5412f287aed9538a8f3b`
Run: 2026-10-03T10:33:06.367Z → 2026-10-03T10:33:11.749Z against http://127.0.0.1:8787
Network: NO_PROXY set in the runner's environment; 0 of 3 cases' responses record an environment proxy in evidence.envProxy.

Cases fully passing: 0/3; checks passing: 3/10.

| Case | URL | Checks | Failed checks (P1 item) |
| --- | --- | --- | --- |
| AC02 | https://the-internet.herokuapp.com/dynamic_loading/2 | 1/4 | field status (action-wait-duration); markdownIncludes "Hello World!" (action-wait-duration); traceEvent (action-wait-duration) |
| AC03 | https://the-internet.herokuapp.com/dynamic_loading/1 | 1/3 | field status (action-wait-selector); markdownIncludes "Hello World!" (action-wait-selector) |
| AC04 | https://the-internet.herokuapp.com/key_presses | 1/3 | field status (action-press); markdownIncludes "You entered: ENTER" (action-press) |

Failed checks with the observed value:

- AC02 [action-wait-duration] field `status`: failed
- AC02 [action-wait-duration] markdownIncludes `Hello World!`: no markdown
- AC02 [action-wait-duration] traceEvent: 0 of 4 events match
- AC03 [action-wait-selector] field `status`: failed
- AC03 [action-wait-selector] markdownIncludes `Hello World!`: no markdown
- AC04 [action-press] field `status`: failed
- AC04 [action-press] markdownIncludes `You entered: ENTER`: no markdown
