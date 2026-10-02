# Connect Octocrawl MCP

Choose your MCP client below. Octocrawl currently connects through a [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) endpoint on the same computer as your client; hosted browser login is paused on the roadmap.

{{MCP_CLIENT_PICKER}}

## Start Octocrawl on your computer

On macOS, from an Octocrawl repository checkout, use Node.js 22.13+ or 24+:

```bash
npm ci
npm run first-use:local
npm run local:mcp:status
```

The setup prepares Chromium and starts the managed local service. It also attempts to register Octocrawl with **Codex**. Keep the service running while you use MCP. The local endpoint is `http://127.0.0.1:8791/mcp`; it is only reachable from this computer and does not require browser login. On another system, build the repository and run `npm run local:mcp` in a terminal; the managed macOS receiver setup is unavailable there.

Registration alone does not prove a task works. After adding the server, check that `w2l-local` is connected, that `preview_monitor` appears, and then send the sample task below. If the server is missing, check `npm run local:mcp:status` and restart or reload the client. The Codex path has been verified locally; the other client snippets follow their documented configuration formats and still need an Octocrawl task-level check.

## Send your first task

```text
Use Octocrawl's preview_monitor with preset firecrawl-introduction. Show the sample quality, source URL, field evidence, and any missing reasons. Do not create a persistent Monitor yet.
```

Expected output is a **nonpersistent** sample assessment. It does not create a baseline, scheduled run, or webhook delivery. If the connection is absent, check `npm run local:mcp:status`, the saved entry with `codex mcp list`, and then open a new Codex task. If the sample is blocked or incomplete, inspect the reported reason before creating a Monitor.

Then continue with [Monitor → HTTPS Webhook](/docs/guides/monitor-webhook/) or [Amazon.sg product JSON](/docs/guides/amazon-product/).

## Hosted connection

**Paused.** There is no permanent HTTPS MCP URL, hosted login, or copyable remote command. The [roadmap](https://github.com/77777R7/w2l/blob/main/ROADMAP.md#paused) puts a hosted API and hosted MCP on hold until people need runs while their computer is off; until then, Octocrawl MCP runs on your own computer as described above.
