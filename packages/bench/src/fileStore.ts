import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/**
 * Where files (PDF, CSV, ...) are saved as received: `<dir>/<sha256>.<ext>`,
 * so the same bytes are stored once however many URLs served them. The API
 * keeps it at `<task root>/files`. A file is written under a temporary name
 * and renamed, so a name that exists always holds the whole file.
 */
export class FileStore {
  readonly dir: string

  constructor(dir: string) {
    this.dir = resolve(dir)
  }

  /** Saves the bytes whose SHA-256 is `sha256`; returns the absolute path. */
  async save(bytes: Uint8Array, sha256: string, extension: string): Promise<string> {
    if (!/^[0-9a-f]{64}$/.test(sha256) || !/^[a-z0-9]+$/.test(extension)) throw new Error('file store: invalid name')
    const path = join(this.dir, `${sha256}.${extension}`)
    const existing = await stat(path).catch(() => null)
    if (existing?.isFile() && existing.size === bytes.byteLength) return path
    await mkdir(this.dir, { recursive: true })
    const partial = `${path}.${randomUUID()}.partial`
    try {
      await writeFile(partial, bytes)
      await rename(partial, path)
    } finally {
      await rm(partial, { force: true })
    }
    return path
  }
}
