import { expect, it } from 'vitest'
import { variantListingFixture } from '@w2l/fixtures'
import { parse } from '../src/dom.js'
import { restoreVariantLinks } from '../src/variantLinks.js'

it('reconciles a large card list in one parsed document with bounded per-card declarations', () => {
  const seed = variantListingFixture().split('<section>')[1]!.split('</section>')[0]!
  const run = (n: number): number => {
    const doc = parse(`<main>${seed.repeat(n)}</main>`)
    const start = performance.now()
    restoreVariantLinks(doc.document, 'https://shop.fixture.test/listing')
    const elapsed = performance.now() - start
    expect(doc.document.querySelectorAll('a[href*="variationId="]')).toHaveLength(n * 4)
    doc.close()
    return elapsed
  }
  run(40)
  let small = Infinity, large = Infinity
  for (let i = 0; i < 3; i++) {
    small = Math.min(small, run(40))
    large = Math.min(large, run(160))
  }
  // Four times the source may cost overhead above linear, not pairwise work.
  expect(large / small).toBeLessThan(10)
})
