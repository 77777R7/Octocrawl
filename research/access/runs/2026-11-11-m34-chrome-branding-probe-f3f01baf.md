# M3.4: what a site can see of installed Chrome 157 and Chrome for Testing 157

Date: 2026-11-11 local (all runs 2026-11-10T16:46Z–16:51Z). Source commit: `f3f01baf` (origin/main), `dist/` built
from it with `npx tsc --build`. Direct: proxy variables unset, and the rung starts Chrome with
`--proxy-server=direct://`. No site was read: each build only talked to two servers the script starts on 127.0.0.1
and to its own `chrome://version` and `chrome://components`. No product code changed.

Task: [docs/enhanced-access-tasks.md](../../docs/enhanced-access-tasks.md) M3.4. Background: M3.2
([record](2026-11-10-chrome-testing-157-1949dc97.md)) found that crunchbase and stackoverflow follow the build
(Chrome for Testing reads them, installed Chrome is refused) and B&H goes the other way.

## Command

```bash
env -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY -u https_proxy -u http_proxy -u all_proxy \
  W2L_CHROME_PATH=<binary> node research/access/probe/branding-probe.mjs --label <name> --out <file.json>
node research/access/probe/branding-probe.mjs --diff <a.json> <b.json>
```

The script launches the build with `launchInstalledChrome` (detection flags `nodriver-0.50.6-no-allow-origins`, a
fresh profile, headed, no overrides), the way the `installed_chrome` rung does. It records the request headers of a
first navigation, of a navigation after `Accept-CH`, and of a `fetch`; properties read by page script; the TLS
ClientHello sent to a raw TCP listener (GREASE values dropped, extensions sorted; the address is an IP literal, so
there is no SNI); and the two `chrome://` pages.

| Label | Build | Runs |
| --- | --- | --- |
| S157 | installed Google Chrome 157.0.8103.50 | 3 |
| C157 | Chrome for Testing 157.0.8103.50 | 5 (two of them were meant to carry an extra flag that the rung dropped; they are plain C157 runs) |
| C157-noftc | the same Chrome for Testing binary behind a wrapper script that adds `--disable-field-trial-config` (`chrome://version` shows the flag) | 2 |
| C156 | Chrome for Testing 156.0.8078.80 | 1 |

Outputs: `.w2l/access/m34-2026-11-11/` (git-ignored).

## Run-to-run noise

Same build, two runs: only `downlink`, and window heights 2 px apart (inner 743/745, outer 830/832, `availHeight`
874/876), and the number of ClientHellos captured. These rows are left out below.

## S157 against C157 (the same in all three pairs)

| What | Installed Chrome 157 | Chrome for Testing 157 |
| --- | --- | --- |
| `sec-ch-ua` | `"Not-A.Brand";v="99", "Google Chrome";v="157", "Chromium";v="157"` | `"Chromium";v="157", "Not-A.Brand";v="99"` |
| `sec-ch-ua-full-version-list`, `navigator.userAgentData.brands`, `fullVersionList` | include Google Chrome | no Google Chrome entry |
| `window` names | has `Fence`, `FencedFrameConfig`, `HTMLFencedFrameElement`, `fence`, `XSLTProcessor` | none of the five |
| `document.browsingTopics` | present | absent |
| Speech voices | 199 | 180 |
| TLS ClientHello extensions | `5,10,11,13,16,18,23,27,35,43,45,51,17613,51764,65037,65281` | the same plus `4832` (0x12E0; not identified) |
| Variations on `chrome://version` | 28 ids | 335 ids |
| Components (all `0.0.0.0` on a fresh profile) | `Chrome Improved Recovery` | `Dictation Connector`, `Indigo`, `Related Website Sets`, `SODA en-US Models`, `SODA Library` |

The same on both: the User-Agent string (`Chrome/157.0.0.0`), the set and order of request headers, every other
client hint, `navigator.webdriver` (false), WebGL and WebGPU values, fonts, codecs, the cipher list, groups, key
shares, signature algorithms, ALPN, and the command line.

## With the field-trial testing config switched off

C157-noftc against S157: the `window` names, `document.browsingTopics`, the TLS extension list and the count of
variations (28) are the same as installed Chrome. What still differs: the brand entries in the client hints, the
voices (199 against 180), and two components (`Chrome Improved Recovery` only on installed, `Related Website Sets`
only on Chrome for Testing).

So the differences are of two kinds:

1. **The brand**: Chrome for Testing does not name Google Chrome in its client hints. No flag in this probe changes
   that.
2. **The field-trial testing config** that Chrome for Testing applies and installed Chrome does not: the extra TLS
   extension, the five missing `window` names, the missing `document.browsingTopics`, the 335 variations, four of
   the five extra components.

## C157 against C156 (one run of 156)

Besides the version strings: the request headers have the same members in a different order; `navigator.languages`
contains `en` on 157 and not on 156; `window` has `CanvasPaintEvent`, `ElementGeometryUpdateEvent`, `ElementImage`,
`TrustedHTMLParserOptions` only on 157 and the four Fenced Frame names only on 156; the WebGPU feature
`atomic-vec2u-min-max` only on 157; variations and two components differ.

## Not measured

- Which of the two kinds a site responds to. M3.2 showed sites treating the builds differently in both directions;
  this probe read no site. Reading the M3.2 pages with C157-noftc would separate them, and that is a detection
  flag in the sense of ADR 0005 decision eight only if the product were to adopt it.
- HTTP/2 settings and frame order; a ClientHello with SNI to a real host; anything a site's own script collects
  beyond the properties listed in the script.
- A signed-in or aged profile; component state after components download.
- Chrome for Testing 156 with the testing config off; installed Chrome 156 (not on this machine).

## Finding outside the task: Chrome for Testing 157 loaded nothing for about 25 minutes

From about 16:19Z to 16:45Z, Chrome for Testing 157.0.8103.50 started by the rung, or started by hand with
`--headless=new --dump-dom` and `--no-first-run` alone, loaded no page: navigations to the loopback servers timed
out (two TCP connections, closed after 400–900 ms with no bytes), `http://example.com/` through the local proxy
gave `net::ERR_BLOCKED_BY_CLIENT`, and `https://example.com/` timed out. `chrome://` and `data:` pages loaded. In
the same minutes Chrome for Testing 156 and installed Chrome worked, and so did the same 157 binary started by
Playwright's `chromium.launch` with its default arguments. It began working again at about 16:45Z with no change I
can name. Cause unknown. Checked: no policy for `com.google.chrome.for.testing`, `codesign --verify` passes; a
Cisco Secure Client socket filter is active on this Mac and was not shown to be related. Whether this is behind
the Chrome for Testing navigation timeouts in the M3.1 and M3.2 records is not verified.
