export { createApp, injectJobWebSockets } from './app.js'
export type { AppOptions } from './app.js'
export { jobStream, pageCursor, sseEvent } from './jobStream.js'
export type { JobStreamOptions } from './jobStream.js'
export { createApiEngine, CrawlStateError, defaultSessionsFile, HandoffUnavailableError, HOSTED_CALL_CAPABILITIES, LoginsUnavailableError, SessionsUnavailableError } from './engine.js'
export { ChromeLoginError, chromeEndpoint, chromeUserDataDir, connectCdp, cookiesForDomain, importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin } from './chromeLogin.js'
export type { CdpConnection, ImportChromeLoginOptions, ImportedLogin } from './chromeLogin.js'
export { forgetSites, listRememberedSites, rememberedSitesFile, rememberSites, siteHost } from './rememberedSites.js'
export type { RememberedSite } from './rememberedSites.js'
export { HandoffNotThrough, openUserChrome } from './chromeHandoff.js'
export type { UserChrome, UserChromeOptions, UserChromeReadOptions } from './chromeHandoff.js'
export type { ApiEngine, ApiEngineOptions, BrowserTurn, CallCapability, CrawlWithSteps, HandoffHooks, HostedChromeAdmission, HostedChromeClient, HostedChromeMeter, HostedChromeOperator, SliceCharge, SliceLimits, SliceResult } from './engine.js'
export { compactScrapeResponse, extractStructured, hasFormat, modelCallsMaxCostUsd, structuredModelConfigFromEnv } from './structured.js'
export { scrapeStages } from './stages.js'
export type { ScrapeStage } from './stages.js'
export type { ServerActivity, ServerActivityListener } from './activity.js'
export { deliveryConfig, JOB_STREAMS_OFF_NOTICE, parseListen, parsePort } from './listen.js'
export { loadEngineConfig, preloadEngineModules, startCaptchaSolving, tunedPolicy } from './engineConfig.js'
export type { EngineConfig } from './engineConfig.js'
export { runApiServer } from './cli.js'
// The result files a job ends with, and the CLI's `--out` writes: one column set for both.
export { csvField, csvLine, evidenceRow, markdownFileName, RESULT_COLUMNS, RESULT_CSV, RESULT_FILE_COLUMNS, RESULT_JSONL, RESULT_MARKDOWN_DIR, resultFilesOf, writeResultFiles } from './resultFiles.js'
export type { ResultPage } from './resultFiles.js'
// A finished batch's failed pages by reason, counted by the engine's slice charges and the hosted worker alike (hints.ts).
export { batchFailureHints, failureGroupOf, withFailure } from './hints.js'
export type { BatchFailures, FailureFacts } from './hints.js'
export { closeIdleOnlyWhenUnread } from './keepAlive.js'
// The optional Patchright engine's loader, for the octocrawl commands' startup check (ADR 0005 enhanced_browser).
export { loadImpit, loadPatchrightEngine } from '@w2l/bench'
// The octocrawl-chrome service's browser lane (ADR 0005 hosted_chrome), for @w2l/mcp's hostedChrome.ts.
export { BrowserLocalSubject, browserKeeper, CompatAddressGuard, HOSTED_CHROME_PROFILE_ID, hostedChromeRefusal, RobotsOriginCache } from '@w2l/bench'
export type { BrowserKeeper } from '@w2l/bench'
export type { GuardDial, GuardResolver, InstalledChromeTestSeams, PricedExit } from '@w2l/bench'
// The operator's monthly ledger and its tariffs, for @w2l/mcp's hostedChromeMeter.ts (ADR 0005 hosted_chrome, D5).
export { normalizeVendorTariff, openMonthlySpendLedger, paidCallFixedCost, tariffCeilingUsd, tariffCostUsd, tariffMonthlyFixedUsd } from '@w2l/http-core'
export type { VendorTariff } from '@w2l/http-core'
// The hosts the compatible transport serves by default, which hosted Octocrawl's per-request grant uses too (ADR 0005 compatible_transport).
export { COMPAT_BENEFIT_HOSTS } from '@w2l/bench'
export type { ApiMode, DeliveryConfig, ListenConfig } from './listen.js'
export { JobEventHub, jobKindOf } from './jobEvents.js'
export type { JobEvent, JobEventListener, JobKind, JobTerminalStatus } from './jobEvents.js'
export {
  FIRECRAWL_SHIM_DIFFS,
  FIRECRAWL_SHIM_SNAPSHOT,
  parseCrawlStartRequest,
  parseCrawlPageQuery,
  parseFirecrawlCrawlRequest,
  parseFirecrawlScrapeRequest,
  parseScrapeRequest,
  RequestError,
} from '@w2l/contracts'
