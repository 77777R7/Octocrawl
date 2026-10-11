import { generateText, isStepCount } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'
import { octocrawlTools } from '@octocrawl/ai-sdk'
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }
const calls = [
  { toolName: 'map', input: { url: 'https://octocrawl.dev/', search: 'blog', limit: 10 } },
  { toolName: 'scrape', input: { url: 'https://example.com/' } },
]
let n = 0
const model = new MockLanguageModelV3({ doGenerate: async () => {
  const next = calls[n++]
  return next
    ? { content: [{ type: 'tool-call', toolCallId: `c${n}`, toolName: next.toolName, input: JSON.stringify(next.input) }], finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [] }
    : { content: [{ type: 'text', text: 'done' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] }
} })
const result = await generateText({ model, tools: octocrawlTools({ apiKey: '' }), stopWhen: isStepCount(5), prompt: 'x' })
for (const r of result.steps.flatMap((s) => s.toolResults)) {
  const o = r.output
  if (r.toolName === 'map') console.log('map', JSON.stringify({ status: o.status, returned: o.counts?.returned, first: o.links?.slice(0, 3).map((l) => l.url), refusal: o.status === 'refused' ? o : undefined }))
  else console.log('scrape', JSON.stringify({ status: o.status, finalUrl: o.finalUrl, httpStatus: o.httpStatus, title: o.title, md: o.markdown?.slice(0, 40), evidence: o.evidenceRecord?.schemaVersion, robots: o.evidenceRecord?.robotsDecision, refusal: o.status === 'refused' ? o : undefined }))
}
console.log('text', result.text)
