import { describe, expect, it } from 'vitest'
import { extractTf, htmlToMarkdown, htmlToTables } from '../src/index.js'

// CoinGecko's change cells (dev set D09) draw the minus as an empty caret icon and state the signed value only in the
// cell's sort key. The rule below is not CoinGecko's markup: any table cell whose sort key is negative and whose shown
// value is one unsigned percentage after an empty down caret.
function wrapped(value: string, sort = '-1.25', icon = '<i class="fas fa-caret-down"></i>'): string {
  return `<td data-percent-change-sort="true" data-sort="${sort}"><span data-percent-change-target="percent">${icon}${value}</span></td>`
}
function direct(value: string, sort = '-1.25', icon = '<i class="fa fa-caret-down"></i>'): string {
  return `<td data-sort="${sort}">${icon}${value}</td>`
}
function table(cells: string): string {
  return `<table><tr><th>Change</th></tr><tr>${cells}</tr></table>`
}

describe('percent direction in final text and table cells', () => {
  it.each([
    ['in a wrapper (CoinGecko)', wrapped('1.3%')],
    ['directly in the cell', direct('1.3%')],
  ])('keeps a down caret corroborated by a negative sort key as a minus, %s, at the displayed precision', (_label, cells) => {
    expect(htmlToMarkdown(table(cells))).toContain('| -1.3% |')
    expect(htmlToTables(table(cells))[0]?.rows[1]).toEqual(['-1.3%'])
  })

  it('retains directions through cleaning and main-content selection', () => {
    const html = `<html><body><main><h1>Changes</h1>${table(wrapped('1.3%') + direct('0.5%', '-0.46'))}</main></body></html>`
    const extracted = extractTf.extract(html, { url: 'https://percent.fixture.test/', includeSelectors: ['main'] })
    expect(htmlToMarkdown(extracted.mainHtml)).toContain('| -1.3% | -0.5% |')
    expect(htmlToTables(extracted.mainHtml)[0]?.rows[1]).toEqual(['-1.3%', '-0.5%'])
  })

  it.each([
    ['positive', wrapped('1.3%', '1.25', '<i class="fas fa-caret-up"></i>'), '1.3%'],
    ['zero', wrapped('0.0%', '0'), '0.0%'],
    ['rounded zero', wrapped('0.0%', '-0.0002'), '0.0%'],
    ['literal minus', wrapped('-1.3%'), '-1.3%'],
    ['Unicode minus', wrapped('−1.3%'), '−1.3%'],
    ['literal plus', wrapped('+1.3%'), '+1.3%'],
    ['missing signed source', wrapped('1.3%', ''), '1.3%'],
    ['contradictory source', wrapped('1.3%', '1.25'), '1.3%'],
    ['contradictory source, direct', direct('1.3%', '1.25'), '1.3%'],
    ['invalid source', wrapped('1.3%', '-1oops'), '1.3%'],
    ['sort key on another element', '<td><span data-sort="-1.25"><i class="fa-caret-down"></i>1.3%</span></td>', '1.3%'],
    ['caret outside a table cell', '<td><div data-sort="-1.25"><i class="fa-caret-down"></i>1.3%</div></td>', '1.3%'],
    ['colour only', wrapped('1.3%', '-1.25', '').replace('<span ', '<span class="red gecko-down" '), '1.3%'],
    ['ordinary arrow', wrapped('1.3%', '-1.25', '<i class="arrow-down"></i>'), '1.3%'],
    ['suffix lookalike', wrapped('1.3%', '-1.25', '<i class="fa-caret-downward"></i>'), '1.3%'],
    ['conflicting carets', wrapped('1.3%', '-1.25', '<i class="fa-caret-down fa-caret-up"></i>'), '1.3%'],
    ['labelled icon', wrapped('1.3%', '-1.25', '<i class="fa-caret-down">sort</i>'), 'sort1.3%'],
    ['hidden icon', wrapped('1.3%', '-1.25', '<i class="fa-caret-down" data-w2l-hidden></i>'), '1.3%'],
    ['two carets', direct('1.3%', '-1.25', '<i class="fa-caret-down"></i><i class="fa-caret-down"></i>'), '1.3%'],
    ['multiple values', wrapped('1.3% 2.0%'), '1.3% 2.0%'],
    ['unrelated words', wrapped('discount 1.3%'), 'discount 1.3%'],
    ['not a percentage', direct('1.3'), '1.3'],
  ])('preserves the %s control', (_label, cells, expected) => {
    expect(htmlToTables(table(cells))[0]?.rows[1]).toEqual([expected])
    // Emphasis in a nonempty <i> is flattened in table cells.
    expect(htmlToMarkdown(table(cells))).toContain(`| ${expected} |`)
  })

  it('does not revive excluded or browser-hidden percent content', () => {
    const html = table(wrapped('1.3%').replace('<span ', '<span class="omit" '))
    expect(htmlToMarkdown(html, { exclude: ['.omit'] })).not.toContain('1.3%')
    expect(htmlToTables(html, { exclude: ['.omit'] })[0]?.rows[1]).toEqual([''])
    expect(htmlToMarkdown(table(wrapped('1.3%').replace('<span ', '<span data-w2l-hidden ')))).not.toContain('1.3%')
  })
})
