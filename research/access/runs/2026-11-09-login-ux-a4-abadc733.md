# Login UX A4, a real client: a new batch of a finished batch's login-wall pages, 2026-11-09

Does an agent that meets the L7 batch hint read again only the pages that stopped at a login wall, with `loginWallsOf`, without collecting their URLs itself? Task list: `docs/login-ux-tasks.md`, A4.

## Setup

- Source commit: `abadc733` (branch `claude/login-ux-a4-reread-login-walls`, PR #903), built with `npx tsc --build` before the server started.
- Server: `W2L_SESSIONS_FILE=<scratch> NO_PROXY=127.0.0.1,localhost node packages/cli/dist/cli.js serve --port 8793 --task-root <scratch>`, loopback. `HTTPS_PROXY=127.0.0.1:7890` was set in its shell; the fixture on 127.0.0.1 went direct, GitHub (probe only) through the proxy.
- MCP: `packages/mcp/dist/stdio.js` with `W2L_API_URL=http://127.0.0.1:8793`.
- Fixture: a throwaway site on 127.0.0.1:8796, not in the repository. `/docs/<name>` is public. `/account/<letter>` redirects to `/login?next=…` until a `sid` cookie is set; `/login` is a title "Sign in", a heading "Sign in" and a form with a password field, nothing else. `POST /login` sets the cookie.
- Client: Claude Code 2.1.301, model `claude-opus-5-5`, in an empty folder: `claude -p "<prompt>" --setting-sources project --strict-mcp-config --mcp-config <file> --disable-slash-commands --disallowedTools Skill --allowedTools 'mcp__octocrawl__*' --output-format stream-json --verbose`, the second turn with `--resume <session>`.
- Chrome: Howard's own, remote debugging already on. He signed in to the fixture in it (`POST /login` at 01:39:26Z) before the second turn; the reply to the agent was typed by the session running this test.

## Runs

| Run | Prompt | Agent's calls | Outcome |
|---|---|---|---|
| r1 | Read these five pages … one line each (2 docs, 3 account) | 5 × `scrape` | 3 pages `blocked` `login_wall`; the agent asked which way to read them as the person. No batch, so A4 was not reachable. Not continued. 6 turns, 14 s, $0.46 |
| r2, turn 1 | Read these twelve pages … one line each (6 docs, 6 account, interleaved) | `batch_scrape` (12 URLs), `wait_batch`, `get_batch_items`, `get_batch_errors`, `get_batch_items` | batch `57cf8eba…`: 6 success, 6 `blocked` `login_wall`. The agent asked first, naming 127.0.0.1:8796, with two ways. 10 turns, 34 s, $0.26 |
| r2, turn 2 | "Yes, read them as me in my Chrome. I'm signed in there and remote debugging is on." | `batch_scrape {loginWallsOf: "57cf8eba…", lane: "my-browser", mode: "standard", idempotencyKey}`, `wait_batch`, `get_batch_items` | batch `97364cbd…`: requested 6, succeeded 6, lane `my_browser`, in the first batch's order (account/a…f), wallMs 13,382. 4 turns, 30 s, $0.37 |

r2 turn 1 also tried `Bash` and `Read` on the result files; both were refused by `--allowedTools` and it went on with MCP calls.

The hint the agent got at the end of the first batch (shortened): "6 pages of 127.0.0.1 asked for a login: ask the person first, naming the site, whether to read them with hand_off_batch …, a new batch with loginWallsOf 57cf8eba-… with lane my-browser in mode standard or a new batch with loginWallsOf 57cf8eba-… in mode authed, after import_login 127.0.0.1 …"

## What the second batch read

- The fixture logged six reads in the second turn, `/account/a` to `/account/f`, all with the cookie, 01:39:50Z to 01:39:58Z. No docs page was read again.
- The server's `my_browser_approval` log for `97364cbd…`: `shown` (1 host), `ready`, `answer allowed` after 1,508 ms. Allow reading these sites: 1.
- Chrome's "Allow remote debugging?": not counted in this record.
- The agent gave every account page's line ("Your 2026-11 invoice totals 4,210 SGD", …) and the two Markdown folders, then said to turn remote debugging off.

## Found on the way

- A sign-in page with a sentence of copy is read as content, not as a login wall. GitHub `/notifications`, `/settings/profile` and `/settings/emails` (HTTP lane and the bundled Chromium, signed out) came back `success` with the final URL `github.com/login?return_to=…` and the title "Sign in to GitHub · GitHub"; the fixture's `/login` did too while it carried one line, "Sign in to your account to continue.", and became `login_wall` once that line was removed. `classifyGate` returns before its login-wall check when extraction found a main body (`packages/http-core/src/gate.ts`, `if (contentful) return wall`). Such pages get only the "answered … in place of" hint, never the L7 batch hint, and `loginWallsOf` does not pick them up.

## Limits

One person, one machine, one client and model, a fixture whose login page has no copy. The replies were scripted. r1 shows that a short list goes to `scrape`, where `loginWallsOf` does not apply. The saved-login route (`mode: "authed"`) and `hand_off_batch` were not run.
