# Live checks 2026-10-04: logins and handoff in the person's own Chrome (group B)

The checks of the interaction work that only the person's own Chrome can run:
- a login kept in localStorage (#181);
- a single-page scrape handed over (#173);
- the parts of the I1 login run ([2026-10-03-i1-login.md](2026-10-03-i1-login.md)) not run live: mode authed through the API and the MCP service, a site that sets `__Host-` cookies, and an expired login.

## Setup

- **Source commit:** `4db2cf1` (main after PR #192), in the worktree. `w2l` below stands for `npm run w2l --` (`npm run -s w2l --` in the runs).
- **W2L's own fetches:** **proxied** through the shell's `HTTPS_PROXY` (127.0.0.1:7890). A Cloudflare trace through it earlier the same day showed `loc=SG`.
- **The person's Chrome:** Howard's Chrome, version 153.0.8010.53 (as the handoff reads report it), default profile, remote debugging on at `chrome://inspect/#remote-debugging`. It used its own network settings, which were not recorded. Howard clicked Allow at each connection and signed in to each site himself.
- **Saved logins:** a scratch `W2L_SESSIONS_FILE` (`.w2l/b-acceptance/sessions.json`), deleted after the run; `~/.w2l/sessions.json` was not used. The task roots were scratch directories under `.w2l/b-acceptance/`.
- **Temporary servers:** the API on port 8787 and a local MCP host on port 8792, both with the scratch sessions file, both stopped after. The person's own MCP host on 8791 was not touched.
- **What this record holds:** statuses, counts, event names and page titles only. Nothing of the person's accounts is recorded.
- **Where the figures come from:** each CLI and API scrape's JSON was saved under `.w2l/b-acceptance/` (git-ignored). These were read from the commands' output during the session and not kept as files:
  - the MCP scrape's result;
  - the `login import` answers, `GET /v1/logins` and `list_logins`;
  - the cookie names, flags and domains;
  - the `loc=SG` trace.

## B1: a login kept in localStorage (bsky.app)

Bluesky's web app keeps its sign-in in localStorage and sets no cookie.

| Step | Command | What it showed |
| --- | --- | --- |
| 1 | `w2l login import bsky.app`, a `bsky.app` tab open | `cookieCount: 0`; `localStorage: {origins: ["https://bsky.app"], itemCount: 10}`; `localStorageRead: true`; `localStorageUnread: []` |
| 2 | `w2l scrape https://bsky.app/notifications --mode standard --debug --formats markdown --only-main-content=false --wait-for 4000` | `success`, 133 characters: the signed-out splash ("What's up?", Business, Blog, Jobs) |
| 3 | the same with `--mode authed` | `success`; `channelsTried: ["authed_session"]`; 2,102 characters with the Notifications heading and the signed-in navigation (Saved, Profile, Settings); `session_attached` with `cookieCount: 0, localStorageOrigins: 1` |
| 4 | `w2l login import bsky.app`, every `bsky.app` tab closed | Refused: "Chrome has no cookies for bsky.app, and no tab of bsky.app is open to read its localStorage from …". The sessions file was unchanged, so step 1's login stayed. |

- **Step 1 also settles a point #181 left open.** Real Chrome (153 here) gives the default profile's browser context id: the tab was read only because its context matched it.
- **Without `--wait-for`,** step 2 read the page before the app had drawn it: `failed`/`empty_unverified`, with and without `--only-main-content=false`. Step 3 was run only with it.

## B2: a single-page scrape handed over

| Step | Command | What it showed |
| --- | --- | --- |
| 1 | `w2l scrape https://www.scrapingcourse.com/antibot-challenge --handoff --debug` | `success`, lane `browser_local_authed`, "You bypassed the Antibot challenge! :D". `user_browser_read`: `sawGate: cloudflare_challenge`, `act: user_activation`, `waitedMs: 8576`. Trace has `handoff_from`. `summary.attempts`: http, browser_local, browser_local_authed (#180) |
| 2 | API `POST /v1/scrape {"url":"https://www.scrapingcourse.com/cloudflare-challenge","handoff":{"waitMs":300000},"maxAge":60000,"debug":true}` | **Not read.** `blocked`, `cloudflare_challenge`, with `handoff_not_through`: "… not through within 300 s: the page showed no check, and you did not click on it to have it read …". `metadata.cacheState: miss`. `handoff.rationale` reads "… handed to you in your own Chrome it was not read there … send the request again with handoff to try once more …". `agentHints` names only the batch handoff: "… or, for a batch run on your own machine, getting through the check yourself in your own Chrome (w2l batch --handoff, POST /v1/batches/:id/handoff)" |
| 3 | API `POST /v1/scrape {"url":"https://www.scrapingcourse.com/cloudflare-challenge","handoff":{"waitMs":180000},"debug":true}` (no `maxAge`), with a read-only watcher on a second CDP connection logging the site's tabs each second | `success`: `act: user_activation`, `waitedMs: 4791`, `sawGate: captcha` |

**Step 2: why it was not read.**
- Howard reported that the tab showed the page itself, with no check, and that he clicked on it several times. W2L saw no activation on the tab's document.
- In step 3, the watcher showed the tab W2L opened as hidden and without focus for two seconds after it loaded, then visible. Chrome marked it activated as soon as Howard clicked it.
- **Unconfirmed:** that in step 2 the clicks went to another page or window while W2L's tab was not in front. Step 2 had no watcher, and the same symptom in the [I6 runs](2026-10-04-i6-handoff.md) (runs 4 and 5) is also unconfirmed.

**Step 3 of the plan** (a handoff left to time out) was not run separately: step 2 showed the same answer, the warning and the rationale.

## B3a: mode authed through the API and the MCP service

| Step | Command | What it showed |
| --- | --- | --- |
| 1 | API `POST /v1/scrape {"url":"https://bsky.app/notifications","mode":"authed","onlyMainContent":false,"waitFor":4000,"debug":true}` | As B1 step 3: `success`, `authed_session`, the signed-in page, `localStorageOrigins: 1` |
| 2 | API `GET /v1/logins` | `bsky.app` with `cookieCount: 0` and `localStorage: {origins, itemCount: 10}`; no value |
| 3 | MCP host on 8792: `list_logins`, then `scrape` with `mode: "authed"` and the same options | `list_logins` as step 2. `scrape` as step 1 |

## B3b: a site that sets `__Host-` cookies (github.com)

| Step | Command | What it showed |
| --- | --- | --- |
| 1 | `w2l login import github.com` | `cookieCount: 14`. A one-line `node` script printed each saved cookie's name, domain and `secure`/`httpOnly` flags from the scratch sessions file, never a value: among them `__Host-user_session_same_site` (secure, httpOnly). `localStorageUnread: ["https://github.com"]` |
| 2 | `w2l scrape https://github.com/notifications --mode authed --debug --formats markdown,links` | `success`; `channelsTried: ["authed_session"]`; final URL `https://github.com/notifications` (no redirect to the sign-in page); title "Notifications"; `session_attached` with `cookieCount: 14` |

- **Step 1:** a GitHub tab was open, but reading its storage failed. The import saved the cookies and named the origin, as #188 made it do.
- **Unconfirmed:** why the read failed. W2L names an origin unread on any error in attaching to the tab or reading it: a timeout, a crash, a discarded or a closing tab. Nothing kept says which.

## B3c: an expired login (www.airbnb.com.sg)

Airbnb was used instead of GitHub at Howard's request.
- **The domain:** through the proxy's exit, `www.airbnb.com` redirects to `www.airbnb.com.sg`, the domain Howard is signed in on.
- **The page:** robots.txt disallows `/account`, `/inbox`, `/trips/upcoming`, `/trips/v1/`, `/users/show` and `/users/profile`, so the page used is `/wishlists`.

| Step | Command | What it showed |
| --- | --- | --- |
| 1 | `w2l scrape https://www.airbnb.com/wishlists --mode standard --debug --formats markdown,links --only-main-content=false --wait-for 3000` | `success`; final URL `https://www.airbnb.com.sg/wishlists`; title "Wishlists - Airbnb"; "Log in to view your wishlists" |
| 2 | `w2l login import airbnb.com.sg` | `cookieCount: 32` (on `.airbnb.com.sg` and `.www.airbnb.com.sg`); `localStorage: {origins: ["https://www.airbnb.com.sg"], itemCount: 7}` |
| 3 | `w2l scrape https://www.airbnb.com.sg/wishlists --mode authed` (same options) | `success`; title "Your lists · Wishlists - Airbnb"; no sign-in prompt. `session_attached` with `cookieCount: 32, localStorageOrigins: 1`. Ladder `ladder_session_loaded`, `ladder_session_first` |
| 4 | Howard signed out of Airbnb in Chrome, then step 3 again | **`success`, exit 0**: title "Wishlists - Airbnb", "Log in to view your wishlists". The same ladder events, no `ladder_session_rejected`, no hint |

**This step failed.** The README says a site that refuses the saved login (`login_wall`, for example when it expired) ends the run there, instead of returning the logged-out page. Here the login was refused and the logged-out page came back as `success`.

W2L tells a refused login in two ways (`sessionRejection` in `packages/bench/src/routing/ladder.ts`):
- a redirect to a sign-in path, as the site in I1 step 9 made;
- a result the gate reads as `login_wall`: a 401, or a page without content that shows a password field with a sign-in phrase (`packages/http-core/src/gate.ts`).

Neither matched here:
- Airbnb answered the same URL with status 200, so there was no redirect.
- The page was read as content (`extract` with `escalate: false`, confidence 1). The browser lane judges a page it read as content by decisive evidence alone (`classifyGate` with `contentful: true`), which returns before any sign-in check. So the gate never asked whether the page asked for a sign-in, whatever its form.
- No HTML of the page was kept, so whether it had a password field is not known.

## What this found

1. **An expired login read as content** (B3c step 4), when the site answers the same URL with status 200 and a page W2L reads as content around a sign-in prompt. The gate does not look for a sign-in on a page read as content.
2. **Two different SHA-256s for one login.**
   - `login import`, `GET /v1/logins` and MCP `list_logins` give `sessionFingerprint` (`packages/bench/src/routing/sessionStore.ts`), e.g. `9b29…` for B1's login.
   - A read's `session_attached` event gives another hash, of the access configuration (`packages/http-core/src/access.ts`), `cee3…` for the same login.
   - The README says records carry the login's SHA-256, but a record cannot be matched to a saved login by it. This was so before #181 too.
3. **B2 step 2: unconfirmed.** A handoff was not read although Howard clicked on the page several times. See B2.
4. **A scrape's gate hint names only the batch handoff** (`packages/api/src/hints.ts`), also on a scrape that was handed over, though a scrape takes `handoff` since #173.

## Not checked

- Windows and Linux; a direct (unproxied) run of W2L's own fetches; Chrome's own network route.
- A site that ties its login to more than its cookies and localStorage.
