import { scrapeTool } from '@octocrawl/ai-sdk'
const out = await scrapeTool({ apiKey: '' }).execute({ url: 'https://example.com/' }, { toolCallId: 'c1', messages: [] })
console.log(JSON.stringify(out, null, 2))
