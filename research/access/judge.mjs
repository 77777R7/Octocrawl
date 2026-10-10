// How the access task runner judges a task's predicates against an API answer (research/access/run-set.mjs).
//
// Kept apart from the runner so the product's verifier (packages/runtime/src/verify.ts, ADR 0006) can be tested to give
// the same verdict on every predicate: a task sent as a `verify` contract is judged the same either way.

export const DATA_TYPES = new Set(['markdownIncludes', 'markdownMatches', 'markdownCountMin', 'minTables', 'listRecordsMin'])
export const isData = (p) => DATA_TYPES.has(p.type) || (p.type === 'field' && /^(json|list|tables)\b/.test(p.path))

export const get = (obj, path) => path.split('.').reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), obj)
export const gfmTableCount = (md) => (md.match(/^\|.*\|\s*\n\|\s*:?-{3,}/gm) ?? []).length

export function judge(p, doc) {
  const md = typeof doc.markdown === 'string' ? doc.markdown : ''
  switch (p.type) {
    case 'markdownIncludes': return md.includes(p.text)
    case 'markdownMatches': return new RegExp(p.pattern, p.flags ?? 'm').test(md)
    case 'markdownCountMin': return (md.match(new RegExp(p.pattern, (p.flags ?? '').replace('g', '') + 'g')) ?? []).length >= p.min
    case 'minTables': return gfmTableCount(md) >= p.min
    case 'listRecordsMin': { const r = get(doc, p.path ?? 'list.records'); return Array.isArray(r) && r.length >= p.min }
    case 'field': {
      const v = get(doc, p.path)
      if ('equals' in p) return v === p.equals
      if ('in' in p) return p.in.includes(v)
      if ('present' in p) return (v !== undefined && v !== null && v !== '') === p.present
      if ('min' in p || 'max' in p) return typeof v === 'number' && v >= (p.min ?? -Infinity) && v <= (p.max ?? Infinity)
      throw new Error(`field predicate on ${p.path} names no comparison`)
    }
    default: throw new Error(`unknown predicate type ${p.type}`)
  }
}
