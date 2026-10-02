import test from 'node:test'
import assert from 'node:assert/strict'
import { passed, summarize, verdict } from './check-amazon-state.mjs'

const complete = { status: 'success', product: { status: 'complete', region: 'Singapore 238823', currency: 'SGD' } }
const expired = { status: 'incomplete', reason: 'We could not verify delivery to Singapore 238823 on this page.', diagnostic: { code: 'region_unverified' }, product: { status: 'incomplete', region: null, currency: 'SGD' } }
const unavailable = { status: 'incomplete', diagnostic: { code: 'quote_absent_observed' }, product: { status: 'incomplete', region: 'Singapore 238823', currency: 'SGD' } }

test('one complete product is enough, so a single unavailable product raises no alarm', () => {
  const results = [summarize('A', unavailable), summarize('B', complete)]
  assert.equal(passed(results[1]), true)
  assert.equal(verdict(results).ok, true)
})

test('every product without a verified region points at the expired state', () => {
  const result = verdict([summarize('A', expired), summarize('B', expired)])
  assert.equal(result.ok, false)
  assert.match(result.message, /state has most likely expired/)
})

test('failures for other reasons fail without blaming the state', () => {
  const result = verdict([summarize('A', expired), summarize('B', unavailable)])
  assert.equal(result.ok, false)
  assert.match(result.message, /not all for a region or currency reason/)
  assert.equal(verdict([summarize('A', null)]).ok, false)
})

test('a complete product without SGD or a region does not pass', () => {
  assert.equal(passed(summarize('A', { status: 'success', product: { status: 'complete', region: null, currency: 'SGD' } })), false)
  assert.equal(passed(summarize('A', { status: 'success', product: { status: 'complete', region: 'Singapore 238823', currency: 'USD' } })), false)
})
