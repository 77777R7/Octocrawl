/** What a visitor may ask of one public preview besides the URL: whether to keep only the page's main content, and
 * which formats to return (Markdown, links, and up to MAX_FIELDS fields read deterministically from the page). The
 * request is checked in full before any network or quota work, so a refused one costs nothing; anything else (model
 * prompts, browser settings, timeouts, debug output) is refused by name. */
import { parseScrapeRequest, RequestError, type JsonSchema } from '@w2l/contracts'

/** The most fields a visitor may ask for, the largest schema (UTF-8 bytes), and the largest request body. */
export const MAX_FIELDS = 20
export const MAX_SCHEMA_BYTES = 4096
export const PREVIEW_BODY_BYTES = 8192
const MAX_TEXT = 200

export type PreviewFormat = 'markdown' | 'links' | { type: 'json'; schema: JsonSchema }
export interface PreviewOptions {
  onlyMainContent?: boolean
  formats?: PreviewFormat[]
}
export interface PreviewRequest {
  url: string
  options: PreviewOptions
}

/** A request the preview does not accept; its message names the parameter. */
export class PreviewOptionsError extends Error {}

const REQUEST_KEYS = new Set(['url', 'onlyMainContent', 'formats'])
const SCHEMA_KEYS = new Set(['$schema', 'type', 'properties', 'required', 'additionalProperties', 'title', 'description'])
const PROPERTY_KEYS = new Set(['type', 'items', 'title', 'description'])
const ITEM_KEYS = new Set(['type'])
const PRIMITIVES = new Set(['string', 'number', 'integer', 'boolean'])
const FIELD_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u
const RESERVED_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

const name = (key: string): string => JSON.stringify(key.slice(0, 40))

function onlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, where: string): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new PreviewOptionsError(`The preview does not accept ${name(key)}${where}.`)
}

/** A type or a list of types, with at most one besides "null". */
function types(value: unknown, where: string): { type: string; nullable: boolean } {
  const list = typeof value === 'string' ? [value] : Array.isArray(value) && value.every(item => typeof item === 'string') ? value as string[] : null
  if (list === null || list.length === 0 || list.length > 2 || new Set(list).size !== list.length) throw new PreviewOptionsError(`${where} needs a type.`)
  const others = list.filter(type => type !== 'null')
  if (others.length !== 1) throw new PreviewOptionsError(`${where} needs exactly one type besides null.`)
  return { type: others[0]!, nullable: others.length !== list.length }
}

function text(value: unknown, where: string): void {
  if (value !== undefined && (typeof value !== 'string' || value.length > MAX_TEXT)) throw new PreviewOptionsError(`${where} must be text of at most ${MAX_TEXT} characters.`)
}

function checkField(key: string, value: unknown): void {
  const where = `The field ${name(key)}`
  if (!FIELD_NAME.test(key) || RESERVED_NAMES.has(key)) throw new PreviewOptionsError(`${where} needs a name of letters, digits, spaces, dots, dashes or underscores, at most 64 characters.`)
  if (!isRecord(value)) throw new PreviewOptionsError(`${where} must be an object.`)
  onlyKeys(value, PROPERTY_KEYS, ` in ${where.toLowerCase()}`)
  text(value.title, `${where}'s title`)
  text(value.description, `${where}'s description`)
  const { type } = types(value.type, where)
  if (type === 'array') {
    const items = value.items
    if (!isRecord(items)) throw new PreviewOptionsError(`${where} is a list and needs its items' type.`)
    onlyKeys(items, ITEM_KEYS, ` in ${where.toLowerCase()}'s items`)
    if (!PRIMITIVES.has(types(items.type, `${where}'s items`).type)) throw new PreviewOptionsError(`${where} may list text, numbers or true/false values only.`)
    return
  }
  if (value.items !== undefined) throw new PreviewOptionsError(`${where} has items but is not a list.`)
  if (!PRIMITIVES.has(type)) throw new PreviewOptionsError(`${where} may be text, a number, true/false or a list of them.`)
}

/** A flat object of 1 to MAX_FIELDS fields, each a text, a number, a true/false value or a list of them. */
function checkSchema(value: unknown): JsonSchema {
  if (!isRecord(value)) throw new PreviewOptionsError('The fields must be a JSON Schema object.')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SCHEMA_BYTES) throw new PreviewOptionsError(`The fields may take at most ${MAX_SCHEMA_BYTES} bytes.`)
  onlyKeys(value, SCHEMA_KEYS, ' in the fields')
  if (value.$schema !== undefined && typeof value.$schema !== 'string') throw new PreviewOptionsError('$schema must be text.')
  text(value.title, 'The title')
  text(value.description, 'The description')
  if (value.type !== 'object') throw new PreviewOptionsError('The fields must be an object schema ("type": "object").')
  if (value.additionalProperties !== undefined && typeof value.additionalProperties !== 'boolean') throw new PreviewOptionsError('additionalProperties must be true or false.')
  const properties = value.properties
  if (!isRecord(properties)) throw new PreviewOptionsError('The fields need "properties".')
  const keys = Object.keys(properties)
  if (keys.length === 0 || keys.length > MAX_FIELDS) throw new PreviewOptionsError(`Ask for 1 to ${MAX_FIELDS} fields.`)
  for (const key of keys) checkField(key, properties[key])
  if (value.required !== undefined) {
    if (!Array.isArray(value.required) || value.required.some(item => typeof item !== 'string' || !keys.includes(item)) || new Set(value.required).size !== value.required.length) {
      throw new PreviewOptionsError('"required" must list fields of the schema, each once.')
    }
  }
  return value as JsonSchema
}

function readFormat(value: unknown): PreviewFormat {
  if (value === 'markdown' || value === 'links') return value
  if (value === 'json') throw new PreviewOptionsError('The json format needs the fields to read ({"type": "json", "schema": …}).')
  if (!isRecord(value)) throw new PreviewOptionsError('Each format must be "markdown", "links" or {"type": "json", "schema": …}.')
  onlyKeys(value, new Set(['type', 'schema']), ' in a format')
  if (value.type !== 'json') throw new PreviewOptionsError('Each format must be "markdown", "links" or {"type": "json", "schema": …}.')
  return { type: 'json', schema: checkSchema(value.schema) }
}

/** The URL and the options of a preview request, or a PreviewOptionsError naming what is not accepted. */
export function parsePreviewRequest(body: unknown): PreviewRequest {
  if (!isRecord(body)) throw new PreviewOptionsError('Send a JSON object with a url.')
  onlyKeys(body, REQUEST_KEYS, '')
  if (typeof body.url !== 'string') throw new PreviewOptionsError('The request must contain a url.')
  const options: PreviewOptions = {}
  if (body.onlyMainContent !== undefined) {
    if (typeof body.onlyMainContent !== 'boolean') throw new PreviewOptionsError('onlyMainContent must be true or false.')
    options.onlyMainContent = body.onlyMainContent
  }
  if (body.formats !== undefined) {
    if (!Array.isArray(body.formats) || body.formats.length === 0 || body.formats.length > 3) throw new PreviewOptionsError('formats must list 1 to 3 formats.')
    const formats = body.formats.map(readFormat)
    const kinds = formats.map(format => typeof format === 'string' ? format : 'json')
    if (new Set(kinds).size !== kinds.length) throw new PreviewOptionsError('Each format may appear once.')
    // The engine's own checks too, so a schema the preview accepts is one the extraction honours.
    try { parseScrapeRequest({ url: 'https://example.com/', formats }) }
    catch (error) { throw new PreviewOptionsError(error instanceof RequestError ? `The fields are not supported: ${error.message}` : 'The fields are not supported.') }
    options.formats = formats
  }
  return { url: body.url, options }
}

/** Whether a request asked for anything but the URL. */
export const hasOptions = (options: PreviewOptions): boolean => options.onlyMainContent !== undefined || options.formats !== undefined

/** The fields' schema, when the request asked for them. */
export function fieldsSchema(options: PreviewOptions | undefined): JsonSchema | undefined {
  const format = options?.formats?.find((item): item is { type: 'json'; schema: JsonSchema } => typeof item !== 'string')
  return format?.schema
}
