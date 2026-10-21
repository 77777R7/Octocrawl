/**
 * Whether a source's text is its statement that there is no value: the whole
 * text is a word for "none" or "not available" (`N/A`, `None`, `无`), not a
 * value that happens to contain one ("None of the above", "Not available in
 * red"). A dash or an empty cell is not such a statement: a table writes `–`
 * for zero, for "same as above" and for "not applicable" alike.
 */
const ABSENCE = new RegExp(`^(?:${[
  'n/a', 'n\\.\\s?a\\.?', 'none', 'nil', 'not available', 'not applicable', 'no data',
  'k\\.\\s?a\\.?', 'keine angaben?', 'entfällt', 'nicht verfügbar',
  'non disponible', 'sans objet', 'néant', 'aucun(?:e)?',
  'no disponible', 'ninguno', 'sin datos',
  '无', '暂无', '不适用', '没有', 'なし', '該当なし',
].join('|')})\\.?$`, 'iu')

export function statesAbsence(text: string): boolean {
  return ABSENCE.test(text.replace(/\s+/g, ' ').trim())
}
