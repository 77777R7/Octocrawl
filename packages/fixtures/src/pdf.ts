/**
 * A minimal, valid PDF for tests that serve a file: one Courier font and each
 * page's lines of text from the top. A page given as null has no text layer,
 * only a drawn rectangle, as a scanned page has only an image.
 */
export function textPdf(pages: ReadonlyArray<readonly string[] | null>, info: Readonly<Record<string, string>> = {}): Uint8Array {
  const literal = (text: string) => `(${text.replace(/[\\()]/g, '\\$&')})`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>']
  const kids = pages.map((lines) => {
    const content = lines === null
      ? '0.5 g 72 72 468 648 re f'
      : lines.map((line, i) => `BT /F1 10 Tf 72 ${720 - 12 * i} Td ${literal(line)} Tj ET`).join('\n')
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`)
    return objects.length
  })
  objects[1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let trailer = '/Root 1 0 R'
  if (Object.keys(info).length > 0) {
    objects.push(`<< ${Object.entries(info).map(([key, value]) => `/${key} ${literal(value)}`).join(' ')} >>`)
    trailer += ` /Info ${objects.length} 0 R`
  }
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, index) => {
    const at = out.length
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(out, (char) => char.charCodeAt(0))
}
