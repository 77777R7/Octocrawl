# Run Octocrawl with Docker Compose

Two files in [deploy/docker](../deploy/docker) run Octocrawl's REST API on your own server: the `octocrawl` package from npm, with the Chromium it uses for pages that only appear in a browser. Every request needs a token you choose. There is no daily limit.

## Start it

You need Docker with Compose v2. Most of the image is Chromium and its system libraries.

```bash
git clone https://github.com/77777R7/Octocrawl.git
cd Octocrawl/deploy/docker
echo "OCTOCRAWL_TOKEN=$(openssl rand -hex 24)" > .env
docker compose up -d --build
```

The two files need nothing else from the repository, so you can copy `Dockerfile` and `compose.yaml` to any folder instead of cloning. `docker compose ps` shows the container as `healthy` once the API answers.

## Call it

Send the token as a bearer header. Replace `octocrawl.lan` with your server's address.

```bash
export OCTOCRAWL_TOKEN=$(sed -n 's/^OCTOCRAWL_TOKEN=//p' .env)    # the token you wrote to .env
curl -X POST http://octocrawl.lan:8787/v1/scrape \
  -H "authorization: Bearer $OCTOCRAWL_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://example.com/","formats":["markdown"]}'
```

The answer is the page as Markdown with its Evidence Record, as from `npx octocrawl serve`. The [REST API](../apps/public-web/content/reference.md)'s routes answer as they do there, apart from the ones that need your own Chrome or saved logins (below).

- **An MCP client** on your laptop runs the stdio server against this one: `npx -y @octocrawl/mcp --base-url http://octocrawl.lan:8787 --token <token>`. For Claude Code, run `claude mcp add octocrawl -- npx -y @octocrawl/mcp --base-url http://octocrawl.lan:8787 --token <token>`.
- **The TypeScript SDK**: `new W2L({ baseUrl: 'http://octocrawl.lan:8787', token })`.
- **The Python client** (`octocrawl-client`): `W2L(base_url="http://octocrawl.lan:8787", token=...)`.

## Two modes

- **For your own use** (the default). Crawl and batch run without a page cap. Map, robots.txt overrides you ask for, and addresses on your own network all work, as with `npx octocrawl serve` on your computer. `localhost` means the container itself, not your server. Saved logins (`mode: "authed"`) are not read, because the server listens beyond loopback.
- **For a server other people use**: set `OCTOCRAWL_MODE=hosted` in `.env`. The server then refuses private and internal addresses, robots.txt overrides and saved logins, and caps a crawl at 100 pages. [Running Octocrawl](local-setup.md) lists what hosted mode refuses.

Anyone who holds the token can make the server read pages for them, in the default mode including pages on your network. Keep the token secret. To reach the server from outside your network, put it behind a reverse proxy that adds HTTPS, such as Caddy or nginx.

## Settings

Set these in `.env` beside `compose.yaml`:

| Variable | Default | What it does |
| --- | --- | --- |
| `OCTOCRAWL_TOKEN` | none, required | The bearer token every request must send. |
| `OCTOCRAWL_VERSION` | `latest` | The npm version to install, for example `0.4.1`. |
| `OCTOCRAWL_MODE` | empty (your own use) | `hosted` for a server other people use. |
| `OCTOCRAWL_PORT` | `8787` | The port on your server. |
| `OCTOCRAWL_HTTPS_PROXY`, `OCTOCRAWL_HTTP_PROXY`, `OCTOCRAWL_NO_PROXY` | empty | An outbound proxy, when your server needs one to reach the web, passed to the container as `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY`. A proxy on `127.0.0.1` means the container itself, so give the server's address as the container sees it. Hosted mode does not use a proxy. |

Results, task records and the page cache are kept in the `octocrawl-data` volume, mounted at `/data`, so they survive a restart and an update.

## Update

```bash
docker compose build --pull --no-cache
docker compose up -d
```

With `OCTOCRAWL_VERSION` pinned, change it in `.env` first.

## What it does not include

- **A remote MCP URL.** The container serves the REST API only. MCP clients connect through `@octocrawl/mcp`, as shown above.
- **Your own Chrome.** The `my-browser` lane and handoff open pages in the Chrome on your computer, so they do not work from a server.
- **The Monitor scheduler and delivery worker.** These come from the repository's managed local service, which runs from a checkout of the repository ([Monitor and Delivery through MCP](mcp-first-use.md)).

The `Self-host compose` workflow (`.github/workflows/selfhost-compose.yml`) runs these files on a clean Linux x86-64 machine when they change. It checks that the server refuses a request without the token and reads a page over HTTP. It also checks that Chromium captures a screenshot, and that a record written before the container is recreated can be read after it. It runs the default mode only: hosted mode and other platforms, such as arm64, have not been run.
