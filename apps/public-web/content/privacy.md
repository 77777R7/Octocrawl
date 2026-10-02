# Privacy

This page covers the public Octocrawl page and its preview service. When you run Octocrawl on your own computer, none of it applies: requests, results and logs stay on your machine.

Last updated 2 October 2026.

## What you submit

The address you paste is fetched by the preview service, and the result goes back to your browser. The service does not save the result: your recent runs live in the page and are gone when you leave it.

While you type, the page sends the address to `/api/capability` for the short note under the field. It goes in the body of the request, which the hosting provider's request log (see below) does not keep, so the log shows that a hint was asked for but not the address.

When the page opens, and after each preview, it asks `GET /api/quota` how many previews you have left today. That only reads your daily counter; it never counts a preview.

## What the page records

- **One cookie, `w2l_visitor`.** A random identifier, signed by the service, kept for a year. It counts your three previews a day, and the same identifier (or, without the cookie, your IP address), hashed per day, is the pseudonym on page events and preview outcomes (below). It is not shared with anyone.
- **A daily preview counter.** For each UTC day, a count of previews under a keyed hash of that day and your cookie (or, without the cookie, your IP address). Without the service's secret key, the hash cannot be turned back into either. These counters are kept in Google Cloud Firestore and expire one day after the day they count; Firestore then deletes them, usually within a day.
- **Page events.** The page tells its own service when it is opened and when you choose an example, switch a tab under Recorded results or Run it yourself, change the output view, copy or download a result, open Get code or copy code from it, from Run it yourself or from the docs, pick an MCP client in the docs, or follow a link. Each event names the page path, the referring site's host (never its path), any `utm_` tags on the address, the view, tab or client involved, and for a link, where it leads: its path on this site, or another site's host and path (never a query).
- **Preview outcomes.** For each preview: its state (for example `success` or `blocked`), the diagnostic code, the **host** of the page you asked for (never its path or query), whether you set options, and the server time.

Events and outcomes carry a pseudonym that changes every UTC day, so a visit can be counted but not followed from one day to the next, and a flag for requests that look automated. Links taken from a page you extracted (its final address, its Markdown, its link list) are never logged. When your browser sends Do Not Track or Global Privacy Control, the page sends no events and the service logs no preview outcome; the cookie and the daily counter still work, since without them the three-a-day limit could not.

## The request log

Requests to octocrawl.dev first pass through Cloudflare, which forwards them to the service and passes on your IP address so your daily count is yours; Cloudflare handles them under its own privacy policy. The service runs on Google Cloud Run in Singapore. Google Cloud records each HTTP request: time, method, path and query, status, response time, your IP address, user agent and referring page. Events, outcomes and this request log are kept for 30 days and then deleted.

## What is never recorded

- The content of the pages you extract, or the path and query of the address you submit through **Extract page**.
- Anything from a third party: the page loads no outside scripts, fonts, ads or trackers, and its security policy allows connections to this site only.
- Your email address or any account: there is none to create.

Nothing here is sold or shared for advertising.

## Questions

Open an issue on [GitHub](https://github.com/77777R7/w2l/issues).
