/** What the reader has chosen on /scrape/, shared by the parts that follow it: the format shown in the hero, the scope
 * in Clean Markdown, and the fields in Checked fields (once touched). The code section writes the call they add up to. */

export type View = 'markdown' | 'links' | 'table' | 'fields' | 'evidence'
export type Choice = { view: View; whole: boolean; fields: readonly string[]; fieldsTouched: boolean }

let choice: Choice = { view: 'markdown', whole: false, fields: ['title', 'price'], fieldsTouched: false }
const listeners = new Set<(choice: Choice) => void>()

export const current = (): Choice => choice
export function choose(change: Partial<Choice>): void {
  choice = { ...choice, ...change }
  for (const listener of listeners) listener(choice)
}
export function follow(listener: (choice: Choice) => void): void {
  listeners.add(listener)
  listener(choice)
}
