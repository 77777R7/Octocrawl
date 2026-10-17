import { LAYOUT_MARKERS, materializeShadowTables, type CapturedShadowTable } from '@w2l/extract-tf'
import type { Page } from 'playwright'

/** Elements under <body> above which a page is converted unannotated. */
export const LAYOUT_MAX_ELEMENTS = 100_000
/** Time the in-page work may take before the page is converted unannotated. */
export const LAYOUT_MAX_MS = 1_000
/** Time the whole capture may take, transfers included. */
export const LAYOUT_TIMEOUT_MS = 3_000
export const SHADOW_TABLE_LIMITS = { roots: 256, elements: 20_000, tables: 32, rows: 2_000, columns: 64, html: 1_000_000 } as const

interface ShadowTablesDetail {
  outcome: 'none' | 'captured' | 'unsupported_engine' | 'root_cap' | 'element_cap' | 'table_cap' | 'row_cap' | 'column_cap' | 'html_cap' | 'time_cap' | 'serialization_mismatch'
  roots: number
  elements: number
  tables: number
  rows: number
  hosts?: { path: readonly number[]; tag: string; rows: number; columns: number }[]
}

export interface LayoutOptions {
  maxElements?: number
  maxMs?: number
  /** Epoch ms the capture must finish by; it gives up rather than run past it. */
  deadlineAt?: number
  maxShadowRoots?: number
  maxShadowElements?: number
  maxShadowHtml?: number
}

export type LayoutOutcome =
  | 'annotated'
  | 'dom_changed'
  | 'marker_conflict'
  | 'element_cap'
  | 'time_cap'
  | 'timeout'
  | 'deadline'
  | 'error'

export interface LayoutCapture {
  /** Conversion copy with layout markers and supported shadow tables; null on a layout fallback. */
  html: string | null
  /** The same live read with supported open shadow roots serialized as declarative templates. */
  sourceHtml?: string
  /** For the trace: the outcome, what the page held and what it cost. */
  detail: {
    outcome: LayoutOutcome
    elements?: number
    blocks?: number
    hidden?: number
    pageMs?: number
    ms: number
    error?: string
    shadowTables?: ShadowTablesDetail
  }
}

interface AnnotateArgs {
  body: string
  display: string
  hidden: string
  blockTags: readonly string[]
  skipTags: readonly string[]
  maxElements: number
  maxMs: number
  shadowLimits: { roots: number; elements: number; tables: number; rows: number; columns: number; html: number }
}

interface AnnotateResult {
  outcome: 'annotated' | 'dom_changed' | 'marker_conflict' | 'element_cap' | 'time_cap'
  html?: string
  sourceHtml?: string
  shadowCapture?: { html: string; tables: CapturedShadowTable[] }
  elements?: number
  blocks?: number
  hidden?: number
  pageMs: number
  shadowTables?: ShadowTablesDetail
}

/**
 * Runs in the page, in one task, so no page script can change the DOM
 * between the check against the evidence and the copy. It declares no inner
 * functions: loaded through tsx, whose esbuild keepNames transform wraps
 * them, they would call a `__name` helper the page does not have.
 */
function annotate(args: AnnotateArgs): AnnotateResult {
  const started = performance.now()
  const body = document.body
  const elements = body === null ? 0 : body.getElementsByTagName('*').length
  if (elements > args.maxElements) return { outcome: 'element_cap', elements, pageMs: performance.now() - started }
  const doctype = document.doctype === null ? '' : new XMLSerializer().serializeToString(document.doctype)
  const root = document.documentElement
  // The serialization page.content() uses: the copy must describe the evidence.
  if (root === null || doctype + root.outerHTML !== args.body) return { outcome: 'dom_changed', elements, pageMs: performance.now() - started }
  if (document.querySelector(`[${args.display}],[${args.hidden}]`) !== null) return { outcome: 'marker_conflict', elements, pageMs: performance.now() - started }
  const blockTags = new Set(args.blockTags)
  const skipTags = new Set(args.skipTags)
  const blockSelector = args.blockTags.join(',')
  const blocks: Element[] = []
  const hidden: Element[] = []
  let visited = 0
  let el: Element | null = body === null ? null : body.firstElementChild
  while (el !== null) {
    if (++visited % 128 === 0 && performance.now() - started > args.maxMs) return { outcome: 'time_cap', elements, pageMs: performance.now() - started }
    let descend = !skipTags.has(el.localName)
    // Only elements the converter lays out inline are marked; block tags keep
    // their tag's layout, so a hidden block (a popup, an accordion panel, a
    // footnote a click reveals) keeps its content.
    if (descend && !blockTags.has(el.localName)) {
      const style = getComputedStyle(el)
      if (style.display === 'none') {
        // Hidden text within a line (a platform name, a sort key) is skipped
        // with everything inside it; one that holds blocks counts as a block.
        if (el.querySelector(blockSelector) === null) {
          hidden.push(el)
          descend = false
        }
      } else if (
        // A block in the flow of the text. Absolute, fixed and floated boxes
        // also compute as blocks but leave the line around them unbroken.
        style.position !== 'absolute' && style.position !== 'fixed' && style.cssFloat === 'none' &&
        /^(?:block|flow-root|flex|grid|table|list-item|-webkit-box)(?: |$)/.test(style.display)
      ) {
        blocks.push(el)
      }
    }
    if (descend && el.firstElementChild !== null) {
      el = el.firstElementChild
    } else {
      while (el !== null && el !== body && el.nextElementSibling === null) el = el.parentElement
      el = el === null || el === body ? null : el.nextElementSibling
    }
  }
  // Read only simple, explicitly headed ARIA tables in top-level open roots.
  // Neither a hidden/closed root, light-DOM slots, interactive cells nor an
  // arbitrary first row is guessed into a data table. No page HTML is parsed.
  const shadowTables: ShadowTablesDetail = { outcome: 'none', roots: 0, elements: 0, tables: 0, rows: 0 }
  const roots: ShadowRoot[] = []
  const replacements: (CapturedShadowTable & { template: string })[] = []
  let selectedChars = args.body.length
  if (args.body.length <= args.shadowLimits.html && typeof root.getHTML === 'function') {
    const hosts = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
    let host = hosts.nextNode() as Element | null
    while (host !== null) {
      if (performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; break }
      const shadow = host.shadowRoot
      if (shadow !== null) {
        if (++shadowTables.roots > args.shadowLimits.roots) { shadowTables.outcome = 'root_cap'; break }
        const rect = host.getBoundingClientRect()
        const style = getComputedStyle(host)
        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && host.childElementCount === 0 && host.textContent?.trim() === '') {
          const nodes = document.createTreeWalker(shadow, NodeFilter.SHOW_ELEMENT)
          const tables: Element[] = []
          const rootElements: Element[] = []
          let node = nodes.nextNode() as Element | null
          while (node !== null) {
            if (++shadowTables.elements > args.shadowLimits.elements) { shadowTables.outcome = 'element_cap'; break }
            if (shadowTables.elements % 128 === 0 && performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; break }
            if (node.getAttribute('role') === 'table') tables.push(node)
            rootElements.push(node)
            node = nodes.nextNode() as Element | null
          }
          if (shadowTables.outcome !== 'none') break
          if (tables.length === 1) {
            const table = tables[0]!
            const box = table.getBoundingClientRect()
            const tableStyle = getComputedStyle(table)
            const rows = Array.from(table.querySelectorAll('[role="row"]'))
            if (shadowTables.rows + Math.max(0, rows.length - 1) > args.shadowLimits.rows) { shadowTables.outcome = 'row_cap'; break }
            const materialized = document.createElement('table')
            let columns = 0
            let dataRows = 0
            let completeRows = 0
            let supported = box.width > 0 && box.height > 0 && tableStyle.display !== 'none' && tableStyle.visibility !== 'hidden' && rows.length > 1 && rows.length <= args.shadowLimits.rows + 1
            for (let index = 0; supported && index < rows.length; index++) {
              if (performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; supported = false; break }
              const row = rows[index]!
              const rowBox = row.getBoundingClientRect()
              if (rowBox.width === 0 || rowBox.height === 0 || getComputedStyle(row).visibility === 'hidden') { supported = false; break }
              const cells = Array.from(row.querySelectorAll('[role="cell"],[role="columnheader"],[role="rowheader"]'))
              if (index === 0) {
                columns = cells.length
                if (columns > args.shadowLimits.columns) { shadowTables.outcome = 'column_cap'; supported = false; break }
                supported = columns >= 2 && columns <= args.shadowLimits.columns &&
                  (row.getAttribute('part')?.split(/\s+/).includes('table-header-row') === true || cells.every(cell => cell.getAttribute('role') === 'columnheader'))
                const declared = table.getAttribute('aria-colcount')
                if (declared !== null && Number(declared) !== columns) supported = false
              }
              if (!supported || cells.length !== columns) { supported = false; break }
              const tr = document.createElement('tr')
              let complete = true
              for (let column = 0; column < cells.length; column++) {
                const cell = cells[column]!
                const position = cell.getAttribute('aria-colindex')
                if (cell.closest('[role="row"]') !== row || cell.childElementCount !== 0 ||
                  (cell.getAttribute('aria-colspan') ?? '1') !== '1' || (cell.getAttribute('aria-rowspan') ?? '1') !== '1' ||
                  (position !== null && Number(position) !== column + 1)) { supported = false; break }
                const cellBox = cell.getBoundingClientRect()
                const cellStyle = getComputedStyle(cell)
                if (cellBox.width === 0 || cellBox.height === 0 || cellStyle.visibility === 'hidden' || cellStyle.display === 'none') { supported = false; break }
                const text = (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
                if (!/[\p{L}\p{N}]/u.test(text)) complete = false
                if (index === 0 && text.length === 0) { supported = false; break }
                const td = document.createElement(index === 0 ? 'th' : 'td')
                td.textContent = text
                tr.appendChild(td)
              }
              materialized.appendChild(tr)
              if (index > 0) { dataRows++; if (complete) completeRows++ }
            }
            if (shadowTables.outcome !== 'none') break
            if (supported && completeRows > 0) {
              if (roots.length >= args.shadowLimits.tables) { shadowTables.outcome = 'table_cap'; break }
              // Bound strings before serializing a selected root. Non-table
              // components' styles are not serialized or charged to this cap.
              let rootChars = 0
              let children = 0
              for (const container of [shadow, ...rootElements]) {
                if (performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; break }
                if (container instanceof Element) {
                  if (container.attributes.length > 128) { shadowTables.outcome = 'element_cap'; break }
                  rootChars += container.localName.length * 2 + 5
                  for (const attribute of Array.from(container.attributes)) rootChars += attribute.name.length + attribute.value.length * 6 + 4
                }
                for (let childIndex = 0; childIndex < container.childNodes.length; childIndex++) {
                  const child = container.childNodes[childIndex]!
                  if (++children > args.shadowLimits.elements) { shadowTables.outcome = 'element_cap'; break }
                  if (child.nodeType !== Node.ELEMENT_NODE) rootChars += (child.nodeValue?.length ?? 0) * 6 + 7
                  if (rootChars + selectedChars + 128 > args.shadowLimits.html) { shadowTables.outcome = 'html_cap'; break }
                }
                if (shadowTables.outcome !== 'none') break
              }
              if (shadowTables.outcome !== 'none') break
              const path: number[] = []
              let ancestor: Element | null = host
              while (ancestor !== null && ancestor !== body) {
                if (path.length >= 128 || performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; break }
                let index = 0
                for (let sibling = ancestor.previousElementSibling; sibling !== null; sibling = sibling.previousElementSibling) {
                  if (++index % 128 === 0 && performance.now() - started > args.maxMs) { shadowTables.outcome = 'time_cap'; break }
                }
                path.unshift(index)
                ancestor = ancestor.parentElement
              }
              if (shadowTables.outcome !== 'none') break
              if (ancestor !== body) continue
              selectedChars += rootChars + 128
              roots.push(shadow)
              replacements.push({ template: host.getHTML({ serializableShadowRoots: false, shadowRoots: [shadow] }).trim(), hostPath: path, hostTag: host.localName, rows: Array.from(materialized.rows, row => Array.from(row.cells, cell => cell.textContent ?? '')) })
              shadowTables.tables++
              shadowTables.rows += dataRows
            }
          }
        }
      }
      host = hosts.nextNode() as Element | null
    }
  } else if (args.body.length > args.shadowLimits.html) shadowTables.outcome = 'html_cap'
  else shadowTables.outcome = 'unsupported_engine'

  let html: string
  let sourceHtml: string | undefined
  let shadowHtml: string | undefined
  let lightHtml: string
  for (const element of blocks) element.setAttribute(args.display, 'block')
  for (const element of hidden) element.setAttribute(args.hidden, '')
  try {
    lightHtml = doctype + root.outerHTML
    html = lightHtml
    if (roots.length > 0 && shadowTables.outcome === 'none') {
      // Native getHTML preserves each selected root as a declarative template.
      // At most two extra whole-document serializations. The conversion copy
      // is materialized structurally in one bounded parse after this read.
      const wrapper = (root.cloneNode(false) as Element).outerHTML.slice(0, -7)
      shadowHtml = doctype + wrapper + root.getHTML({ serializableShadowRoots: false, shadowRoots: roots }) + '</html>'
    }
  } finally {
    for (const element of blocks) element.removeAttribute(args.display)
    for (const element of hidden) element.removeAttribute(args.hidden)
  }
  if (roots.length > 0 && shadowTables.outcome === 'none') {
    const wrapper = (root.cloneNode(false) as Element).outerHTML.slice(0, -7)
    sourceHtml = doctype + wrapper + root.getHTML({ serializableShadowRoots: false, shadowRoots: roots }) + '</html>'
    for (let index = 0; index < replacements.length; index++) {
      if (roots[index]!.host.getHTML({ serializableShadowRoots: false, shadowRoots: [roots[index]!] }).trim() !== replacements[index]!.template) {
        shadowTables.outcome = 'serialization_mismatch'; break
      }
    }
    // Custom-element attribute reactions run synchronously. If applying or
    // restoring layout markers changed either tree, never mix those reads.
    if (doctype + root.outerHTML !== args.body) shadowTables.outcome = 'serialization_mismatch'
    if (shadowTables.outcome !== 'none') {
      sourceHtml = undefined
      html = lightHtml
    } else if (sourceHtml.length > args.shadowLimits.html || (shadowHtml?.length ?? 0) > args.shadowLimits.html) {
      sourceHtml = undefined
      html = lightHtml
      shadowTables.outcome = 'html_cap'
    } else if (performance.now() - started > args.maxMs) {
      sourceHtml = undefined
      html = lightHtml
      shadowTables.outcome = 'time_cap'
    } else shadowTables.outcome = 'captured'
  }
  if (shadowTables.outcome !== 'captured') { shadowTables.tables = 0; shadowTables.rows = 0 }
  return { outcome: 'annotated', html, ...(sourceHtml === undefined ? {} : { sourceHtml, shadowCapture: { html: shadowHtml!, tables: replacements.map(({ template: _template, ...table }) => table) } }), elements, blocks: blocks.length, hidden: hidden.length, pageMs: performance.now() - started, shadowTables }
}

/**
 * The page's own layout, captured for conversion only.
 *
 * The converter lays HTML out by its tags; a page's CSS can differ (a <span>
 * shown as a block, a platform name hidden with display: none). Given the
 * settled page and `body`, the page.content() the caller already hashed as
 * evidence, this reads the computed style of each element the converter
 * would lay out inline and returns a copy with extract-tf's LAYOUT_MARKERS.
 * Supported visible shadow tables also get a native declarative source
 * snapshot and one structurally materialized conversion copy. The layout
 * markers are removed before the source is serialized and never reach it.
 *
 * The cost is bounded: past maxElements, past maxMs of in-page work, or past
 * the time left, the capture returns no copy and says why, and the caller
 * converts `body` unannotated.
 */
export async function captureLayout(page: Page, body: string, options: LayoutOptions = {}): Promise<LayoutCapture> {
  const started = performance.now()
  const ms = () => Math.round(performance.now() - started)
  const budget = options.deadlineAt === undefined ? LAYOUT_TIMEOUT_MS : Math.min(LAYOUT_TIMEOUT_MS, options.deadlineAt - Date.now())
  if (budget <= 0) return { html: null, detail: { outcome: 'deadline', ms: ms() } }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const pending = page.evaluate(annotate, {
      body,
      display: LAYOUT_MARKERS.display,
      hidden: LAYOUT_MARKERS.hidden,
      blockTags: LAYOUT_MARKERS.blockTags,
      skipTags: LAYOUT_MARKERS.skipTags,
      maxElements: options.maxElements ?? LAYOUT_MAX_ELEMENTS,
      maxMs: Math.min(options.maxMs ?? LAYOUT_MAX_MS, budget),
      shadowLimits: { ...SHADOW_TABLE_LIMITS, roots: options.maxShadowRoots ?? SHADOW_TABLE_LIMITS.roots, elements: options.maxShadowElements ?? SHADOW_TABLE_LIMITS.elements, html: options.maxShadowHtml ?? SHADOW_TABLE_LIMITS.html },
    })
    // A capture abandoned at the timeout may still fail when the page closes.
    pending.catch(() => {})
    const result = await Promise.race([pending, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), budget) })])
    if (result === null) return { html: null, detail: { outcome: 'timeout', ms: ms() } }
    const { html, sourceHtml, shadowCapture, pageMs, ...counts } = result
    const materialized = shadowCapture === undefined ? null : materializeShadowTables(shadowCapture.html, shadowCapture.tables)
    const accepted = shadowCapture !== undefined && materialized !== null && ms() <= budget
    if (accepted && counts.shadowTables !== undefined) counts.shadowTables.hosts = shadowCapture.tables.map(table => ({ path: table.hostPath, tag: table.hostTag, rows: table.rows.length - 1, columns: table.rows[0]!.length }))
    if (shadowCapture !== undefined && !accepted && counts.shadowTables !== undefined) counts.shadowTables = { ...counts.shadowTables, outcome: materialized === null ? 'serialization_mismatch' : 'time_cap', tables: 0, rows: 0 }
    return { html: result.outcome === 'annotated' ? accepted ? materialized : html ?? null : null, ...(!accepted || sourceHtml === undefined ? {} : { sourceHtml }), detail: { ...counts, pageMs: Math.round(pageMs), ms: ms() } }
  } catch (error) {
    return { html: null, detail: { outcome: 'error', ms: ms(), error: (error instanceof Error ? error.message : String(error)).slice(0, 200) } }
  } finally {
    clearTimeout(timer)
  }
}
