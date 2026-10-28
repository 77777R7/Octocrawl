export { createApp, injectJobWebSockets } from './app.js'
export type { AppOptions } from './app.js'
export { jobStream, pageCursor, sseEvent } from './jobStream.js'
export type { JobStreamOptions } from './jobStream.js'
export { createApiEngine, CrawlStateError, defaultSessionsFile, HandoffUnavailableError, HOSTED_CALL_CAPABILITIES, LoginsUnavailableError, SessionsUnavailableError } from './engine.js'
export { ChromeLoginError, chromeEndpoint, chromeUserDataDir, connectCdp, cookiesForDomain, importChromeLogin, listSavedLogins, loginDomain, removeSavedLogin } from './chromeLogin.js'
export type { CdpConnection, ImportChromeLoginOptions, ImportedLogin } from './chromeLogin.js'
export { HandoffNotThrough, openUserChrome } from './chromeHandoff.js'
export type { UserChrome, UserChromeOptions, UserChromeReadOptions } from './chromeHandoff.js'
export type { ApiEngine, ApiEngineOptions, CallCapability, CrawlWithSteps, HandoffHooks, HostedChromeClient, HostedChromeOperator, SliceCharge, SliceLimits, SliceResult } from './engine.js'
export { compactScrapeResponse, extractStructured, modelCallsMaxCostUsd, structuredModelConfigFromEnv } from './structured.js'
export { deliveryConfig, JOB_STREAMS_OFF_NOTICE, parseListen, parsePort } from './listen.js'
export { loadEngineConfig, preloadEngineModules, startCaptchaSolving, tunedPolicy } from './engineConfig.js'
export type { EngineConfig } from './engineConfig.js'
export { runApiServer } from './cli.js'
export { closeIdleOnlyWhenUnread } from './keepAlive.js'
// The optional Patchright engine's loader, for the octocrawl commands' startup check (ADR 0005 enhanced_browser).
export { loadImpit, loadPatchrightEngine } from '@w2l/bench'
// The octocrawl-chrome service's browser lane (ADR 0005 hosted_chrome), for @w2l/mcp's hostedChrome.ts.
export { BrowserLocalSubject, CompatAddressGuard, HOSTED_CHROME_PROFILE_ID, hostedChromeRefusal } from '@w2l/bench'
export type { GuardResolver, InstalledChromeTestSeams } from '@w2l/bench'
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
