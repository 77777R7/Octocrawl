import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { captureArtifact, captureRawHtml } from '../src/rawArtifact.js'

const previous = process.env.W2L_CAPTURE_RAW_DIR
let root: string | null = null

afterEach(async () => {
  if (previous === undefined) delete process.env.W2L_CAPTURE_RAW_DIR
  else process.env.W2L_CAPTURE_RAW_DIR = previous
  if (root) await rm(root, { recursive: true, force: true })
  root = null
})

describe('raw HTML baseline artifacts', () => {
  it('is opt-in and deduplicates snapshots by body hash', async () => {
    delete process.env.W2L_CAPTURE_RAW_DIR
    expect(await captureRawHtml('<html>subject</html>', 'abc')).toEqual([])
    root = await mkdtemp(join(tmpdir(), 'w2l-raw-'))
    process.env.W2L_CAPTURE_RAW_DIR = root
    const first = await captureRawHtml('<html>subject</html>', 'abc')
    const second = await captureRawHtml('<html>subject</html>', 'abc')
    expect(first).toEqual([join(root, 'abc.html')])
    expect(second).toEqual(first)
    expect(await readFile(first[0]!, 'utf8')).toBe('<html>subject</html>')
  })

  it('writes a screenshot\'s bytes under the same root as <sha256>.png or .jpg, and nothing without the root', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    delete process.env.W2L_CAPTURE_RAW_DIR
    expect(await captureArtifact(bytes, 'def', 'png')).toEqual([])
    root = await mkdtemp(join(tmpdir(), 'w2l-raw-'))
    process.env.W2L_CAPTURE_RAW_DIR = root
    expect(await captureArtifact(bytes, 'def', 'png')).toEqual([join(root, 'def.png')])
    expect(await captureArtifact(bytes, 'def', 'jpg')).toEqual([join(root, 'def.jpg')])
    expect(new Uint8Array(await readFile(join(root, 'def.png')))).toEqual(bytes)
  })
})
