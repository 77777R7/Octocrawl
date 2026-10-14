# T001: does the challenge wait give up too early? 2026-10-15 (no)

Label: `library_probe`. From the evening of 2026-10-14, T001 failed every run on the Clash exit in the same way ([CDP-session record](2026-10-14-installed-chrome-cdp-session-aca819b8.md)). T001 is studylib.net's page for Google's 2025 environmental report.

The failure went like this: the installed_chrome rung's challenge wait ended `cleared` after 2–3 s, and the answer was then a 403 asking the visitor to "verify you are human", judged `bot_detected_generic`. The open question was whether the wait gave up on a page that would clear if waited on.

## How it was run

- **Script:** `research/access/challenge-watch.mts` (added in this PR). It opens one URL in the installed Chrome, with the narrowed launch on the Clash exit, and reads the page once a second.
- **What each read records:**
  - the main document's status and `cf-mitigated` header;
  - the title, the HTML's length, and whether Cloudflare's Turnstile widget is on the page;
  - the gate classifier's verdict two ways: decisive evidence only, as the challenge wait judges, and in full, as the answer is judged.
- **The page is never clicked or typed into.** The last HTML read is saved.
- **Runs:** two, around 01:40 on 2026-10-15 (UTC+8), on main `e8b75c97`. One watched 60 s, the other 20 s.
- **Raw outputs:** `.w2l/access/archive/2026-10-15/t001-watch`, outside the repository.

## What the page did (the 60 s run)

| From | Document | `cf-mitigated` | Title | Turnstile | Wait's verdict | Answer's verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1.2 s | 307, then 403 | `challenge` | "Just a moment..." | yes | `cloudflare_challenge` | `cloudflare_challenge` |
| 4.2 s, to the end at 61.6 s | 403 | none | "Security Check" (3.6 KB) | no | none | `bot_detected_generic` |

- **The 20 s run ended on the same "Security Check" page.** Its text reads: "Please Verify You Are Human. We have detected unusual traffic from your network. Please complete the security check to continue." It loads `studylib.net/captcha/assets/widget.js`, the site's own captcha widget. There is no form or button in the HTML before the widget runs.

## What this shows

- **The wait does not give up early.**
  - Cloudflare's managed challenge did clear, in about 4 s, as the wait said.
  - What followed is a second check of the site's own, a captcha for a person, which stayed unchanged for nearly a minute.
  - Waiting on would not have let T001 through. Octocrawl does not solve captchas (ADR 0005), so this is where an unattended read ends.
- **Why T001 passed every run on the afternoon of 2026-10-14, and none from that evening:** the site asks for the captcha when it sees "unusual traffic from your network", so its view of the Clash exit is the likely cause. That is not shown here.
- **One thing could be judged better.** The page is judged `bot_detected_generic` from its text. It is a captcha a person can complete, so `captcha` would describe it more exactly, and a local server could then offer it to the person (handoff). That changes how the failure is named, not whether the task passes, and is left for later.

## Not shown

- Other exits or times.
- What the site's widget asks of a person.
