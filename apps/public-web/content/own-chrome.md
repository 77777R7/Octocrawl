# Use your own Chrome

Some pages show their data only to you: your GitHub notifications, an account page, a list behind a sign-in. Octocrawl can read them in the Chrome you already use, on your own computer, signed in as you. In your Chrome it never clicks, types or gets through a check for you. When a page needs you, you take that step yourself.

There are three ways to do it. All run on your computer with `npx octocrawl` 0.3.2 or later; hosted Octocrawl refuses them.

| Way | Use it when | What Octocrawl does |
| --- | --- | --- |
| `--lane my-browser` | The page needs your login, your address or a real browser. | Opens the page in a new tab of your Chrome and reads it as it shows. Nothing is copied out of Chrome. |
| `--handoff` | Octocrawl's own fetch stopped at a captcha, a challenge or a login wall. | Opens the stopped page in your Chrome, waits for you to get through, then reads it. |
| `login import`, then `--mode authed` | You want unattended runs on one site. | Copies that site's cookies from your Chrome into Octocrawl's own browser. |

## Before you start

You need Google Chrome 144 or later, signed in to your sites in its default profile and a normal window, and Node.js 22.13 or later. Octocrawl reaches the default profile only.

Open `chrome://inspect/#remote-debugging` and turn on **Allow remote debugging for this browser instance**. Turn it off again when you are done: while it is on, every page sees `navigator.webdriver` as `true`, and a site whose bot check looks at it may refuse your Chrome.

## Read a page signed in as you

```bash
npx octocrawl scrape https://github.com/notifications --lane my-browser --formats markdown
```

1. Chrome asks **Allow remote debugging?** Click **Allow**. Chrome asks again on every new connection.
2. Octocrawl opens a page of its own in a new tab, listing the sites it will read (here `github.com`). Click **Allow reading these sites**. Only a click Chrome counts as yours allows them; a script cannot. You have 10 minutes, and the tab may open behind the one you are on or in another window.
3. Octocrawl opens the URL in another new tab, reads it once it has loaded, shows no check and stays on that host, then closes the tab. Closing Octocrawl's page, or clicking **Revoke** there, stops all reading.

The same lane is `"lane": "my-browser"` (or `"access": "my-browser"`) on `POST /v1/scrape` and `POST /v1/batches` of `npx octocrawl serve`, on the MCP `scrape` and `batch_scrape` tools of the local server, and on the TypeScript SDK's `scrape` and `batchScrape`. A batch reads its pages one at a time, and you allow all its sites once for the run.

## Expected output

On 2026-10-09 at 15:34 UTC, on macOS with Chrome 154, the command above read the notifications page in 9 seconds. Fetched without a login, the same URL answers 302 and leads to `github.com/login`. The Markdown is left out here, since it is the account's own notifications:

```json
{
  "status": "success",
  "lane": "my_browser",
  "finalUrl": "https://github.com/notifications",
  "metadata": { "title": "Notifications", "statusCode": 200 },
  "usage": { "requestCount": 0, "browserMs": 4038 },
  "evidenceRecord": {
    "lane": "my_browser",
    "httpStatus": 200,
    "robotsDecision": null,
    "access": {
      "route": "user_browser",
      "executor": "Chrome/154.0.8037.98",
      "completion": "user_browser"
    }
  }
}
```

- **`requestCount: 0`**: Octocrawl sent no request of its own. Your Chrome loaded the page, so there is no robots.txt decision either.
- **`access.executor`** is the browser that read the page.
- **`access.completion`** says how a page was reached: `user_browser` (your Chrome, with no step of yours), `handed_to_person` (your Chrome, after you got through a check), `authorized_session` (a saved login) or `unattended` (Octocrawl's own fetch).

The first run that day returned nothing. Nobody clicked **Allow reading these sites** within 10 minutes, so the command exited 1 with `you did not allow the sites in Chrome within 10 minutes`. The second run, allowed at once, is the one above.

## When a page stops at a check

```bash
npx octocrawl scrape https://example.com/page --handoff
```

Octocrawl first reads the page as usual. If a captcha, a challenge or a login wall stops it, the page opens in a new tab of your Chrome. You get through it there, and Octocrawl reads the page once you have clicked or typed in that tab and the check is gone. Nothing the page does by itself counts, such as a reload or a check that passes on its own.

It waits 10 minutes per page by default; set `"handoff": { "waitMs": 60000 }` on the API, from 10 seconds to 30 minutes. For a batch, run `octocrawl batch <urls> --handoff`, call `POST /v1/batches/:id/handoff`, or use the local MCP tool `hand_off_batch` after it finishes: its stopped pages open one at a time.

## Save a login for unattended runs

```bash
npx octocrawl login import example.com
npx octocrawl scrape https://example.com/account --mode authed
```

`login import` copies one site's cookies from your Chrome's default profile, plus the `localStorage` of its tabs that are open. Octocrawl's own browser then uses them for `--mode authed` on `scrape` and `batch`; `crawl` refuses it, since following a sign-out link would end your session in Chrome too. The login is kept in `~/.w2l/sessions.json` (or `W2L_SESSIONS_FILE`), readable by you alone but not encrypted. `npx octocrawl login list` shows it and `npx octocrawl login remove example.com` deletes it. A site that ties its login to more than cookies answers as if you were signed out.

## What Octocrawl never does

- In your Chrome it never clicks or types, and it never solves a captcha or a check. (Page `actions` you ask for run in Octocrawl's own browser, including with `--mode authed`.)
- It does not read a page while it shows a password or one-time-code field, or while you are changing a form field.
- With the lane and the handoff, it opens tabs of its own, touches no others, and closes them when done. `login import` reads the storage of the site's tabs you have open and changes nothing in them.
- With the lane and the handoff, it reads the page and copies no cookies out of Chrome. Only `login import` copies a site's cookies, and only that site's.
- It is not a way past bot checks. A site that refuses automated visitors may refuse your Chrome too while remote debugging is on.

## If it does not finish

- **`you did not allow the sites in Chrome within 10 minutes`**: find Octocrawl's tab in Chrome, which may be in another window, and run the command again.
- **`blocked`**, with `blockReason` such as `captcha` or `login_wall`: the check was still showing when the wait ended.
- **`cancelled`**: you revoked the sites, closed Octocrawl's page, or the command was stopped.
- **Chrome could not be reached** (remote debugging off, or **Allow** not clicked). On the lane, a scrape stops with an error that says so (HTTP 409 from the API), and in a batch every page is `failed` with `connection_error`. With `--handoff`, a page keeps the result that stopped it, with a `handoff_not_through` warning, and handing a batch over answers 409.
- **`failed`** on a page: `connection_error` means Chrome refused a command, `redirect_limit` that the site kept leading the tab elsewhere, and `timeout` that the wait ran out.
- A page that was not read carries a `my_browser_not_read` warning (with `--handoff`, `handoff_not_through`) that says why.

This page reflects runs on macOS with Chrome 154. Windows and Linux have not been checked yet. See [Connect MCP](/docs/connect-mcp/#run-it-on-your-computer) to run the local server, and [limits and result states](/docs/limits/) for what each status means.
