import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Checks a presented bearer token against the accepted ones in time that does
 * not depend on how much of any token matches: both sides become fixed-length
 * SHA-256 digests, and every accepted digest is compared with timingSafeEqual,
 * without stopping at the first match.
 */
export function bearerTokenMatcher(tokens: readonly string[]): (presented: string) => boolean {
  const accepted = tokens.map(digest)
  return (presented) => {
    const candidate = digest(presented)
    let matched = false
    for (const token of accepted) matched = timingSafeEqual(candidate, token) || matched
    return matched
  }
}

function digest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}
