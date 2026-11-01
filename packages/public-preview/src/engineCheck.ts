// Loads the whole reading engine: scripts/public-preview/bundle.mjs bundles it as an entry, imports it and runs
// engineSelfTest, so a bundle whose engine cannot load or read a PDF fails the build (and bundle.test.mjs).
import { pdfToMarkdown } from '@w2l/extract-tf'
import './preview.js'
import './map.js'

const SELF_TEST_TEXT = 'Octocrawl engine check'

/** A one-page PDF with SELF_TEST_TEXT, in Courier. */
function selfTestPdf(): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${SELF_TEST_TEXT}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, index) => {
    const at = out.length
    out += `${index + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(out, char => char.charCodeAt(0))
}

/** Reads a PDF with pdf.js, which loads its own files when first used: a bundle that took it in could not (2026-11-01). */
export async function engineSelfTest(): Promise<void> {
  const result = await pdfToMarkdown(selfTestPdf())
  if (!result.ok) throw new Error(`The engine could not read a PDF: ${result.error.code}: ${result.error.message}`)
  if (!result.markdown.includes(SELF_TEST_TEXT)) throw new Error(`The engine read a PDF without its text: ${JSON.stringify(result.markdown)}`)
}
