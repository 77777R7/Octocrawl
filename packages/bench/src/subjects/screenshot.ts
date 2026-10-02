import { createHash } from 'node:crypto'
import type { Page } from 'playwright'
import {
  identityBundleFrom,
  identityBundleIssues,
  type BrowserFingerprint,
  type ExecutionContext,
  type FetchWarning,
  type ModeIdentity,
  type ScreenshotEvidence,
  type ScreenshotOptions,
  type ScreenshotViewport,
  type TraceEvent,
} from '@w2l/contracts'
import { remainingTimeout } from '@w2l/http-core'
import { captureArtifact } from '../rawArtifact.js'

/** Time one capture may take on its own, within the fetch's deadline. */
export const SCREENSHOT_TIMEOUT_MS = 30_000

/**
 * The window the browser context opens for a screenshot request: the
 * viewport asked for when it fits the declared identity (the screen is at
 * least the viewport, which identityBundleIssues checks for every bundle),
 * else the declared one with the issues named, so the capture can say why
 * it did not take the viewport. Nothing else in the identity changes: a
 * window size within the declared screen is not a retune of the identity.
 */
export function screenshotViewport(request: ScreenshotOptions | undefined, identity: ModeIdentity, fingerprint: Readonly<BrowserFingerprint>): { viewport: ScreenshotViewport; issues: readonly string[] } {
  const asked = request?.viewport
  if (asked === undefined) return { viewport: fingerprint.viewport, issues: [] }
  const issues = identityBundleIssues({ ...identityBundleFrom(identity, fingerprint), viewport: asked })
  return { viewport: issues.length === 0 ? asked : fingerprint.viewport, issues }
}

/**
 * Width and height read from the image's own bytes: a PNG's IHDR chunk, or
 * a JPEG's first frame header (SOF). Null when neither is found.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // PNG: the 8-byte signature, then the IHDR chunk, whose width and height start at byte 16.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  // JPEG: FF D8, then segments of FF <marker> <big-endian length>; a SOFn segment (C0..CF but C4, C8 and CC) holds the frame's height and width after its precision byte.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]!
      // Fill bytes and the markers that carry no length.
      if (marker === 0xff) { offset += 1; continue }
      if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      }
      offset += 2 + view.getUint16(offset + 2)
    }
  }
  return null
}

export interface ScreenshotCapture {
  /** The capture, or null when it failed (the trace's `screenshot_failed` event says why). */
  screenshot: ScreenshotEvidence | null
  /** The file written under W2L_CAPTURE_RAW_DIR, for `evidence.artifacts`; empty otherwise. */
  artifacts: readonly string[]
  /** The caveat a failed capture puts on the result. */
  warning?: FetchWarning
}

/**
 * The page as it is now, as an image: `page.screenshot` with `scale: 'css'`,
 * so the image is CSS-pixel sized (the viewport's size, or the viewport's
 * width and the document's height with `fullPage`) whatever the declared
 * device scale factor; a PNG unless `quality` asks for a JPEG. The bytes are
 * hashed, written under W2L_CAPTURE_RAW_DIR when that is set, and carried
 * inline as base64. A capture that fails (Chromium's refusal, its timeout, a
 * viewport the identity cannot take) leaves the page result standing: null,
 * a `screenshot_failed` trace event and a `screenshot_unavailable` warning.
 * A fetch stopped meanwhile is not caught here.
 */
export async function captureScreenshot(
  page: Page,
  request: ScreenshotOptions,
  viewport: ScreenshotViewport,
  deviceScaleFactor: number,
  execution: ExecutionContext,
  trace: TraceEvent[],
  at: () => number,
  refusal: string | null = null,
): Promise<ScreenshotCapture> {
  const fullPage = request.fullPage === true
  const quality = request.quality ?? null
  const contentType = quality === null ? 'image/png' as const : 'image/jpeg' as const
  const failed = (error: string): ScreenshotCapture => {
    trace.push({ at: at(), lane: 'browser_local', event: 'screenshot_failed', detail: { fullPage, viewport, contentType, quality, error } })
    return {
      screenshot: null,
      artifacts: [],
      warning: { code: 'screenshot_unavailable', message: `The browser lane rendered the page but could not capture the requested screenshot (${error}); the page result stands without it.` },
    }
  }
  if (refusal !== null) return failed(refusal)
  const timeout = remainingTimeout(execution, SCREENSHOT_TIMEOUT_MS)
  const started = performance.now()
  let buffer: Buffer
  try {
    buffer = await page.screenshot({ fullPage, type: quality === null ? 'png' : 'jpeg', ...(quality === null ? {} : { quality }), scale: 'css', timeout })
  } catch (error) {
    if (execution.signal?.aborted) throw error
    return failed(error instanceof Error ? error.message.slice(0, 200) : String(error))
  }
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const size = imageSize(bytes)
  if (size === null) return failed(`Chromium returned ${bytes.byteLength} bytes that are not a ${contentType} image`)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const artifacts = await captureArtifact(bytes, sha256, quality === null ? 'png' : 'jpg')
  const captureMs = Math.round(performance.now() - started)
  const screenshot: ScreenshotEvidence = {
    contentType,
    width: size.width,
    height: size.height,
    fullPage,
    viewport,
    deviceScaleFactor,
    quality,
    bytes: bytes.byteLength,
    sha256,
    path: artifacts[0] ?? null,
    base64: buffer.toString('base64'),
  }
  trace.push({
    at: at(),
    lane: 'browser_local',
    event: 'screenshot_captured',
    detail: { fullPage, viewport, scale: 'css', deviceScaleFactor, contentType, quality, width: size.width, height: size.height, bytes: bytes.byteLength, sha256, captureMs, ...(artifacts.length === 0 ? {} : { path: artifacts[0] }) },
  })
  return { screenshot, artifacts }
}
