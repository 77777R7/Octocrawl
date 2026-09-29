import { describe, expect, it } from 'vitest'
import { readNumber, type NumberContext } from '../src/numbers.js'

const value = (text: string, context?: NumberContext): number | string => {
  const reading = readNumber(text, context)
  return 'value' in reading ? reading.value : reading.reason
}

describe('readNumber: a number as the page writes it', () => {
  it('reads a decimal comma or point, with the currency before or after', () => {
    for (const [text, number] of [
      ['12,99 €', 12.99], ['€12,99', 12.99], ['€ 12,99', 12.99], ['12,99', 12.99], ['0,99 €', 0.99], ['£51.77', 51.77], ['84.00 EUR', 84],
      ['EUR 12,5', 12.5], ['12,99 zł', 12.99], ['12,50 kr', 12.5], ['R$ 1.299,90', 1299.9], ['$12.99 USD', 12.99], ['0', 0], ['2345', 2345],
    ] as const) expect(value(text), text).toBe(number)
  })

  it('reads thousands grouped by a point, a comma, any space or an apostrophe, and India lakh groups', () => {
    for (const [text, number] of [
      ['1.299,00 €', 1299], ['$1,299.00', 1299], ['1 299,00 €', 1299], ['1 299,00 €', 1299], ['1 299,00 €', 1299], ['1 299 kr', 1299],
      ["1'299.00 CHF", 1299], ['CHF 1’299.50', 1299.5], ['₹1,29,999.00', 129999], ['1,29,999', 129999], ['1.234.567', 1234567], ['1,234,567', 1234567],
      ['1 234 567', 1234567], ['10 000 Kč', 10000], ['1.299,5', 1299.5],
    ] as const) expect(value(text), text).toBe(number)
  })

  it('reads a dash for the minor units as a whole amount', () => {
    for (const [text, number] of [['1.299,- €', 1299], ['1.299,– €', 1299], ["CHF 1'299.–", 1299], ['12,-', 12], ['€ 12,--', 12], ['1,299.-', 1299]] as const) {
      expect(value(text), text).toBe(number)
    }
  })

  it('keeps one sign, before or after the currency', () => {
    for (const [text, number] of [['-12,50 €', -12.5], ['€-12.50', -12.5], ['− 3', -3], ['-€1.299,00', -1299]] as const) expect(value(text), text).toBe(number)
    expect(value('--3')).toBe('not_a_number')
    expect(value('-€-3')).toBe('not_a_number')
  })

  it('reads a lone separator as decimal where three grouped digits cannot follow it', () => {
    for (const [text, number] of [['1234,567', 1234.567], ['0,299', 0.299], ['0.500', 0.5], ['12.9999', 12.9999], ['1,5', 1.5]] as const) {
      expect(value(text), text).toBe(number)
    }
  })

  it('does not settle a lone separator before three digits from the text alone', () => {
    for (const text of ['1.299 €', '$1,299', '1,299', '1.299', '12.345', '999,000', '€ 1.299']) {
      expect(readNumber(text), text).toEqual({ reason: 'unsettled', message: expect.stringMatching(/^"[.,]" before three digits can separate thousands or decimals, and nothing on the page says which$/) })
    }
  })

  it('settles it only from what the value is', () => {
    // A count is whole.
    expect(value('1.234', { count: true })).toBe(1234)
    expect(value('1,234', { count: true })).toBe(1234)
    expect(value('1 234', { count: true })).toBe(1234)
    expect(value('4.5', { count: true })).toBe('not_whole')
    // A currency without minor units, in the text or stated by the page.
    expect(value('JPY 1,299')).toBe(1299)
    expect(value('₩1.299')).toBe(1299)
    expect(value('1,299円')).toBe(1299)
    expect(value('1.299', { currency: 'JPY' })).toBe(1299)
    expect(value('1.299', { currency: 'EUR' })).toBe('unsettled')
    // JSON-LD and OpenGraph write "." as the decimal point; a comma there settles nothing.
    expect(value('1.299', { decimalPoint: true })).toBe(1.299)
    expect(value('1,299', { decimalPoint: true })).toBe('unsettled')
    expect(value('19.00', { decimalPoint: true })).toBe(19)
  })

  it('reads nothing from text that is not one amount', () => {
    for (const text of [
      '', 'In stock (22 available)', '4.7 out of 5', 'HL-1', 'https://shop.example/lamp/2', 'Call for price', '1.2.3', '12 99 €', '1.299.00', '1,2,3',
      '1.299,00,00', '1 299.000,00', '€€12', '€12 $', 'EUR 12 USD', '12 €*', 'ab 12,99 €', '.99', '12,99 Stück', '1'.repeat(65),
    ]) expect(value(text), text).toBe('not_a_number')
  })
})
