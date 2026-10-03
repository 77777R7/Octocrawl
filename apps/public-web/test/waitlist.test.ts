import { describe, expect, it } from 'vitest'
import { WAITLIST_NEEDS, WAITLIST_ROLES } from '../../../packages/public-preview/src/waitlist.js'
import { pageMarkup } from '../src/page.js'
import { NEED_OPTIONS, ROLE_OPTIONS, waitlistMarkup } from '../src/waitlistMarkup.js'

describe('Waitlist form', () => {
  it('offers exactly the roles and needs the service accepts', () => {
    expect(ROLE_OPTIONS.map(([value]) => value)).toEqual([...WAITLIST_ROLES])
    expect(NEED_OPTIONS.map(([value]) => value)).toEqual([...WAITLIST_NEEDS])
  })

  it('is prerendered hidden on the home page, with the fields the service reads', () => {
    const form = waitlistMarkup()
    expect(pageMarkup()).toContain('id="waitlist"')
    expect(form).toMatch(/<div[^>]*id="waitlist"[^>]*hidden>/)
    for (const name of ['email', 'role', 'needs', 'useCase', 'website']) expect(form).toContain(`name="${name}"`)
    expect(form).toContain('href="/docs/privacy/#waitlist"')
  })
})
