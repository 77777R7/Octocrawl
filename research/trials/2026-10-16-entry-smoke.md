# 2026-10-16 试用入口工程检查

此记录由工程助手执行，**不是非作者试用**。参与者及其真实任务仍待 Howard 安排。

- 时间：2026-10-16 02:56:35–02:56:36（Asia/Shanghai）。
- 入口：`https://mcp.octocrawl.dev/mcp`，无密钥；通过仓库 lockfile 对应的 MCP JavaScript SDK 连接。
- 操作：initialize、tools/list，随后一次 tools/call；可见工具为 `scrape` 和 `map`。
- 参数：`scrape`，URL `https://octocrawl.dev/docs/limits/`，`formats: ["markdown"]`，`timeout: 30000`，`verify.checks: [{"type":"markdownIncludes","text":"Octocrawl"}]`。
- 结果：`success`、配置检查 `passed`、readiness `ready`，最终 URL 与请求相同，交付 Markdown 11,574 字符。
- 响应声明：extractor `extract-tf/28`，提交 `bc47bf0e62b07c45b517c2761f1ccb8c7e599073`，verifier `verify/4`。
- 已报告 externalCostUsd 为 0；网络成本未知。此次检查只证明该入口的一次连接与调用，不保证其他页面可获取。
- 原始请求与响应保存在执行工作区的私有 `.w2l/delivery-scope/hosted-smoke*.json`。

本地 #512 候选没有通过这次调用上线；本记录不证明 `verify/5` 已部署，也不改变已有准确性验收结论。
