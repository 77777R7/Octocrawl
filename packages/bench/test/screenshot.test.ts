import { describe, expect, it } from 'vitest'
import { BROWSER_FINGERPRINT, MOBILE_BROWSER_FINGERPRINT, modeIdentity } from '@w2l/contracts'
import { imageSize, screenshotViewport } from '../src/subjects/screenshot.js'

/** A PNG signature and IHDR chunk declaring the given size; the rest of the file is not read. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

/** A JPEG with an APP0 segment before its SOF0 frame header, as encoders write them. */
function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0, 4, 0x4a, 0x46]
  const sof0 = [0xff, 0xc0, 0, 11, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0])
}

describe('screenshot helpers', () => {
  it('reads the size of a PNG from its IHDR chunk and of a JPEG from its frame header, and nothing from other bytes', () => {
    expect(imageSize(png(1280, 800))).toEqual({ width: 1280, height: 800 })
    expect(imageSize(png(1280, 100_000))).toEqual({ width: 1280, height: 100_000 })
    expect(imageSize(jpeg(800, 600))).toEqual({ width: 800, height: 600 })
    expect(imageSize(new TextEncoder().encode('<html>not an image</html>'))).toBeNull()
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
  })

  it('takes a requested viewport within the declared screen as the window, and keeps the declared one, naming the issue, when it does not fit', () => {
    const desktop = modeIdentity('standard')
    expect(screenshotViewport(undefined, desktop, BROWSER_FINGERPRINT)).toEqual({ viewport: { width: 1280, height: 800 }, issues: [] })
    expect(screenshotViewport({ viewport: { width: 1920, height: 1080 } }, desktop, BROWSER_FINGERPRINT)).toEqual({ viewport: { width: 1920, height: 1080 }, issues: [] })
    const mobile = screenshotViewport({ viewport: { width: 1280, height: 800 } }, modeIdentity('standard', undefined, null, null, 'mobile'), MOBILE_BROWSER_FINGERPRINT)
    expect(mobile.viewport).toEqual({ width: 412, height: 915 })
    expect(mobile.issues).toEqual(['screen 412x915 smaller than viewport 1280x800'])
  })
})
