# A sign-in page with copy read as a login wall, GitHub signed out, 2026-11-09

Do GitHub's account pages, read signed out, come back `blocked` / `login_wall` once the gate names a short sign-in page at a login path on a page read as content? The gap was found in the A4 run (`research/access/runs/2026-11-09-login-ux-a4-abadc733.md` on branch `claude/login-ux-a4-reread-login-walls`, PR #903, "Found on the way"): each of the three pages below came back `success` at `github.com/login?return_to=…`.

## Setup

- Source commit: `72f05169` (branch `claude/login-wall-copy-gate`, on `origin/main` `2c222af7`), built with `npx tsc --build` (run by `npm run typecheck`) before the runs.
- Baseline: the same tree with `packages/http-core/src/gate.ts` taken from `origin/main` `2c222af7` and rebuilt, so main's gate; restored and rebuilt afterwards.
- Client: the CLI in this process, no server: `node packages/cli/dist/cli.js batch https://github.com/notifications https://github.com/settings/profile https://github.com/settings/emails --out <scratch>`, and `node packages/cli/dist/cli.js scrape https://github.com/notifications --debug` for the signals.
- Network: proxied, `HTTPS_PROXY=http://127.0.0.1:7890` and `HTTP_PROXY` set; no GitHub login, no saved sessions.
- Machine: Howard's Mac, bundled Chromium for the browser lane.

## Runs

| Run | Time (UTC) | Gate | notifications | settings/profile | settings/emails |
|---|---|---|---|---|---|
| baseline, batch `0802f1e9…` | 02:11:33 | main `2c222af7` | `success`, browser_local, readiness `ready` | `success`, browser_local, `not_served` (`redirected_off_page`) | `success`, browser_local, `not_served` (`redirected_off_page`) |
| first fix, batch `f461ea81…` | 02:11:04 | `4910da90` (superseded, see below) | `blocked` `login_wall`, browser_local | `blocked` `login_wall`, browser_local | `blocked` `login_wall`, browser_local |
| fix, batch `5615ebd7…` | 02:15:06 | `72f05169` | `blocked` `login_wall`, browser_local | `blocked` `login_wall`, browser_local | `blocked` `login_wall`, browser_local |
| fix, scrape `--debug` | 02:15:38 | `72f05169` | `blocked` `login_wall`, browser_local | not run | not run |

Every page's final URL was `https://github.com/login?return_to=<the page asked for>`, HTTP 200. In all runs the http lane already named a login wall (signals `input_password`, `heading_sign_in`, on a page it did not read as content) and the ladder went on to the browser lane, which is where the baseline read the sign-in page as content.

`4910da90` named the page by its heading, password field and length alone. A review of it found three content pages that rule blocks (an article with a hidden sign-in modal, an account's "Login & security" page, a docs page on "Login with SSO"); `72f05169` adds the login path and keeps those as content. Its run stays in the table as the run it was.

## What the fixed runs showed

- Batch `5615ebd7…`: succeeded 0, failed 3, `waitingForPerson` 3, wallMs 8,331 (baseline `0802f1e9…`: succeeded 3, wallMs 77,176). Each item: readiness `not_served` (basis `login_wall`), no Markdown.
- The batch's hint was the L7 batch login hint: "3 pages of github.com asked for a login: ask the person first, naming the site, whether to read them with hand_off_batch …, a new batch of those URLs with lane my-browser in mode standard or a new batch of those URLs in mode authed, after import_login github.com …". The baseline's items carried the http lane's line, the "answered … in place of" hint (two of three) and a `low_content_yield` hint instead.
- Scrape `--debug`, browser lane `gate_detected`: signals `login_url`, `input_password`, `heading_sign_in`, `short_page`.

## Limits

One machine, one network path (proxied), signed out only, three pages of one site. `loginWallsOf` (A4) is on PR #903, not on this branch, so whether a follow-up batch picks these pages up was not run here; it reads `login_wall` items, which these now are. The direct (unproxied) path was not run. A sign-in page served at the URL asked for, with no redirect to a login path and copy the extractor reads as a main body, stays `success` by design of this change.
