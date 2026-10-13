import { LINK_EXTRACTOR } from './linkExtractor'
import type { ToolPage } from './toolPage'
import { URL_TO_MARKDOWN } from './urlToMarkdown'
import { WEBSITE_TO_TEXT } from './websiteToText'

/** Every live free tool's page, as vite.config.ts builds them (tools/<slug>/index.html) and the sitemap lists them. */
export const TOOL_PAGES: readonly ToolPage[] = [URL_TO_MARKDOWN, LINK_EXTRACTOR, WEBSITE_TO_TEXT]
