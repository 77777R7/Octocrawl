# Privacy

This page covers the public Octocrawl page and its preview service. When you run Octocrawl on your own computer, none of it applies: requests, results and logs stay on your machine.

Last updated 29 October 2026.

## In short

This is the short version, and it leaves things out. The sections below are the full text, and they are what counts.

1. If you run Octocrawl on your own computer, none of this applies. Requests, results and logs stay on your machine.
2. The web preview does not save what you extract. The hosted API keeps a call's result for ten minutes, and a crawl or batch job keeps its pages for 7 days after it ends.
3. The preview logs the host of the site you asked for, never its path. An account's request history keeps the address you asked for, never the page's content. Both are deleted after 30 days.
4. A cookie counts your five previews a day. If your browser sends Do Not Track or Global Privacy Control, the page records no events and no preview outcomes.
5. Nothing is sold or shared for advertising, and the page loads no outside scripts, fonts, ads or trackers.
6. Cloudflare passes requests along, and the service runs on Google Cloud in Singapore. Anthropic gets a page's content only when an account turns on the json model fallback and the page's own data leaves a required field empty.
7. To delete your account, use Settings in your dashboard or email us. Most of your data goes at once; job files and logs expire on their own about 30 days on, and job files stay recoverable by us for 7 more days.

## What you submit

The address you paste is fetched by the preview service, and the result goes back to your browser. The service does not save the result: your recent runs live in the page and are gone when you leave it.

While you type, the page sends the address to `/api/capability` for the short note under the field. It goes in the body of the request, which the hosting provider's request log (see below) does not keep, so the log shows that a hint was asked for but not the address.

When the page opens, and after each preview, it asks `GET /api/quota` how many previews you have left today. That only reads your daily counter; it never counts a preview.

## What the page records

- **The visitor cookie, `w2l_visitor`.** A random identifier, signed by the service, kept for a year. It counts your five previews a day, and the same identifier (or, without the cookie, your IP address), hashed per day, is the pseudonym on page events and preview outcomes (below). It is not shared with anyone. A second cookie, `w2l_internal`, is set only when a page is opened with `?internal=1`; the operator uses it to mark their own browser, and `?internal=0` removes it. A third, `w2l_src`, is set by the first page you open here: the `utm_` and `from` tags on its address, the referring site's host (never its path), the page's path and the day. It stays in your browser for 90 days; if you make an account in that time, the service writes it on the account (below) and deletes the cookie. It is not set when your browser sends Do Not Track or Global Privacy Control.
- **A daily preview counter.** For each UTC day, a count of previews under a keyed hash of that day and your cookie (or, without the cookie, your IP address). Without the service's secret key, the hash cannot be turned back into either. These counters are kept in Google Cloud Firestore and expire one day after the day they count; Firestore then deletes them, usually within a day.
- **Page events.** The page tells its own service when it is opened and when you choose an example, change the output view, switch the Markdown between source and preview, copy or download a result, open Get code or copy code from it or from the docs, pick an MCP client in the docs, open or send the waitlist form, or follow a link. Each event names the page path, the referring site's host (never its path), any `utm_` or `from` tags on the address, the view or Markdown mode, Get code tab, client or waitlist entry point involved, and for a link, where it leads: its path on this site, or another site's host and path (never a query).
- **Preview outcomes.** For each preview: its state (for example `success` or `blocked`), the diagnostic code, the **host** of the page you asked for (never its path or query), whether you set options, and the server time.

Events and outcomes carry a pseudonym that changes every UTC day, so a visit can be counted but not followed from one day to the next, a flag for requests that look automated, and an internal flag when the `w2l_internal` cookie is present or the request comes from the browser built into the Claude desktop app (its user agent names `Claude/`), where the operator checks the site. Links taken from a page you extracted (its final address, its Markdown, its link list) are never logged. When your browser sends Do Not Track or Global Privacy Control, the page sends no events and the service logs no preview outcome; the cookie and the daily counter still work, since without them the five-a-day limit could not.

## The request log

Requests to octocrawl.dev first pass through Cloudflare, which forwards them to the service and passes on your IP address so your daily count is yours; Cloudflare handles them under its own privacy policy. The service runs on Google Cloud Run in Singapore. Google Cloud records each HTTP request: time, method, path and query, status, response time, your IP address, user agent and referring page. Events, outcomes and this request log are kept for 30 days and then deleted.

## What is never recorded

- The content of the pages you extract on the preview page, or the path and query of the address you submit through **Extract page**. The preview page never sends a page's content to a model. The hosted API is different (below): it keeps a call's result for ten minutes and a job's pages for 7 days after the job ends, and its json model fallback is the one case where page content goes to another company, and only when you ask for it.
- Anything from a third party: the page loads no outside scripts, fonts, ads or trackers, and its security policy allows connections to this site only.
- An account, unless you sign in (below). Without one, your email address is kept only if you join the waitlist.

Nothing here is sold or shared for advertising.

## Hosted API and MCP

Calls to `api.octocrawl.dev` and `mcp.octocrawl.dev` pass through Cloudflare and Google Cloud Run in Singapore as the page does, and the same request log applies (30 days). In addition the service records:

- **A daily counter** under a keyed hash of the UTC day and your address, or of your key, one for the calls from Claude's connectors together (they come from Anthropic's servers, so that counter holds no address of yours), and one for the whole service; without the service's secret the hash cannot be turned back into either. They are kept in Firestore and deleted two days on.
- **Your key's record**, if you have one: a hash of the key (never the key), the label you gave when you asked for it, its plan and allowance, and when it was issued.
- **Usage lines** in the service's logs, kept 30 days: for each call without a key, the first 16 characters of a keyed hash of your address, or that the call came from Claude's connectors, with the kind of call and the day. Without the service's secret the hash cannot be turned back into your address, and it is the same on every day, so it shows on which days one address used the service. When an MCP client connects, the line names the endpoint, whether the connection is keyless, uses a key or signed in, and the name and version the client gives (for example `claude-code` and `2.1.301`).
- **The result of each call** for ten minutes, so that `GET /v1/scrapes/:id` can return it, then deleted with any file it read. The page you asked for is not kept for reuse by anyone else.
- **The json model fallback, only when you ask for it.** When a scrape, or a page of a crawl or batch job, made with an account's key or connection asks for `modelFallback: true`, and the page's own data leaves a required field of your json empty, the service sends Anthropic's API, under Octocrawl's own Anthropic account and key: the page's Markdown as your request selected it (its main content unless you set `onlyMainContent: false`, `includeTags` or `excludeTags`), the schema you sent, your `prompt` if you gave one, and the values already read from the page (which include the page's address when your schema asks for it). Anthropic's model, Claude Haiku 5.5, answers with the missing values, and the service keeps only those the page states. Nothing is sent when `modelFallback` is off, when the page's own data completes the json, for a call without an account, or while the service's switch or daily budget keeps the model from being called. Your key, your account id, your email address and your IP address are not sent. Anthropic handles the request under its [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms), which say "Anthropic may not train models on Customer Content from Services." Its Privacy Center says that for API users it deletes inputs and outputs "within 30 days of receipt or generation", with exceptions it lists, among them a longer time where it needs it to enforce its Usage Policy (up to 2 years for inputs and outputs its automated systems flag) and where the law requires ([How long do you store my organization's data?](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), [Is my data used for model training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), both read 24 October 2026). The model's answer is part of the call's result, kept as the result is (above, and below for jobs). The service's logs record that a call was made, its tokens and its price in US dollars, never the content, the schema, the prompt or the answer.
- **Crawl and batch jobs**, which only an account can start. The job's record is kept in Firestore in Singapore: what you asked for, its status, page counts and credits, and the webhook you gave, if any (its address, events, labels, signing secret, and how its delivery went). The pages the job read and its export are kept in Google Cloud Storage in Singapore. The pages and the export are deleted 7 days after the job ends, and the record 30 days after that. A job that never ends is deleted 30 days after it started. Cloud Storage keeps a deleted file recoverable by us for 7 more days, then it is gone. If you gave a webhook, the service sends the job's end to that address: its status report (counts and credits used), the labels you gave, and why it failed if it did.

The request log carries the path of the call and, for a scrape, the address you asked for is in its body, which the log does not record. A call made with an account's key is also listed for that account, as **Accounts** below says.

## Accounts

Signing in is optional. You can sign in with GitHub, with Google, or with a link sent to your email address.

**Firebase Authentication.** The sign-in itself is done by Firebase Authentication, a Google service, on this site's Google Cloud project, under Google's privacy policy. Firebase keeps:

- your email address;
- the name and profile photo address that GitHub or Google gives;
- which way you signed in, and that service's id for you;
- when you signed in.

A sign-in link is sent by Firebase. GitHub and Google show you what they share before you agree. We ask GitHub for your email addresses, which also gives your public profile, and Google for your email address and basic profile.

**This service.** The service keeps these in Google Cloud Firestore in Singapore:

- **Your account:** your email address, when you first and last signed in, and which ways you signed in. When the sign-in makes the account, also how your browser first reached the site, from the `w2l_src` cookie (above), and whether the sign-in was for an MCP client. Nothing is written when your browser sends Do Not Track or Global Privacy Control.
- **A session for each sign-in:** a keyed hash of the session's id (never the id), your account, your email address and when it ends. It is deleted 30 days on, or when you sign out.
- **Your credits:** this month's balance, and for each UTC day the number of calls by kind and the credits they cost. Daily counts are deleted after 90 days.
- **Your requests:** for each call made with one of your keys or in your dashboard's Playground, a line with the address you asked for and the one finally read, when, which key (or the Playground), the formats a scrape asked for, the result (status, HTTP status, robots.txt decision, the reading route), how long the call took and the SHA-256 of what was read, with the credits it cost and, when the scrape asked for the json model fallback, the credits the model's part cost. Never the page's content. They are listed on your dashboard's Activity page, which only you can open, and each one is deleted 30 days after the call.
- **Your API keys:** for each key, a hash (never the key), the name you gave it, its first seven characters and when it was made. Revoking a key stops it, and the record stays so your keys page can show it.

**Cookies.** A sign-in sets `w2l_session`, which holds the session's id. Your browser keeps it for 30 days, and scripts on the page cannot read it. It also sets `w2l_account=1`, which tells the page to show **Dashboard** in place of **Sign in**. While you sign in, two short cookies hold the sign-in's state: one for 10 minutes and one for an hour. If you sign in with GitHub or Google using an email address that already has an account, a third cookie keeps that provider's sign-in for 30 minutes, encrypted. When you then sign in the way you did before, the provider is added to your account and the cookie is deleted. Starting to delete your account sets `w2l_delete` for 10 minutes: it names the account to delete when you sign in again, and is removed then, or when you sign out.

**Logs.** The service's own log lines say that a sign-in happened, the way it happened and whether it worked, without your email address. When a sign-in makes an account, a line also gives a short name for how the browser first reached the site (the `utm_source`, the referring host, the `from` tag, or that it was for an MCP client), without the account. The request log (above, 30 days) keeps each request's path and query, so it holds the one-time code a sign-in carried back. Such a code works once and expires within an hour. For an account's key, the hosted API logs one line per call with the account's id, the kind of call and the credits it cost.

**Deleting your account.** In your dashboard, Settings → Delete account: type the account's email address, then sign in once more the way you usually do. As soon as you are signed in, the service deletes your keys (they stop working within a minute), your credits, your daily usage, your request lines, your hosted jobs' records, your account record and its sessions, and then your Firebase account. The pages and exports your jobs kept are not deleted at that moment: the storage's own expiry deletes them about 30 days after they were written, and they stay recoverable by us for 7 days after that. Service logs that name the account's id are deleted with the rest of the logs, 30 days on. If the deletion stops part way, sign in and delete again to finish it. If you used some of this month's free credits, the service keeps a keyed hash of your email address (not the address), the month and how many free credits were left, until the month ends (Firestore deletes it within about a day after); an account made again with the same address this month starts with what was left instead of a new grant, and the record is then deleted. You can also email [hello@octocrawl.dev](mailto:hello@octocrawl.dev) from the account's address and we delete it for you.

## Waitlist

If you ask for a key, the service stores your email address, and the answers you chose to give: what you do, what you would need, and what you would collect. It also stores which link you joined from (after your daily previews ran out, the home page footer or the Limits page), the site that sent you to this page (its host, never its path), and the date. Your cookie, IP address and previews are not stored with it, and joining again with the same address replaces your earlier answers.

The list is kept in Google Cloud Firestore in Singapore and used only to write to you about a hosted Octocrawl key and, at most once, to ask how it went. Every email from it says how to leave. An entry is deleted 12 months after we have written to you about a key, or 12 months after you joined, whichever comes first. To be removed sooner, or to see what we hold, email [hello@octocrawl.dev](mailto:hello@octocrawl.dev) from that address.

Joining is something you ask for, so it works when your browser sends Do Not Track or Global Privacy Control; the page then sends no event about it.

## Questions

This site is run by Howard Lun. For a question or request about your data, email [hello@octocrawl.dev](mailto:hello@octocrawl.dev); other ways to reach us are on [Contact](/docs/contact/).
