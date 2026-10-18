# Octocrawl plugin for ChatGPT and Codex

The package submitted to OpenAI's plugin directory, in the portable Agent Plugins format: `plugin.json` (listing, review test cases and publication notes under `extensions.com.openai`), `mcp.json` (one remote MCP server, `https://mcp.octocrawl.dev/mcp-oauth`, OAuth with a Client ID Metadata Document), the `get-started` onboarding skill and the icons.

Build the ZIP from this folder, with the folder itself at the archive root:

```bash
cd plugins && zip -r ../octocrawl-openai.zip octocrawl-openai -x '*/README.md'
```

The demo recording URL and the reviewer account are entered in the portal, not in this package. The version follows the packages' (`scripts/release-version.mjs`); a new version is a new review.
