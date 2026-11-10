import type { ScrapeStage } from './stages.js'

/**
 * What a server is doing, as it happens, for whoever shows it to the person the server runs for (`octocrawl serve`
 * draws it on its terminal): a scrape or map call as it starts, a scrape's stages (scrapeStages: the HTTP lane's
 * alone, so a call may tell none), and its end; a crawl or batch as it starts, each page it records, and its end.
 * `origin` is who called, as the request said (an MCP server sends its client's name). It tells nothing a call's
 * result does not hold, changes no call, and a listener that throws is not heard.
 */
export type ServerActivity =
  | { type: 'call_started'; id: number; kind: 'scrape' | 'map'; url: string; origin?: string }
  | { type: 'call_stage'; id: number; stage: ScrapeStage }
  | { type: 'call_ended'; id: number }
  | { type: 'job_started'; taskId: string; kind: 'crawl' | 'batch' }
  | { type: 'job_page'; taskId: string; kind: 'crawl' | 'batch' }
  | { type: 'job_ended'; taskId: string }

export type ServerActivityListener = (event: ServerActivity) => void
