# W2L public preview

The first-use page accepts one public HTTP(S) URL and shows readable content, the final URL, the result state, and elapsed time; for an ordinary page it also shows the page's links and metadata, and up to 20 fields the visitor names, read from the page without a model. Amazon.sg `/dp/{ASIN}` pages also show a fixed product record. It exposes a price only when the selected ASIN, Singapore delivery context, and SGD currency can be verified; otherwise the product record is marked incomplete with explicit issues. Crawl, batches, and Monitor remain separate authenticated/persistent workflows.

The same static build includes an English `/docs/` site generated from
`apps/public-web/content/`. It links the first page trial to the locally
verified Codex MCP path and separates that from the hosted login and MCP URL, which the roadmap has paused
([ROADMAP.md](../ROADMAP.md#paused)). The docs use the Hero's language on a quieter reading area: its mountain artwork in the header, dotted rules, numbered sections with an "On this page" list that marks the section being read, ledger tables, and code blocks drawn as session sheets with numbered lines (copying takes the code alone).

The Hero fills the first screen (`100svh`; it grows only when its content needs more room) over the static mountain artwork. On screens at least 760 px tall, a small *See what comes back* link at its foot points to the recorded results, and to *Recent runs* after a first extraction. The help line under the URL card shows the visitor's previews left today from `GET /api/quota` (read-only and never cached while previews remain, since a preview on the other instance may have used one; a used-up day is cached until 00:00 UTC; at most 120 lookups, two Firestore document reads each, a minute per instance); when the count cannot be read it keeps the static text.

The octopus lies behind the centered headline, a little larger than the text, with its eyes in the gap between the headline and the description. It uses the [React Bits ASCIIText JS-CSS component](https://reactbits.dev/text-animations/ascii-text). The untouched registry source is vendored at `apps/public-web/src/reactbits/ASCIIText.registry.jsx` (SHA-256 `5188e633807ed6f3d55ee9ed3c48f87e9eb7cc185b31d7d8d5d16f895b3fae72`); the adjacent `ASCIIText.jsx` adapts it for this page by removing remote font loading, pausing offscreen, and moving glyphs away from a stationary pointer. In motif mode it writes the octopus in plain marks from the artwork's own glyph family (dots, colons, `+`, `x`, `X`) in the source's colours, each re-rolled every one to three seconds, over a feathered backdrop blur. Its ink is quieter behind the headline and description, so they stay legible.

The octopus starts up once per page view. Until the live octopus draws, the static one waits dimmer (26% instead of 42%). A warm ripple then decodes the octopus from its centre to its arm tips, leaving it dormant behind the ripple: half its ink, a band lighter, eyes shut. About 1.1 s after its first frame the octopus lights up all but at once, from its body out to its arm tips within about 30 ms, in its own light (its blue lifts to ice white, its warm rim to cream; warm light is kept for what it receives): its glyphs grow a band heavier, its eyes open and catch the light, and the glow dies away in about half a second in the body and just under a second at the arm tips, which let go last. Behind the page's text the glow keeps to 19% of its strength, so the glyphs there take the first level of light at most. An octopus that comes back after scrolling arrives awake. If the live octopus has not drawn within 8 s (a slow network), the static one comes back up to its own opacity meanwhile.

While a preview is extracted the octopus takes the link: it comes back to full ink within a quarter of a second, and the ground its arms reach into darkens. Its two lowest arms, which already reach behind the URL card (`data-reach`), lift a little, plunge behind the card's edge, grip (their tips curl inwards and the glyphs just above the edge turn hot) and draw back while a warm packet climbs each arm along its own curl to the eyes. For as long as the request runs the arms haul hand over hand, one and then the other, quieter, no two rounds quite alike and slower after 12 s. An octopus that arrives while a request is under way goes straight to the haul. The page scrolls to the result as soon as it comes, so the ending starts at once and is over within 0.3 s: when the page was read the octopus brightens for a moment and its eyes catch the light; either way its arms let go within 0.2 s, and when it was not read the octopus blinks. A result that comes before the arms have lifted ends the take unseen. Nothing is drawn over the card, and the form's own message reports the outcome.

Around it, `apps/public-web/src/heroGlyphs.ts` brings the artwork's own glyphs to life. It finds the painted glyphs once per page load, in a worker off the main thread, and draws only those that light up, over their painted twins. Light drifts through the sunset clouds. On the mountain in the lower right, embers twinkle and a band of alpenglow rises in crimson, gold and orange. Every so often light climbs the mountain to its summit, and the octopus answers: it blinks, its eyes catch the light, and a warm ripple runs through its glyphs. In the valleys of the blue ranges on the left lies a sea of clouds (`apps/public-web/src/heroFog.ts`): each valley's fog lies level in front of the range behind it and is cut off by the nearer ridge, traced from the artwork step for step. It is thickest just above that ridge and fades out over a few cells at its top, which rises and falls a little as slow waves pass along it, and the painted marks inside it are lit in pale fog light. Every 15–25 s the fog just right of the dip in the nearer ridge left of the URL card wells up and spills two or three cells down the ridge's face, then drains away. Now and then an ember in the mountain's dark right flank lets a spark go at the height of its twinkle (`apps/public-web/src/heroEmbers.ts`): it hops up from glyph to glyph for three to eight cells, cooling from white-gold to crimson, and goes out; embers near it hold still, and none leaves while the alpenglow passes over it or light climbs to the summit. The ridges, the fog's marks and the embers that may let sparks go are worked out in the same worker as the glyphs. At rest it draws nothing, so the artwork shows as painted, and the page's text and the octopus keep calm ground behind them.

A click answers in the same glyphs (`apps/public-web/src/heroClick.ts`): a small diamond of cells lights from the pointer out, each running down the artwork's density ramp (X, x, +, :, ·) in navy-edged orange, gone in about 0.4 s, drawn above the form so a click on a button reads too. The artwork's glyphs answer with a ring of cool light that spreads from the click and fades within 0.9 s. It is for mouse and trackpad, never with reduced motion.

Above them, `apps/public-web/src/heroSky.ts` draws the night sky on the same canvas. It is densest in the dark upper left, where the painting has almost no stars of its own, and thins out towards the sunset. Stars twinkle and scintillate, some written in the artwork's own marks, and one flares somewhere every half-second or so. A meteor crosses every 5–12 s, sometimes followed by a second. Nothing in the sky is drawn over the page's text, the sunset clouds or the mountain.

Both animate only on screens 1050 px and wider with a fine pointer, motion allowed and WebGL 2. The glyphs and the sky enter when the octopus lights up: they appear inside a circle that spreads from the octopus to the Hero's corners, and everything is alive about 4 s after the octopus first draws; a Hero that comes back later relights in about half the time. A device too slow for them gives them up at once, so the octopus keeps priority. They loop for as long as the Hero is on screen, with no pause control; the system's reduced-motion setting keeps the Hero still. They stop in hidden tabs and out of view and start over when the Hero returns. While the visitor types in the form, or while its Format, Options or Get code panel is open, the Hero yields (a button that merely keeps focus after a click does not hold it): the octopus dims and rests and the glyphs fade back to the painted artwork. While a preview runs the landscape still rests, and only the octopus moves. Otherwise (touch, reduced motion, no WebGL, or while the chunks load) the static octopus artwork shows in the same place, masked by `octopus-silhouette.webp`; narrower screens use one centered column with a faint static octopus. The form and extraction path depend on none of them. React, React DOM and the registry-listed Three.js dependency stay in a lazy decorative chunk; the glyph light, the sky, the sea of clouds and the sparks are a separate small lazy chunk.

While a preview runs, the URL card turns into a frameless navy window (`apps/public-web/src/crawlView.ts`, model in `crawlModel.ts`). Opening takes about 0.9 s while the request is already out: the white card dissolves into cells from the button outward, the address's letters turn into glyphs and drop, an orange scan line pushes the window open with the rows weaving in behind it while two glyph arms hook the card's lower corners and pull, and the letters land as the window's address line as the octopus peeks in. Closing takes 0.5 s: the scan line rises, the rows unweave, and the cells gather back into the white card. The address and Skip sit on the window's top line; its page is a silhouette drawn as a navy grid of glyphs, three windows tall: a navigation bar, a main column of a title, paragraphs and pictures, a sidebar on wide screens, and a footer. An octopus made of glyphs crawls it from the top while the page scrolls under it. It follows the stages the server reports (below), never ahead of them: it waits at the door until robots.txt lets it in and walks the silhouette while the page is fetched, and nothing dissolves until the result says the page was read. Then it drops to the foot within 1.5 s, the main content it passes dissolving into glyphs, and lands on the footer's rule with a thud: streaks trail it and it stretches as it drops, then it squashes flat with its eyes screwed shut (`> <`), the page jumps a row up and down a few times (by whole rows, so the cells stay put), a dome-shaped wave spreads from where it hit while the ground row flares both ways, dust rolls away along the ground, bits fly up and fall back, the ground keeps a dent, and the bar flashes white; the read page's own title and words settle into the title and paragraph lines, the chrome dims, and about 0.6 s later the window folds back into the card and the page moves to the result. A page that was not read keeps the octopus at the door, blinking, with the status and reason, for about 2 s. The foot shows an ASCII bar with one step for each reported stage and the result, the last thing the server said, and the time since the link was sent. Every cell keeps its place on the grid; only its glyph, brightness and colour change. Skip or Escape closes the window at once while the preview carries on, and *Always skip* keeps it closed on later runs in that browser. With reduced motion it never opens. The hero's own octopus stays where it is and dims while the window plays.

Below the Hero, How it works pairs three steps with a replay that shows them happening: `apps/public-web/src/sessionReplay.ts` types and streams two recorded runs (the documentation example and an Amazon.sg product) like an agent session, with values cited in `apps/public-web/src/sessionScript.ts`. The window is labelled as a replay, and each run shows one recorded capture and names the time it measured (server or client). `howReplay.ts` loads the player as the section nears the screen; it loops for as long as it is on screen in a visible tab, with no pause control. With reduced motion, and until the player loads, the window shows the first run's result as static text.

## Try it

Open the public HTTPS service URL, paste a page address, and choose **Extract page**. The Firecrawl Introduction example on the page is a public documentation smoke test. A blocked, partial, or timed-out result is displayed as such. The page makes no promise to access login walls or solve challenges. The page and `POST /api/preview` are on the same HTTPS origin; no local repository, MCP connection, or service key is needed by visitors.

The anonymous allowance is three attempts per browser visitor per UTC day and 100 attempts globally per UTC day. A signed, HttpOnly, SameSite=Lax cookie identifies a visitor; direct clients without that cookie use a conservative address-based fallback. The Firestore counters survive service restarts. An unavailable quota store denies preview requests. The web page and `/api/health` remain available when preview is disabled. For Amazon.sg, the public readable body is a short summary built from the checked subject record, so unrelated recommendation prices in the raw page are not shown as this product's content.

Amazon.sg browser requests also use one Firestore-backed origin lease across the two Cloud Run instances. It preserves spacing and observed Retry-After cooldown, and exhausted visitors are rejected by a read-only quota check before acquiring that lease. This coordination is specific to Amazon.sg; generic public HTTP pages still use per-request scheduling, so this release does not claim shared cross-instance pacing for every domain.

## How the preview identifies itself

The preview names Octocrawl to the sites it reads, so their owners can see it in their logs and address it in robots.txt. Every request it sends (robots.txt, the page, and every request of the Amazon.sg browser context) carries the standard-mode Chrome User-Agent followed by `OctoCrawl-Preview/1.0 (+https://octocrawl.dev)` (`PREVIEW_PRODUCT_TOKEN` in `packages/contracts/src/compliance.ts`). The client hints (`sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`) are unchanged and still describe the Chrome that sends the request: the Chrome 128 floor on the HTTP lane, the running Chromium's major in the browser. `capturePreview` turns this on with `buildChannels`' `previewProductToken` option; the local API, CLI and MCP leave it unset, so their standard mode still sends the plain Chrome User-Agent, and research mode keeps its own `w2l-research` identity. The HTTP lane's trace and the browser's compliance record carry the User-Agent as sent, token included.

robots.txt groups match by substring of the whole User-Agent, and the longest matching name wins (`matchRobotsGroup` in `packages/http-core/src/robots.ts`). A group for `octocrawl-preview`, or for `octocrawl`, therefore governs the preview in place of `*`; without one, `*` applies. The token was `W2L-Preview/1.0 (+https://github.com/77777R7/w2l)` until the product was renamed: a group naming `w2l-preview` or `w2l` no longer matches the preview (`w2l-research` and `w2l` still match research mode). A disallowed page is never requested and returns `blocked` with diagnostic `robots_disallowed`. The public docs give site owners the same instructions (`apps/public-web/content/limits.md`).

Amazon.sg receives the token too. How it treats the new User-Agent is unmeasured: after a deploy that changes the User-Agent, run one Amazon.sg product preview with the owner token and compare it with the previous revision's result before relying on the Amazon route.

## Request and response

`POST /api/preview` takes a JSON body of at most 8 KiB. Only `url` is required, and the page sends nothing else unless the visitor changes an option:

| Key | Accepted |
| --- | --- |
| `url` | One public HTTP(S) URL. |
| `onlyMainContent` | `true` (the default) or `false` to keep the whole page. |
| `formats` | 1 to 3 of `"markdown"`, `"links"` and `{"type": "json", "schema": …}`, each once. |

The schema is a flat object of 1 to 20 fields and at most 4096 bytes. Each field has one type besides an optional `null`: `string`, `number`, `integer`, `boolean`, or an `array` of one of those. A field may also have a `title` or `description` of at most 200 characters. Names use letters, digits, spaces, dots, dashes and underscores, up to 64 characters, and `__proto__`, `constructor` and `prototype` are refused. `required` may list the schema's own fields, and `additionalProperties` must be `true` or `false`. `$ref`, `pattern`, nested objects and combinators are refused. The engine's own request check then runs on the accepted formats. Any other key, including `prompt`, `modelFallback`, `waitFor`, `timeout`, `debug` and the bare `"json"` format, returns HTTP 400 with status `invalid_url` and diagnostic `invalid_options`, naming the parameter. So does any option on an Amazon.sg `/dp/{ASIN}` URL, which returns its checked product record. Options are checked before the private-address check and before quota, so a refused request spends no preview.

Fields are read by the engine's deterministic structured extraction with model fallback off and no model configuration, even when `W2L_EXTRACT_*` variables are set. Sources are JSON-LD, microdata, meta tags, table rows, definition lists and a PDF's `Label: value` lines. A field the page does not state is `null`, with an issue that gives the reason.

A readable ordinary page (`success` or `partial` from the generic adapter, not Amazon, X or Reddit) adds these to the response:

- **Links:** `links`, up to 500 deduplicated HTTP(S) links without credentials. Each link is at most 2048 characters and all of them together at most 256 KiB. `linksTotal` gives the number found.
- **Metadata:** `metadata`, with each value cut to 2048 characters.
- **Fields:** `json` when fields were asked for, in the order asked. It holds `status`, `data`, `schemaSha256`, `evidence` and `issues`, never model usage. When the data would pass 64 KiB, `data` is `null` with a `too_large` issue.

`formats` narrows what comes back. Markdown and links are returned only when listed; metadata always comes. A file adds `file`: its kind, content type, sizes, SHA-256, PDF page counts and warnings, never where it was saved. Markdown is cut at 1,000,000 characters, with `markdownTruncated: true`. The preview follows at most 3 redirects and reads pages of up to 2 MiB (4 MiB decompressed) and files of up to 5 MiB.

A client that sends `Accept: application/x-ndjson` hears the preview's stages as they happen: one JSON object per line, `{"type":"stage","stage":"started","ms":…}` once the capture begins, `{"type":"stage","stage":"robots","allowed":true|false,"ms":…}` when robots.txt was read (with `"unreachable":true` when it could not be, which stops the page like a refusal), `{"type":"stage","stage":"page","ms":…}` once the page's body was received and parsed (not that it was read: a challenge page or an empty shell is refused after it, and only the result says), and last `{"type":"result","http":<status>,"body":<the response above>}`. `ms` counts from the request's arrival. Only the HTTP lane reports `robots` and `page`, so an Amazon.sg product streams `started` and its result. The stream starts only when the capture does: a request answered before it (a refused option, no previews left, a private address) gets the plain JSON reply with its own HTTP status, as does any client that does not ask.

## Local integration

Run `npm ci`, then `npm run public:preview:local` to open `http://127.0.0.1:8798/`. Set `W2L_AMAZON_PUBLIC_STATE_FILE` to a validated, anonymous Singapore preference state to try Amazon.sg locally. This review server binds loopback and uses in-memory daily limits and Amazon spacing; **its counters and coordination reset on restart**, so it must not be exposed publicly. The production CLI intentionally requires Firestore configuration. Keep `W2L_CAPTURE_RAW_DIR` unset. The public service never starts the Monitor or Delivery workers and does not persist crawl state or captured HTML.

For a local network where Reddit or X is unreachable directly, the review launcher can reuse an unauthenticated loopback HTTP proxy from `HTTPS_PROXY` (or the explicit `W2L_PUBLIC_PREVIEW_PROXY_URL`). Only fixed Reddit/X HTTPS hosts use it; all other visitor URLs retain the DNS-pinned direct path. Their current robots rules deny generic crawling, so the default still reports a policy block. For an **explicit local-only** public-page experiment, run `W2L_PUBLIC_PREVIEW_PLATFORM_EXCEPTION=true npm run public:preview:local`. This labels the exception in the HTTP trace and never changes the production launcher or other domains. It does not pass login walls or network verification challenges: a Reddit verification page is reported as blocked, never as post content. X post metadata is accepted only if canonical URL, `og:url`, author and text identify the requested status.

## Cloud Run deployment

Use a dedicated Google Cloud project with billing enabled. This deployment uses a request-based Cloud Run service in `asia-southeast1`, a Firestore Native `(default)` database for atomic quota counters, and Secret Manager for the anonymous Amazon preference state and server-only secrets. Cloud Run's free tier does not guarantee a zero bill: networking, builds, image storage, and other usage can be billed. Set a billing alert, but treat the application quota and instance limit as the primary controls. [Cloud Run pricing](https://cloud.google.com/run/pricing) · [Firestore free quota](https://firebase.google.com/docs/firestore/quotas) · [budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)

Before deployment, run the source build and tests and freeze a clean commit. The following is the owner deployment runbook, not a visitor installation procedure. Set the real project ID and authenticate the local Google Cloud CLI; signing in to another provider's dashboard does not authenticate `gcloud`.

```sh
export W2L_PROJECT_ID='YOUR_GOOGLE_CLOUD_PROJECT_ID'
export W2L_REGION='asia-southeast1'
export W2L_REPOSITORY='w2l-public-preview'
gcloud auth login
gcloud billing projects describe "$W2L_PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com --project="$W2L_PROJECT_ID"
```

Confirm that the billing response says the project is linked to an enabled billing account, and create a [budget alert](https://docs.cloud.google.com/billing/docs/how-to/budgets) before submitting a build. An alert is notification, **not a spend cap**. The Cloud Run maximum instance setting can also be exceeded briefly during traffic spikes, so neither setting guarantees a fixed maximum bill. [Cloud Run maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances)

Inspect the Firestore `(default)` database before creating it. Its location may already be fixed by the project and cannot be changed; the application requires the default database, not a newly named one. If it does not exist, create Native mode in Singapore:

```sh
gcloud firestore databases describe --database='(default)' --project="$W2L_PROJECT_ID"
# Only if the command above reports that the database does not exist:
gcloud firestore databases create --database='(default)' --location="$W2L_REGION" --type=firestore-native --project="$W2L_PROJECT_ID"
gcloud artifacts repositories create "$W2L_REPOSITORY" --repository-format=docker --location="$W2L_REGION" --description='W2L anonymous preview' --project="$W2L_PROJECT_ID"
gcloud iam service-accounts create w2l-preview --display-name='W2L public preview runtime' --project="$W2L_PROJECT_ID"
export W2L_RUNTIME_SA="w2l-preview@${W2L_PROJECT_ID}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$W2L_PROJECT_ID" --member="serviceAccount:${W2L_RUNTIME_SA}" --role='roles/datastore.user'
```

The repository and runtime service account creation commands are one-time operations; inspect existing resources before rerunning them. Grant the build identity Artifact Registry Writer **on this repository**:

```sh
export W2L_BUILD_SA_RESOURCE="$(gcloud builds get-default-service-account --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --format='value(serviceAccountEmail)')"
export W2L_BUILD_SA="${W2L_BUILD_SA_RESOURCE##*/}"
test -n "$W2L_BUILD_SA" || { echo 'Cloud Build default service account was not returned' >&2; exit 1; }
gcloud artifacts repositories add-iam-policy-binding "$W2L_REPOSITORY" --location="$W2L_REGION" --member="serviceAccount:${W2L_BUILD_SA}" --role='roles/artifactregistry.writer' --project="$W2L_PROJECT_ID"
```

Google Cloud projects may use either a Cloud Build or Compute Engine default service account, so do not assume its address. [Cloud Build default identity](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates) · [Firestore server IAM](https://docs.cloud.google.com/firestore/native/docs/security/iam)

Prepare a **fresh unsigned-in** Amazon.sg preference state with `scripts/section-c/ensure-amazon-sg-state.mjs --fresh-only` in `.w2l/`, verify its SHA-256, and upload that exact file as a Secret Manager version. The public release must never reuse an existing browser state: Amazon also puts session-named cookies in fresh anonymous sessions, so cookie names alone cannot prove that a saved state belongs to a signed-out user. The runtime checks scope and currency; the fresh isolated browser run supplies the unsigned-in provenance. The file must not be committed or included in the build context. Create independent random 32-byte-or-longer values for `W2L_QUOTA_HASH_KEY` and `W2L_EVAL_TOKEN` as separate secrets. The evaluation token is for owner-only acceptance testing; it is never served to browsers and bypasses public trial counters. Keep it private and rotate it if exposed.

```sh
umask 077
mkdir -p .w2l/public-preview
npm ci
npm run build:public
export W2L_AMAZON_PUBLIC_STATE_FILE="$PWD/.w2l/public-preview/amazon-state-$(date -u +%Y%m%dT%H%M%SZ).json"
node scripts/section-c/ensure-amazon-sg-state.mjs --fresh-only
shasum -a 256 "$W2L_AMAZON_PUBLIC_STATE_FILE"
openssl rand -hex 32 > .w2l/public-preview/quota-hash-key
openssl rand -hex 32 > .w2l/public-preview/eval-token
gcloud secrets create w2l-amazon-state --replication-policy=automatic --data-file="$W2L_AMAZON_PUBLIC_STATE_FILE" --project="$W2L_PROJECT_ID"
gcloud secrets create w2l-quota-hash-key --replication-policy=automatic --data-file=.w2l/public-preview/quota-hash-key --project="$W2L_PROJECT_ID"
gcloud secrets create w2l-eval-token --replication-policy=automatic --data-file=.w2l/public-preview/eval-token --project="$W2L_PROJECT_ID"
for secret in w2l-amazon-state w2l-quota-hash-key w2l-eval-token; do
  gcloud secrets add-iam-policy-binding "$secret" --member="serviceAccount:${W2L_RUNTIME_SA}" --role='roles/secretmanager.secretAccessor' --project="$W2L_PROJECT_ID"
done
```

If a secret already exists, add a new version with `gcloud secrets versions add SECRET --data-file=FILE` rather than recreating it. Avoid printing secret contents or passing them as command arguments. [Cloud Run secret mounts and environment references](https://docs.cloud.google.com/run/docs/configuring/services/secrets)

Build the Docker image in Cloud Build using `cloudbuild.public-preview.yaml`, then deploy it. Use the exact clean source SHA as the image tag; `.gcloudignore` keeps local state, tests, and unrelated project files out of the upload. The image contains Chromium but no Amazon preference state.

```sh
test -z "$(git status --porcelain)" || { echo 'Commit and verify a clean source tree before deployment' >&2; exit 1; }
export W2L_SOURCE_SHA="$(git rev-parse HEAD)"
export W2L_IMAGE="${W2L_REGION}-docker.pkg.dev/${W2L_PROJECT_ID}/${W2L_REPOSITORY}/public-preview:${W2L_SOURCE_SHA}"
gcloud builds submit . --config=cloudbuild.public-preview.yaml --region="$W2L_REGION" --timeout=20m --substitutions="_IMAGE=${W2L_IMAGE}" --project="$W2L_PROJECT_ID"
gcloud run deploy w2l-public-preview --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --service-account="$W2L_RUNTIME_SA" --allow-unauthenticated \
  --cpu=1 --memory=2Gi --concurrency=1 --min-instances=0 --max-instances=2 --timeout=60s \
  --set-env-vars="W2L_FIRESTORE_PROJECT_ID=${W2L_PROJECT_ID},W2L_AMAZON_PUBLIC_STATE_FILE=/var/secrets/amazon-state.json,W2L_PREVIEW_ENABLED=true,W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA},W2L_PUBLIC_ORIGIN=https://octocrawl.dev" \
  --update-secrets='/var/secrets/amazon-state.json=w2l-amazon-state:latest,W2L_QUOTA_HASH_KEY=w2l-quota-hash-key:latest,W2L_EVAL_TOKEN=w2l-eval-token:latest,W2L_PROXY_SECRET=w2l-proxy-secret:latest'
gcloud run services describe w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --format='value(status.url)'
```

That first deploy sets every variable. For a later release, deploy the new image with only `--update-env-vars=W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA}`: `--set-env-vars` replaces all variables, and losing `W2L_PUBLIC_ORIGIN` makes every preview on the domain fail its origin check.

The service routes traffic to tagged revisions, so a later `gcloud run deploy` creates a revision that serves nothing until traffic moves to it. Deploy without traffic, move all of it to the new revision under a new tag, and keep the previous tag as the rollback:

```sh
export W2L_REVISION_SUFFIX=landing   # names the revision w2l-public-preview-landing
export W2L_TAG=r17landing            # one tag per release; the previous tag stays as the rollback
gcloud run deploy w2l-public-preview --image="$W2L_IMAGE" --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --revision-suffix="$W2L_REVISION_SUFFIX" --no-traffic --update-env-vars="W2L_SOURCE_COMMIT=${W2L_SOURCE_SHA}"
gcloud run services update-traffic w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" \
  --to-revisions="w2l-public-preview-${W2L_REVISION_SUFFIX}=100" --update-tags="${W2L_TAG}=w2l-public-preview-${W2L_REVISION_SUFFIX}"
gcloud run services describe w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --format='yaml(status.traffic)'
```

Confirm that the new revision has `percent: 100`, and that `https://octocrawl.dev/` serves the new build. To roll back, run `update-traffic` with `--to-tags=<previous tag>=100`.

The `--allow-unauthenticated` flag is intentional for this limited, public trial. The Secret Manager grants are restricted to the dedicated runtime service account. Secret versions referenced as environment variables are resolved at instance startup; after rotating those secrets, deploy a new revision so every instance uses the new value. Verify the actual `/api/health` and preview behavior on the returned HTTPS URL before sharing it.

The initial Cloud Run settings are:

| Setting | Initial value |
| --- | --- |
| Region | `asia-southeast1` |
| CPU / memory | 1 vCPU / 2 GiB |
| Concurrency / instances | 1 per instance / min 0, max 2 |
| Request timeout | 60 seconds (preview deadline 40 seconds) |
| Access | Public HTTPS `*.run.app` |
| Environment | `W2L_FIRESTORE_PROJECT_ID`, `W2L_AMAZON_PUBLIC_STATE_FILE=/var/secrets/amazon-state.json`, `W2L_PREVIEW_ENABLED=true`, `W2L_SOURCE_COMMIT` |
| Secrets | Mount Amazon state at `/var/secrets/amazon-state.json`; expose quota hash key and evaluation token as server environment variables |

The image is built from `Dockerfile.public-preview` and includes Chromium. Do not deploy the archived `docs/archive/render.yaml` managed MCP service as this anonymous page: that service has durable Monitor/Delivery semantics and a different authentication policy. Cloud Run's local files are ephemeral, so they cannot back persistent tasks. [Cloud Run browser support](https://docs.cloud.google.com/run/docs/browser-automation) · [container filesystem](https://docs.cloud.google.com/run/docs/container-contract)

### Public domain

Pages, `robots.txt` and `sitemap.xml` carry the site's absolute address (canonical links, Open Graph cards, sitemap entries). The server writes it in at request time: the host the request reached by default, or `W2L_PUBLIC_ORIGIN` when set.

Cloud Run domain mapping is not available in `asia-southeast1`, and Cloudflare's free plan cannot rewrite the `Host` header, so the domain is served by the Worker in `cloudflare/public-preview-proxy/`. It answers on `octocrawl.dev` (and redirects `octocrawl.app` and `www.octocrawl.dev` there), forwards every request to the `run.app` URL, names the domain in `X-Forwarded-Host` and the visitor's address in `CF-Connecting-IP`, and proves it is the Worker with a secret header shared with the service (`PROXY_SECRET` in the Worker, `W2L_PROXY_SECRET` in Cloud Run). Without that proof the service drops both headers, so a client calling `run.app` directly can neither name the domain nor choose the address its quota is counted under. Behind the Worker, the last `X-Forwarded-For` entry is Cloudflare's own address, which is why the service needs `CF-Connecting-IP` at all.

1. Create the shared secret once, keep it under `.w2l/`, and store it in both places:

   ```sh
   openssl rand -hex 32 | tr -d '\n' > .w2l/public-preview/proxy-secret && chmod 600 .w2l/public-preview/proxy-secret
   gcloud secrets create w2l-proxy-secret --replication-policy=automatic --data-file=.w2l/public-preview/proxy-secret --project="$W2L_PROJECT_ID"
   gcloud secrets add-iam-policy-binding w2l-proxy-secret --member="serviceAccount:${W2L_RUNTIME_SA}" --role='roles/secretmanager.secretAccessor' --project="$W2L_PROJECT_ID"
   (cd cloudflare/public-preview-proxy && npx wrangler secret put PROXY_SECRET < ../../.w2l/public-preview/proxy-secret)
   ```

2. From `cloudflare/public-preview-proxy/`, after `npx wrangler login`, run `npx wrangler deploy`. The Worker attaches itself to the three hosts as custom domains; no DNS record for Cloud Run is needed. Pages load on the domain from here, but a preview there is refused until step 3, because the service does not yet know the domain.
3. Update the service: `--update-env-vars=W2L_PUBLIC_ORIGIN=https://octocrawl.dev --update-secrets=W2L_PROXY_SECRET=w2l-proxy-secret:latest`, then move traffic as for any deploy.
4. Check `https://octocrawl.dev/`, `/robots.txt`, `/sitemap.xml`, `/pricing` (404), a real extraction on the domain and `GET /api/quota` there, and that `https://octocrawl.app/` and `https://…run.app/` answer 301 to the domain.

With `W2L_PUBLIC_ORIGIN` set, page requests that did not come through the Worker (including direct `*.run.app` visits) get a 301 to the domain; `/api/*` and `/healthz` never redirect, so the release checks, the holdout scripts and the daily Amazon.sg check keep working against the `run.app` URL. The Worker's free tier allows 100,000 requests a day.

Mail for `hello@octocrawl.dev`, the address on the Contact, Privacy and Acceptable use pages, goes through Cloudflare Email Routing on the `octocrawl.dev` zone: the MX and SPF records are Cloudflare's, and one rule forwards that address to the operator's verified inbox. Change the destination with `cf email-routing rules update`, not on the pages. The domain sends no mail of its own.

### Search engines

The home page carries `WebSite`, `Organization` and `SoftwareApplication` structured data and every docs page `TechArticle` and `BreadcrumbList` (JSON-LD, absolute URLs written in from `W2L_PUBLIC_ORIGIN` like the rest). After a deploy that adds or changes pages, tell IndexNow engines (Bing and others) with `node scripts/public-preview/indexnow.mjs`; it submits the live sitemap and proves ownership with `/indexnow-key.txt`. Google reads the sitemap through Search Console, where `octocrawl.dev` is a domain property verified by a DNS TXT record.

### Refresh the Amazon.sg state

The anonymous Singapore state in `w2l-amazon-state` stops working after some days (the first one lasted from 2026-09-24 to at most 2026-10-02). Then every Amazon.sg product comes back `incomplete` with `region_unverified`, while ordinary pages still work. `.github/workflows/amazon-state-check.yml` previews two fixed products every day at 01:17 UTC and fails, with an email from GitHub, when neither comes back complete; run it by hand with `gh workflow run amazon-state-check.yml`. To refresh:

```sh
export W2L_AMAZON_PUBLIC_STATE_FILE="$PWD/.w2l/public-preview/amazon-state-$(date -u +%Y%m%dT%H%M%SZ).json"
node scripts/section-c/ensure-amazon-sg-state.mjs --fresh-only
gcloud secrets versions add w2l-amazon-state --data-file="$W2L_AMAZON_PUBLIC_STATE_FILE" --project="$W2L_PROJECT_ID"
gcloud run services update w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --revision-suffix="state$(date -u +%m%d)"
```

The service reads `latest` only when an instance starts, so the new revision is what picks the state up. Tag it, preview a product through the tag URL, then move traffic to it as in any deploy, and disable the previous secret version.

### Quota counter expiry

Each daily counter document in `publicPreviewQuotas` carries `expireAt`, one day after the UTC day it counts (`quotaExpiry` in `packages/public-preview/src/quota.ts`). Firestore deletes expired documents only once a TTL policy exists on that field, so create it once per project:

```sh
gcloud firestore fields ttls update expireAt --collection-group=publicPreviewQuotas --enable-ttl --project="$W2L_PROJECT_ID"
```

Counters written before `expireAt` was added have no expiry and stay until deleted by hand. Delete them once, right after the first deploy that writes `expireAt` (this also deletes today's counters, so visitors get their three previews back for the rest of the day):

```sh
gcloud firestore bulk-delete --collection-ids=publicPreviewQuotas --project="$W2L_PROJECT_ID"
```

Firestore usually removes an expired document within a day of its `expireAt`. The privacy page says counters expire, so both steps must be done before that page is deployed.

### Page events

The page sends first-party events to `POST /api/events` (same origin only; fixed event names and short properties). When the browser signals Do Not Track or Global Privacy Control, the page sends no events and the server logs neither events nor preview outcomes for that request. Each is one stdout line with `event: "w2l_web_event"`. Every anonymous `/api/preview` answer also logs one `event: "w2l_preview"` line with its state, diagnostic code, the target's host (never its path or query), whether options were used and the server time. Both carry `vid`, a pseudonym that changes every UTC day (an HMAC of the visitor key under `W2L_QUOTA_HASH_KEY`), and `automated`, a user-agent guess for filtering crawlers: true for a tool that names itself (`bot`, `crawl`, `headless`, `curl`, Dataprovider.com, DomainMonitor and the like), for no user agent, and for a browser no one runs any more (iOS before 15, Chrome before 110), which in the first week were scanners that opened the page and never touched it. Owner-token evaluation runs are not counted. The public [privacy page](../apps/public-web/content/privacy.md) describes all of this to visitors; change it with any change to what is logged. Read them in Cloud Logging:

```sh
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="w2l-public-preview" AND (jsonPayload.event="w2l_web_event" OR jsonPayload.event="w2l_preview") AND jsonPayload.automated=false' \
  --project="$W2L_PROJECT_ID" --freshness=7d --format=json
```

### Hosted waitlist

The home page footer carries a hidden-until-scripted early-access form; it opens from there, from the link shown once a visitor's daily previews run out, and from the Limits page (`/?from=limits#waitlist`). It posts to `POST /api/waitlist` (same origin only, 2 KB, fixed roles and needs, a hidden honeypot field, five sign-ups per visitor per UTC day per instance). Each address is one document in the Firestore `waitlist` collection, with an HMAC of the address under `W2L_QUOTA_HASH_KEY` as its id, so a repeat sign-up replaces the answers and keeps the first sign-up time (`createdAtMs`, epoch milliseconds, because Firestore's `minimum` transform takes numbers only); no cookie, IP address or preview is stored with it, and nothing about it is logged. The runtime service account's `roles/datastore.user` covers the new collection. Read and maintain it as the owner:

```sh
node scripts/public-preview/waitlist.mjs            # counts by role, need, entry point and referrer
node scripts/public-preview/waitlist.mjs --emails   # plus every entry as CSV
node scripts/public-preview/waitlist.mjs --delete someone@example.org
node scripts/public-preview/waitlist.mjs --expire   # entries older than 12 months, as the privacy page promises
```

To pause anonymous capture without removing the public page, run `gcloud run services update w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --update-env-vars=W2L_PREVIEW_ENABLED=false`. The deployment must not set `W2L_CAPTURE_RAW_DIR` or the local Reddit/X proxy/exception options. Never enable arbitrary-domain browser fallback: the public browser path is restricted to Amazon.sg and its fixed resource hosts; generic pages use the guarded HTTP path.

## Release checks

Check `/api/health`, then complete a real public-document extraction in the browser and inspect its final URL, state, body, and visible elapsed time. Test an Amazon.sg `/dp/{ASIN}` from the same page and confirm the requested/selected ASIN, Singapore location, SGD currency, and explicit issues on uncertainty. Exercise wrong-origin, private/metadata URL, redirect, invalid URL, quota exhaustion, and Firestore-unavailable cases. Record warm/cold p50/p95 including failures and retry time, and inspect Cloud Run billing rather than inferring cost from the free tier.

The fixed 100-product manifest is `research/amazon-product-holdout-100-sg.v1.json`. Run `scripts/public-preview/verify-holdout.mjs` from the **same clean source commit** as the deployed service. It sends all 100 fixed URLs through the HTTPS `/api/preview` endpoint, compares the reported source and anonymous-state hashes, and saves the owner-only same-capture HTML witnesses under ignored `.w2l/` for review. This cohort was already seen in local experiments; this is a public-path regression, **not another 100 unseen products**.

```sh
export W2L_PREVIEW_BASE_URL="$(gcloud run services describe w2l-public-preview --region="$W2L_REGION" --project="$W2L_PROJECT_ID" --format='value(status.url)')"
IFS= read -r W2L_EVAL_TOKEN < .w2l/public-preview/eval-token
export W2L_EVAL_TOKEN
export W2L_EXPECT_AMAZON_STATE_SHA256="$(shasum -a 256 "$W2L_AMAZON_PUBLIC_STATE_FILE" | awk '{print $1}')"
node scripts/public-preview/verify-holdout.mjs
unset W2L_EVAL_TOKEN
```

Keep the generated report and every failed or blocked row in the denominator. Compare field values against the saved same-capture HTML before reporting **output accuracy** and **visible-field coverage** separately; have Howard sign off the independent field review. The runner's automatic 100/100 checks do not establish those two human-reviewed rates. Finally, have one non-author open the link and complete a documentation scrape unaided; record the outcome separately from automated tests.

### New 100-product candidate

The committed 100-URL set above is a **regression set**. To satisfy a new-product holdout, freeze a separate cohort before evaluating any of its detail pages. `discover-unseen-100.mjs` uses W2L MCP to fetch only Amazon.sg bestseller **listing** pages and collects product links from them. It excludes ASINs recorded in tracked manifests, fixtures and evidence, plus ignored reports from all registered local Git worktrees; use `--archive-evidence DIR` for an older evidence directory no longer attached as a worktree. The ignored discovery ledger records each scanned file's SHA-256, the ASIN exclusion-set hash, listing statuses and the clean source commit. “Unseen” means absent from those recorded sources; it cannot prove an absolute history of browsing elsewhere.

```sh
test -z "$(git status --porcelain)" || { echo 'Commit a clean source first' >&2; exit 1; }
export W2L_UNSEEN_DIR="$PWD/.w2l/public-preview/unseen-100-sg/$(date -u +%Y%m%dT%H%M%SZ)"
node scripts/public-preview/discover-unseen-100.mjs \
  --state-file "$W2L_AMAZON_PUBLIC_STATE_FILE" --output-dir "$W2L_UNSEEN_DIR"
# If discovery freezes fewer than 100, keep the failure report and add new
# listing categories in a new source commit; do not substitute products after evaluation.
IFS= read -r W2L_EVAL_TOKEN < .w2l/public-preview/eval-token
export W2L_EVAL_TOKEN
node scripts/public-preview/verify-holdout.mjs \
  --manifest "$W2L_UNSEEN_DIR/manifest.json" --output-dir "$W2L_UNSEEN_DIR/evaluation"
unset W2L_EVAL_TOKEN
# Only after all 100 evaluation rows have hash-matched same-capture HTML:
node scripts/section-b/amazon-holdout-review.mjs \
  --report "$W2L_UNSEEN_DIR/evaluation/report.json" \
  --output-dir "$W2L_UNSEEN_DIR/evaluation/review"
```

Discovery and public-path evaluation must use the same clean source commit and exact anonymous Singapore state hash. The public-path runner refuses a changed discovery ledger, different deployed source, or changed state; it keeps every failed product in the fixed denominator. A run with missing HTML remains failed; do not omit those rows or replace URLs to make the review script pass. The evaluator itself is run against the deployed HTTPS page API with the owner token. `amazon-holdout-review.mjs` reports machine-assisted output accuracy and visible-field coverage against same-capture HTML; its selectors and candidate leak checks require independent review and Howard's sign-off before either rate is accepted.
