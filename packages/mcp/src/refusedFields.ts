import { BATCH_KEYS, CRAWL_KEYS, MAP_KEYS, SCRAPE_KEYS } from '@w2l/contracts'

/**
 * The top-level request fields a 400 refused, for the `hosted_refused` log line (2026-11-05 audit, item 20: `invalid_request`
 * did not say which field). A field's name only, never what was sent in it, so the line can be read without holding a
 * request's content: `details.parameters` names the keys a request sent that are refused, and any other refusal is read from
 * the first word of its message, kept only when it is a field of the API, since a message may carry a value (a selector, a
 * URL). Below the top level a path is the caller's own text (`headers.<what was sent>`, a schema's property names), so it stops there.
 * Null when the answer names none.
 */
const NAMED_FIELDS: ReadonlySet<string> = new Set<string>([...SCRAPE_KEYS, ...CRAWL_KEYS, ...BATCH_KEYS, ...MAP_KEYS, 'maxCredits', 'webhook', 'cursor', 'before', 'fields'])
const FIRST_WORD = /^[A-Za-z]\w*/
const TOP_LEVEL = /^[\w-]+/
const SENT_NAME = /^[\w.[\]-]{1,64}$/
/** A format's own option refused: its message opens with the format's name, not with `formats`. */
const FORMAT_OPTION = /^(?:unsupported )?(?:json|list|attributes|screenshot)\b/
const MAX_FIELDS = 5

export function refusedFields(answer: unknown): string[] | null {
  if (answer === null || typeof answer !== 'object') return null
  const { error, details } = answer as { error?: unknown; details?: { parameters?: unknown; formats?: unknown } }
  if (Array.isArray(details?.parameters)) {
    const sent = details.parameters.filter((name): name is string => typeof name === 'string' && SENT_NAME.test(name))
    const names = [...new Set(sent.flatMap((name) => TOP_LEVEL.exec(name)?.[0] ?? []))].slice(0, MAX_FIELDS)
    return names.length > 0 ? names : null
  }
  if (Array.isArray(details?.formats)) return ['formats']
  if (typeof error !== 'string') return null
  if (FORMAT_OPTION.test(error)) return ['formats']
  const word = FIRST_WORD.exec(error)?.[0]
  return word !== undefined && NAMED_FIELDS.has(word) ? [word] : null
}
