# Octocrawl: passwordless login and object verification classification

Date: 2026-10-15 (Asia/Shanghai). Baseline gate code: main `9884e66c7d8addb361c94930df4d299220e98439`, including #506. Fix: `ef43cb09d6509be036ffa1a04bdaf4f19590eab6`.

## What was actually observed

Two targeted diagnostic captures, separate from scheduled acceptance, reproduced the reported classification errors. AliExpress redirected to `/p/ug-login-page/login.html`, showed Register/Sign in, an actual username/webauthn input and a passkey button, but no password input. These controls appeared about 145k characters into the document, beyond the common classifier's 65,536-character head. Temu redirected to `/bgn_verification.html`, showed Security Verification, an object-count instruction, images and interactive controls; the instruction was beyond the scanned head. Both were failed/empty_unverified with readiness not_loaded, rather than named interactive gates.

A fresh development worktree's API used port 8797 for the baseline and 8798 for the fix. Both used the existing grant read-only, HTTPS_PROXY/HTTP_PROXY `http://127.0.0.1:7890` and loopback NO_PROXY. Actual exit IP and proxy cost were not measured. The baseline capture commit was `ffe8cb38` (API Markdown-delivery work, with gate code unchanged from 9884e66c); W2L_SOURCE_COMMIT named it. The post-fix API named ef43cb09. Neither changed the frozen e8b75c97 checkout, grant, script, task set or schedule.

With W2L_CAPTURE_RAW_DIR set in the respective worktree, the targeted driver was:

```sh
NO_PROXY=localhost,127.0.0.1,::1 W2L_API_URL=http://127.0.0.1:8798 node research/access/run-set.mjs --set all --only T030,T031 --access '"enhanced"' --raw-html --save-responses --request '{"timeout":60000,"debug":true,"formats":["markdown","html","rawHtml"]}'
```

The baseline used the same driver at port 8797. No original task predicates were changed.

## Isolated replay and live result

Replay of the same original HTML and observed final URL gives null on the baseline classifier and login_wall/captcha after the fix. The shared page handler then reports blocked and readiness not_served. Original capture hashes:

- T030: `43b4e6a1bc3d7bf3a75227eeb1a05fcafeb53b47885865175abe876bcb169f19`.
- T031: `336beb35c467fe3ae4552c5dc67de564a388bd3e7599fb415ae4e0702d70ef2b`.

A fresh live diagnostic after the fix produced:

| Task | Fetch verdict | Readiness | Task verified | False success |
| --- | --- | --- | --- | --- |
| T030 | blocked / login_wall | not_served | No | No |
| T031 | blocked / captcha | not_served | No | No |

Both before and after remain 0/2 verified, false success 0. This is classification improvement on two observed pages, not two newly completed tasks, a population accuracy estimate or a latency improvement. Existing region/challenge waits still occurred; no login, click, captcha answer or human assistance was performed.

Post-fix capture witnesses (local raw data is intentionally not committed):

- T030-cold: 2026-10-15T05:27:25.125Z, raw SHA-256 `40f1bc71500e2f83f6f480ad0dff34b1027cdfd22f82fbcb91c336f6158a85a1`.
- T031-cold: 2026-10-15T05:27:56.360Z, raw SHA-256 `9616a69a52b78a9bf09567070edafe1b353cacf3c9ae3a7786c83da924256a3d`.

Raw originals and responses stay in the verification-scope worktree under `.w2l/verification-scope/classification-captures/` and `.w2l/access/runs/`. Post-fix responses/captures stay in this worktree under `.w2l/access/runs/` and `.w2l/interactive-gates/`; replay.json and post-fix-manifest.json preserve the paths and witnesses. No raw page, puzzle image, login state or page token is committed. The own APIs were stopped afterwards; 8787 was not used.

## Implementation and validation

- No host or benchmark ID is matched in production. The final URL's purpose, the primary heading and actual WebAuthn/passkey or image/control structure must agree. Unknown final URL, isolated signals, scripts and escaped controls are not sufficient.
- The added scan stops above 1,000,000 HTML characters or 4,000 visible-text characters and keeps the existing contentful-page boundary. It reuses the existing linear text scanner and retains #506's rule.
- Two positive regression cases fail on main; negative controls include articles, missing controls/URL purpose, script/escaped examples, contentful pages and oversized input.
- Redirect integration confirms that HTTP uses the observed final document URL, not its requested entry URL, and that readiness is not_served. All four lane families now supply finalUrl.
- Typecheck passes. Focused checks: 121 tests pass; existing gate performance tests also pass.
- Full offline suite: 236 files / 2,876 tests passed (499.89 seconds), log `.w2l/interactive-gates/npm-test.log`.
- Generic OAuth-only login, other puzzle shapes, larger pages and failures to capture target content remain outside the new rule's demonstrated coverage. No task-coverage or frozen-acceptance gain is claimed.
