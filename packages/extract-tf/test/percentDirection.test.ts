import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown, htmlToTables } from '../src/index.js'

// Synthetic values use the percent component found in the retained source.
function cell(value: string, sort = '-1.25', icon = '<i class="fas fa-caret-down"></i>'): string {
  return `<td data-percent-change-sort="true" data-sort="${sort}"><span data-percent-change-target="percent">${icon}${value}</span></td>`
}
function table(cells: string): string {
  return `<table><tr><th>Change</th></tr><tr>${cells}</tr></table>`
}

describe('percent direction in final text and table cells', () => {
  it('keeps a corroborated downward caret as a minus without changing the displayed precision', () => {
    const html = table(cell('1.3%'))
    expect(htmlToMarkdown(html)).toContain('| -1.3% |')
    expect(htmlToTables(html)[0]?.rows[1]).toEqual(['-1.3%'])
  })

  it('retains directions through cleaning and main-content selection', () => {
    const html = `<html><body><main><h1>Changes</h1>${table(cell('1.3%') + cell('0.5%', '-0.46'))}</main></body></html>`
    const extracted = extractTf.extract(html, { url: 'https://percent.fixture.test/', includeSelectors: ['main'] })
    expect(htmlToMarkdown(extracted.mainHtml)).toContain('| -1.3% | -0.5% |')
    expect(htmlToTables(extracted.mainHtml)[0]?.rows[1]).toEqual(['-1.3%', '-0.5%'])
  })

  it.each([
    ['positive', cell('1.3%', '1.25', '<i class="fas fa-caret-up"></i>'), '1.3%'],
    ['zero', cell('0.0%', '0'), '0.0%'],
    ['rounded zero', cell('0.0%', '-0.0002'), '0.0%'],
    ['literal minus', cell('-1.3%'), '-1.3%'],
    ['Unicode minus', cell('−1.3%'), '−1.3%'],
    ['literal plus', cell('+1.3%'), '+1.3%'],
    ['missing signed source', cell('1.3%', ''), '1.3%'],
    ['contradictory source', cell('1.3%', '1.25'), '1.3%'],
    ['invalid source', cell('1.3%', '-1oops'), '1.3%'],
    ['arrow without value component', '<td data-sort="-1.25"><i class="fa-caret-down"></i>1.3%</td>', '1.3%'],
    ['colour only', cell('1.3%', '-1.25', '').replace('<span ', '<span class="red gecko-down" '), '1.3%'],
    ['ordinary arrow', cell('1.3%', '-1.25', '<i class="arrow-down"></i>'), '1.3%'],
    ['suffix lookalike', cell('1.3%', '-1.25', '<i class="fa-caret-downward"></i>'), '1.3%'],
    ['conflicting carets', cell('1.3%', '-1.25', '<i class="fa-caret-down fa-caret-up"></i>'), '1.3%'],
    ['labelled icon', cell('1.3%', '-1.25', '<i class="fa-caret-down">sort</i>'), 'sort1.3%'],
    ['hidden icon', cell('1.3%', '-1.25', '<i class="fa-caret-down" data-w2l-hidden></i>'), '1.3%'],
    ['multiple values', cell('1.3% 2.0%'), '1.3% 2.0%'],
    ['unrelated words', cell('discount 1.3%'), 'discount 1.3%'],
  ])('preserves the %s control', (_label, cells, expected) => {
    expect(htmlToTables(table(cells))[0]?.rows[1]).toEqual([expected])
    // Emphasis in a nonempty <i> is flattened in table cells.
    expect(htmlToMarkdown(table(cells))).toContain(`| ${expected} |`)
  })

  it('does not revive excluded or browser-hidden percent content', () => {
    const html = table(cell('1.3%').replace('<span ', '<span class="omit" '))
    expect(htmlToMarkdown(html, { exclude: ['.omit'] })).not.toContain('1.3%')
    expect(htmlToTables(html, { exclude: ['.omit'] })[0]?.rows[1]).toEqual([''])
    expect(htmlToMarkdown(table(cell('1.3%').replace('<span ', '<span data-w2l-hidden ')))).not.toContain('1.3%')
  })
})
