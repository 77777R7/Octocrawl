# Hosted MCP pilot (archived)

Archived on 2026-10-05, under ROADMAP P0 ("Render and WorkOS material leaves the docs"). This setup was moved here from `docs/mcp-first-use.md`, together with the Render Blueprint (`render.yaml`, now beside this file). Nothing here describes a deployed service: the Render deployment, WorkOS browser login and the hosted acceptance runs never happened.

The code it describes stays in the repository, marked experimental: `packages/mcp/src/host.ts` and `npm run hosted:mcp`. Hosted scale is a P5 item.

## Unified self-hosted process (experimental)

`npm run hosted:mcp` runs the in-process REST API, Monitor scheduler, delivery
worker, and Streamable HTTP endpoint in one process. REST is internal; the
public listener exposes `/mcp`, `/.well-known/oauth-protected-resource`, and
`/healthz`. It requires these environment variables:

| Variable | Meaning |
| --- | --- |
| `W2L_MCP_URL` | Exact external `https://.../mcp` resource URL |
| `WORKOS_ISSUER` | AuthKit access-token issuer origin |
| `W2L_OWNER_SUBJECT` | Howard's WorkOS user ID (`sub`) |
| `W2L_RECEIVER_URL` | Exact controlled `https://.../webhook` URL |
| `W2L_WEBHOOK_SECRET_DEMO` | Delivery signing secret, equal to receiver `WEBHOOK_SECRET` |
| `W2L_AMAZON_PUBLIC_STATE_FILE` | Persistent anonymous Singapore/SGD browser preference; `/var/data/w2l/amazon-public-state.json` on Render |
| `W2L_TASK_ROOT` | Persistent task directory, `/var/data/w2l/tasks` on Render |
| `W2L_CAPTURE_RAW_DIR` | Optional raw HTML evidence directory, `/var/data/w2l/raw-html` on Render |

The protected-resource metadata advertises the exact MCP URL and WorkOS
authorization server. The server verifies signed access tokens against the
issuer JWKS, exact audience and owner subject, expiration, and `openid`
scope. Browser OAuth setup must use the same MCP resource identifier. Remote
tools are limited to reviewed public-document Monitor/Delivery and anonymous
Amazon.sg product JSON/batches. Documentation capture uses HTTP; Amazon uses
the browser with an Amazon.sg-only preference state and a reviewed HTTPS
subresource host list. `scrape_product` and `batch_products` use the fixed
schema without caller-supplied model prompts. One active batch, at most 1000
distinct products, and a 90-minute run budget bound the initial host.

## Render pilot deployment

The [Blueprint](render.yaml) defines **two** Singapore web services,
each with its own persistent disk. Deploy the Blueprint to the intended
workspace, then set the `sync: false` variables in the Render dashboard.
The main service installs Chromium in the image and, on first start, creates
the unsigned-in Singapore 238823 / SGD preference on its persistent disk;
later restarts reuse and validate that state. Use the actual assigned service domains for `W2L_MCP_URL` and
`W2L_RECEIVER_URL`; do not assume the names in the Blueprint become those
domains. Create/configure the WorkOS AuthKit MCP application for the exact
`W2L_MCP_URL`, obtain the issuer and Howard user ID, and enter those values
in Render. Put the same random signing secret in the main service's
`W2L_WEBHOOK_SECRET_DEMO` and receiver's `WEBHOOK_SECRET` variables.

After both `/healthz` and `/health` report healthy, connect a Codex client:

```bash
codex mcp add w2l --url https://ACTUAL-MCP-DOMAIN/mcp
```

Complete browser sign-in in the client and run the sequence above, then call
`scrape_product` for one Amazon.sg `/dp/{ASIN}` and `batch_products` for two
known products. Validate
connection, task completion with matching `eventId`, and continued Monitor
operation after disconnect and an actual Render service restart **separately**.
Also exercise invalid Origin, missing token, another user, forbidden source,
delivery failure, Retry-After and dead-letter. A successful tool listing
alone is not an accepted product flow.

The first hosted pilot is one owner and one Render instance: a SQLite disk
cannot be shared by multiple instances. Do not use this deployment as a
multi-tenant arbitrary-URL crawler. The actual Render deployment, WorkOS
browser login, browser egress and 1000-page gate remain open. Independent human onboarding, a real
customer downstream consumer, and the two-week Gate 5 trial remain separate
acceptance work.
