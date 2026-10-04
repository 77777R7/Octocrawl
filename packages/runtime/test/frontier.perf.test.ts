import { describe, expect, it } from 'vitest'
import { Frontier } from '../src/frontier.js'

// The seed is the site's root: by default a crawl stays in the seed's path subtree (see the subtree test).
const SEED = 'https://fixture.test/'

function seeded(overrides: ConstructorParameters<typeof Frontier>[0] = { seedUrl: SEED }): Frontier {
  const frontier = new Frontier({ seedUrl: SEED, ...overrides })
  const result = frontier.seed()
  expect(result.accepted).toBe(true)
  return frontier
}

describe('Frontier seed / enqueue / visited', () => {
  it('matches a catastrophic path filter against a crafted path in linear time', () => {
    // A backtracking engine takes about 2^n steps for ^/(a+)+$ on "/" + n × "a" + "!".
    const frontier = seeded({ seedUrl: SEED, excludePaths: ['^/(a+)+$'] })
    for (const length of [32, 100_000]) {
      const started = performance.now()
      expect(frontier.enqueue(`https://fixture.test/${'a'.repeat(length)}!`, 1).accepted).toBe(true)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
    expect(frontier.enqueue('https://fixture.test/aaaa', 1).reason).toBe('path_denied')
  })

  it('runs a filter the linear engine cannot run under a time limit, and skips the links it cannot decide', () => {
    const frontier = seeded({ seedUrl: SEED, includePaths: ['^/catalogue/(?!category/)[^/]+/index\\.html$'], excludePaths: ['^/(?!catalogue/)(a+)+$'] })
    expect(frontier.enqueue('https://fixture.test/catalogue/a-book_1/index.html', 1).accepted).toBe(true)
    expect(frontier.enqueue('https://fixture.test/catalogue/category/books_1/index.html', 1).reason).toBe('path_denied')
    const started = performance.now()
    expect(frontier.enqueue(`https://fixture.test/${'a'.repeat(40)}!`, 1).reason).toBe('path_undecided')
    // A filter that ran out of time decides nothing more, and does not run again.
    expect(frontier.enqueue('https://fixture.test/catalogue/b-book_2/index.html', 1).reason).toBe('path_undecided')
    expect(performance.now() - started).toBeLessThan(1_000)
    // A path longer than REGEX_SUBJECT_MAX_LENGTH is not run on the backtracking engine at all.
    const long = seeded({ seedUrl: SEED, includePaths: ['^/catalogue/(?!category/)[^/]+/index\\.html$'] })
    expect(long.enqueue(`https://fixture.test/catalogue/${'b'.repeat(3_000)}/index.html`, 1).reason).toBe('path_undecided')
    expect(long.enqueue('https://fixture.test/catalogue/c-book_3/index.html', 1).accepted).toBe(true)
  })
})
