import type { StageEvent } from './crawlModel'

/** The content type of a preview that reports its stages (packages/public-preview/src/server.ts). */
export const STAGE_STREAM = 'application/x-ndjson'

function stageOf(line: Record<string, unknown>): StageEvent | null {
  if (line.stage === 'started' || line.stage === 'page') return { stage: line.stage }
  if (line.stage === 'robots' && typeof line.allowed === 'boolean') return { stage: 'robots', allowed: line.allowed, ...(line.unreachable === true ? { unreachable: true as const } : {}) }
  return null
}

/** Reads /api/preview's answer. A streamed answer tells each stage to `onStage` as its line arrives and ends with the
 * result; any other answer is the result as plain JSON. A stream that ends without a result is an error. */
export async function readPreview(response: Response, onStage: (stage: StageEvent) => void): Promise<unknown> {
  if (!response.body || !(response.headers.get('content-type') ?? '').startsWith(STAGE_STREAM)) return response.json()
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let result: unknown
  const take = (line: string): void => {
    if (!line.trim()) return
    const value = JSON.parse(line) as unknown
    if (!value || typeof value !== 'object') return
    const message = value as Record<string, unknown>
    if (message.type === 'result') result = message.body
    else if (message.type === 'stage') {
      const stage = stageOf(message)
      if (stage) onStage(stage)
    }
  }
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      take(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
    }
  }
  take(buffer)
  if (result === undefined) throw new Error('The service returned an incomplete result.')
  return result
}
