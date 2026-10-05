import { afterEach, describe, expect, it } from 'vitest'
import { buildChannels } from '../src/ladderCli.js'

const saved = { bb: process.env.BROWSERBASE_API_KEY, steel: process.env.STEEL_API_KEY, vendors: process.env.W2L_VENDORS }
afterEach(() => {
  for (const [name, value] of [['BROWSERBASE_API_KEY', saved.bb], ['STEEL_API_KEY', saved.steel], ['W2L_VENDORS', saved.vendors]] as const) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const vendors = (mode: 'research' | 'authed') => buildChannels(mode, {}).map((channel) => channel.vendorId).filter((id) => id !== undefined)

/** A paid browser service is used when the person names it in W2L_VENDORS, not because its key happens to be in the shell. */
describe('vendor lanes', () => {
  it('are not built from a key in the environment alone', () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key'
    process.env.STEEL_API_KEY = 'steel-key'
    delete process.env.W2L_VENDORS
    expect(vendors('research')).toEqual([])
    expect(vendors('authed')).toEqual([])
  })

  it('are built for the vendors W2L_VENDORS names, with their keys', () => {
    process.env.BROWSERBASE_API_KEY = 'bb-key'
    process.env.STEEL_API_KEY = 'steel-key'
    process.env.W2L_VENDORS = ' Browserbase '
    expect(vendors('research')).toEqual(['browserbase'])
    process.env.W2L_VENDORS = 'browserbase,steel'
    expect(vendors('research').sort()).toEqual(['browserbase', 'steel'])
    // Named without its key, a vendor has nothing to bill.
    delete process.env.STEEL_API_KEY
    expect(vendors('research')).toEqual(['browserbase'])
  })

  it('still take a key passed in the options', () => {
    delete process.env.W2L_VENDORS
    expect(buildChannels('research', { keys: { steel: 'k' } }).map((channel) => channel.vendorId).filter((id) => id !== undefined)).toEqual(['steel'])
  })
})
