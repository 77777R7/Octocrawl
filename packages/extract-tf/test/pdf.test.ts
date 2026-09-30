import { describe, expect, it } from 'vitest'
import { extractPdfText, linesOf, pdfMarkdown, PdfParseError } from '../src/pdf.js'

/** The smallest PDF with one line of Helvetica text, built by hand so the loader is exercised end to end. */
function onePagePdf(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => { offsets.push(out.length); out += `${index + 1} 0 obj\n${body}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

describe('linesOf', () => {
  it('ends a line on hasEOL and separates items on one line by a space only across a gap', () => {
    const items = [
      { str: 'Station', transform: [12, 0, 0, 12, 72, 704], width: 40, hasEOL: false },
      { str: '1.10', transform: [12, 0, 0, 12, 192, 704], width: 24, hasEOL: true },
      { str: 'Ravine ga', transform: [12, 0, 0, 12, 72, 688], width: 50, hasEOL: false },
      { str: 'uge', transform: [12, 0, 0, 12, 122, 688], width: 20, hasEOL: true },
      { type: 'beginMarkedContent' },
      { str: '', hasEOL: true },
      { str: 'Notes', transform: [12, 0, 0, 12, 72, 660], width: 30, hasEOL: true },
    ]
    expect(linesOf(items)).toBe('Station 1.10\nRavine gauge\n\nNotes')
  })
})

describe('pdfMarkdown', () => {
  it('marks every page so a value can be cited to it', () => {
    expect(pdfMarkdown({ pages: 2, texts: ['First', 'Second'], textPages: 2, textChars: 11 })).toBe('<!-- page 1 -->\nFirst\n\n<!-- page 2 -->\nSecond')
  })
})

describe('extractPdfText', () => {
  it('reads the text layer of a real PDF and counts its pages', async () => {
    const text = await extractPdfText(onePagePdf('Harbour ledger 2024'))
    expect(text).toEqual({ pages: 1, texts: ['Harbour ledger 2024'], textPages: 1, textChars: 17 })
  })

  it('names a file that is not a PDF instead of guessing at it', async () => {
    await expect(extractPdfText(new TextEncoder().encode('not a pdf at all'))).rejects.toBeInstanceOf(PdfParseError)
  })
})
