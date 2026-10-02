import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The files W2L_CAPTURE_RAW_DIR takes: a page's HTML, and the screenshot format's PNG or JPEG. */
export type ArtifactExtension = 'html' | 'png' | 'jpg'

/**
 * Opt-in capture of what a lane received or produced, for reproducible
 * baselines and evidence: written once under W2L_CAPTURE_RAW_DIR as
 * `<sha256>.<ext>` (a second capture of the same bytes finds the file there)
 * and returned as the artifact's path. Nothing is written and nothing is
 * returned when the variable is unset.
 */
export async function captureArtifact(body: string | Uint8Array, sha256: string, ext: ArtifactExtension): Promise<readonly string[]> {
  const root = process.env.W2L_CAPTURE_RAW_DIR?.trim()
  if (!root) return []
  await mkdir(root, { recursive: true })
  const path = join(root, `${sha256}.${ext}`)
  try { await writeFile(path, body, { flag: 'wx' }) } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
  }
  return [path]
}

/** A page's raw HTML, as the lanes have always captured it. */
export function captureRawHtml(body: string, sha256: string): Promise<readonly string[]> {
  return captureArtifact(body, sha256, 'html')
}
