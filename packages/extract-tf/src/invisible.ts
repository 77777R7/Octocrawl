/**
 * Characters a page carries that show nothing and take no room: zero-width space, non-joiner and joiner, the word
 * joiner and the byte-order mark. JavaScript's `\s` and `trim()` keep them, so a page made of them alone (Temu's
 * verification page on 2026-10-12, 300 zero-width spaces and no other text) would count as text. They are left out of
 * the counts and emptiness checks, never out of the Markdown itself.
 */
export const INVISIBLE_CHARS = /[​-‍⁠﻿]/g

/** The text without its invisible characters, whitespace collapsed and trimmed. */
export function visibleText(text: string): string {
  return text.replace(INVISIBLE_CHARS, '').replace(/\s+/g, ' ').trim()
}
