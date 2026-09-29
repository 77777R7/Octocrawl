/**
 * A static check for regular expressions a caller supplies and W2L runs, on
 * a backtracking engine, against text a web page controls: crawl
 * `includePaths` / `excludePaths`, and JSON Schema `pattern`. Such a pattern
 * can take time exponential or polynomial in the text's length (ReDoS).
 * `unsafeRegexReason` refuses the shapes that cause it:
 *
 * - a repeated group with a repeated or optional part inside, unless each
 *   repetition is delimited by a character none of those parts can match:
 *   `(a+)+`, `(\w+\s?)*` and `(.*,)*` are refused,
 *   `[a-z0-9]+(?:-[a-z0-9]+)*` is not;
 * - a repeated group whose alternatives can start with the same character:
 *   `(a|ab)*` and `(\d|\w)+` are refused, `(?:ab|cd)+` and `(?:[a-z]|-)+`
 *   are not;
 * - three or more variable parts in a row that can take the same characters,
 *   counting the start of an unanchored pattern, which is tried at every
 *   position: `.*a.*b`, `^\d+\d+\d+x` and `^a?a?a?aaa` are refused,
 *   `^.*a.*b`, `.*\.pdf$` and `.*blog.*` are not.
 *
 * A pattern it accepts backtracks at most quadratically in the text's
 * length, so a caller that runs it on the backtracking engine caps the text
 * at REGEX_SUBJECT_MAX_LENGTH characters (a few milliseconds per match). The
 * check reads JavaScript syntax and is conservative: what it cannot place (a
 * backreference, a Unicode property) counts as matching any character. It
 * assumes the pattern compiles; check that first.
 */

/** The longest text a pattern unsafeRegexReason accepts should be matched against on a backtracking engine. */
export const REGEX_SUBJECT_MAX_LENGTH = 2048

/** Why `pattern` can backtrack catastrophically, or null when it cannot. */
export function unsafeRegexReason(pattern: string): string | null {
  let alternatives: Term[][]
  try {
    const parser = new Parser(pattern)
    alternatives = parser.alternatives()
    if (parser.i < pattern.length) return 'it could not be analysed'
  } catch {
    return 'it could not be analysed'
  }
  for (const sequence of alternatives) {
    const reason = sequenceReason(sequence, !(sequence[0]?.node === '^'))
    if (reason !== null) return reason
  }
  return null
}

/** A set is its members as sorted, disjoint [low, high] code point ranges. */
type Leaf = { kind: 'char'; code: number } | { kind: 'set'; ranges: readonly (readonly [number, number])[] } | { kind: 'any' }
interface Group { kind: 'group'; alternatives: Term[][]; lookaround: boolean }
/** One element of a sequence; an assertion (^, $, \b) is its character as the node. */
interface Term { node: Leaf | Group | string; min: number; max: number }

const MAX_CODE = 0x10ffff
const ANY: Leaf = { kind: 'any' }
const char = (text: string): Leaf => ({ kind: 'char', code: text.charCodeAt(0) })

/** A set of the given ranges, sorted and merged. */
function set(ranges: readonly (readonly [number, number])[]): Leaf & { kind: 'set' } {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [low, high] of sorted) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && low <= previous[1] + 1) previous[1] = Math.max(previous[1], high)
    else merged.push([low, high])
  }
  return { kind: 'set', ranges: merged }
}

function complement(leaf: Leaf & { kind: 'set' }): Leaf & { kind: 'set' } {
  const ranges: [number, number][] = []
  let next = 0
  for (const [low, high] of leaf.ranges) {
    if (low > next) ranges.push([next, low - 1])
    next = high + 1
  }
  if (next <= MAX_CODE) ranges.push([next, MAX_CODE])
  return { kind: 'set', ranges }
}

const DIGIT = set([[48, 57]])
const WORD = set([[48, 57], [65, 90], [95, 95], [97, 122]])
const SPACE = set([[9, 13], [32, 32], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000], [0xfeff, 0xfeff]])

/** The ranges a character or set leaf matches. */
const rangesOf = (leaf: Leaf & { kind: 'char' | 'set' }): readonly (readonly [number, number])[] => leaf.kind === 'char' ? [[leaf.code, leaf.code]] : leaf.ranges

function has(leaf: Leaf, code: number): boolean {
  return leaf.kind === 'any' || rangesOf(leaf).some(([low, high]) => code >= low && code <= high)
}

/** Whether two leaves can match one character. */
function overlap(a: Leaf, b: Leaf): boolean {
  if (a.kind === 'any' || b.kind === 'any') return true
  const x = rangesOf(a)
  const y = rangesOf(b)
  for (let i = 0, j = 0; i < x.length && j < y.length;) {
    if (x[i]![1] < y[j]![0]) i++
    else if (y[j]![1] < x[i]![0]) j++
    else return true
  }
  return false
}

class Parser {
  i = 0
  constructor(private readonly source: string) {}

  alternatives(): Term[][] {
    const result: Term[][] = [[]]
    while (this.i < this.source.length && this.source[this.i] !== ')') {
      if (this.source[this.i] === '|') { this.i++; result.push([]); continue }
      const node = this.atom()
      const [min, max] = this.quantifier()
      result[result.length - 1]!.push({ node, min, max })
    }
    return result
  }

  private atom(): Leaf | Group | string {
    const c = this.source[this.i++]!
    if (c === '^' || c === '$') return c
    if (c === '.') return ANY
    if (c === '[') return this.characterClass()
    if (c === '(') return this.group()
    if (c === '\\') return this.escape(false)
    return char(c)
  }

  private group(): Group {
    const prefix = /^\?(?:[:=!]|<[=!]|<[^>]*>|[a-zA-Z]*-?[a-zA-Z]*:)/.exec(this.source.slice(this.i))?.[0] ?? ''
    this.i += prefix.length
    const alternatives = this.alternatives()
    if (this.source[this.i] !== ')') throw new Error('unbalanced group')
    this.i++
    return { kind: 'group', alternatives, lookaround: /^\?<?[=!]/.test(prefix) }
  }

  private quantifier(): [number, number] {
    const rest = this.source.slice(this.i)
    const braces = /^\{(\d+)(,(\d*))?\}/.exec(rest)
    const range: [number, number] | null = rest[0] === '*' ? [0, Infinity] : rest[0] === '+' ? [1, Infinity] : rest[0] === '?' ? [0, 1]
      : braces === null ? null : [Number(braces[1]), braces[2] === undefined ? Number(braces[1]) : braces[3] === '' ? Infinity : Number(braces[3])]
    if (range === null) return [1, 1]
    this.i += braces?.[0].length ?? 1
    if (this.source[this.i] === '?') this.i++
    return range
  }

  private escape(inClass: boolean): Leaf | string {
    const c = this.source[this.i++] ?? '\\'
    const rest = this.source.slice(this.i)
    const take = (match: RegExpExecArray | null): string | null => { if (match === null) return null; this.i += match[0].length; return match[0] }
    switch (c) {
      case 'd': return DIGIT
      case 'D': return complement(DIGIT)
      case 'w': return WORD
      case 'W': return complement(WORD)
      case 's': return SPACE
      case 'S': return complement(SPACE)
      case 'b': return inClass ? char('\b') : 'b'
      case 'B': return inClass ? char('B') : 'B'
      case 'n': return char('\n')
      case 'r': return char('\r')
      case 't': return char('\t')
      case 'f': return char('\f')
      case 'v': return char('\v')
      case 'x': { const hex = take(/^[0-9a-fA-F]{2}/.exec(rest)); return hex === null ? char('x') : { kind: 'char', code: parseInt(hex, 16) } }
      case 'u': {
        const hex = take(/^\{[0-9a-fA-F]+\}|^[0-9a-fA-F]{4}/.exec(rest))
        return hex === null ? char('u') : { kind: 'char', code: parseInt(hex.replace(/[{}]/g, ''), 16) }
      }
      case 'c': { const letter = take(/^[a-zA-Z]/.exec(rest)); return letter === null ? char('\\') : { kind: 'char', code: letter.charCodeAt(0) % 32 } }
      case 'p': case 'P': return take(/^\{[^}]*\}/.exec(rest)) === null ? char(c) : ANY
      case 'k': return take(/^<[^>]*>/.exec(rest)) === null ? char('k') : ANY
      default:
        if (c >= '1' && c <= '9') { take(/^\d*/.exec(rest)); return ANY }
        return char(c)
    }
  }

  private characterClass(): Leaf {
    const negated = this.source[this.i] === '^'
    if (negated) this.i++
    const members: Leaf[] = []
    const ranges: [number, number][] = []
    while (this.i < this.source.length && this.source[this.i] !== ']') {
      const low = this.classAtom()
      if (this.source[this.i] === '-' && this.i + 1 < this.source.length && this.source[this.i + 1] !== ']') {
        this.i++
        const high = this.classAtom()
        if (low.kind === 'char' && high.kind === 'char') ranges.push([low.code, high.code])
        else members.push(low, char('-'), high)
        continue
      }
      members.push(low)
    }
    if (this.source[this.i] !== ']') throw new Error('unterminated class')
    this.i++
    if (members.some(member => member.kind === 'any')) return ANY
    const inClass = set([...ranges, ...members.flatMap(member => rangesOf(member as Leaf & { kind: 'char' | 'set' }))])
    return negated ? complement(inClass) : inClass
  }

  private classAtom(): Leaf {
    const c = this.source[this.i++]!
    if (c !== '\\') return char(c)
    const escaped = this.escape(true)
    return typeof escaped === 'string' ? char(escaped) : escaped
  }
}

const consumed = new WeakMap<Term, Leaf[]>()

/** Leaves a term can consume, at any depth. */
function consumes(term: Term): Leaf[] {
  if (typeof term.node === 'string') return []
  if (term.node.kind !== 'group') return [term.node]
  let leaves = consumed.get(term)
  if (leaves === undefined) consumed.set(term, leaves = term.node.alternatives.flatMap(sequence => sequence.flatMap(consumes)))
  return leaves
}

/** Leaves a term can start with: the first element of each alternative when it is a mandatory character, else any. */
function starts(term: Term): Leaf[] {
  if (typeof term.node === 'string') return []
  if (term.node.kind !== 'group') return [term.node]
  return term.node.alternatives.map(sequence => {
    const first = sequence.find(element => typeof element.node !== 'string')
    return first !== undefined && first.min >= 1 && typeof first.node !== 'string' && first.node.kind !== 'group' ? first.node : ANY
  })
}

const variableInside = new WeakMap<Group, Leaf[]>()

/** Leaves inside a group under a variable quantifier (one whose count can vary), at any depth. */
function variableLeaves(group: Group): Leaf[] {
  let leaves = variableInside.get(group)
  if (leaves === undefined) {
    leaves = group.alternatives.flatMap(sequence => sequence.flatMap(term => {
      if (typeof term.node === 'string') return []
      if (term.max > term.min) return consumes(term)
      return term.node.kind === 'group' ? variableLeaves(term.node) : []
    }))
    variableInside.set(group, leaves)
  }
  return leaves
}

/** Whether any leaf of `a` can match a character a leaf of `b` can; a comparison too large to make counts as overlapping. */
const overlapsAny = (a: Leaf[], b: Leaf[]): boolean => a.length * b.length > 4096 || a.some(x => b.some(y => overlap(x, y)))

function repeatedGroupReason(group: Group): string | null {
  const inner = variableLeaves(group)
  if (inner.length === 0) {
    const firsts = group.alternatives.map(sequence => starts({ node: { kind: 'group', alternatives: [sequence], lookaround: false }, min: 1, max: 1 }))
    for (let i = 0; i < firsts.length; i++) {
      for (let j = i + 1; j < firsts.length; j++) {
        if (overlapsAny(firsts[i]!, firsts[j]!)) return 'a repeated group has alternatives that can start with the same character'
      }
    }
    return null
  }
  if (group.alternatives.length > 1) return 'a repeated group has alternatives and a repeated or optional part inside'
  const sequence = group.alternatives[0]!.filter(term => typeof term.node !== 'string')
  const separated = [sequence[0], sequence[sequence.length - 1]].some(edge =>
    edge !== undefined && edge.min >= 1 && typeof edge.node !== 'string' && edge.node.kind === 'char' && !inner.some(leaf => has(leaf, (edge.node as { code: number }).code)))
  return separated ? null : 'a repeated group has a repeated or optional part inside and no separator that part cannot match'
}

/**
 * Checks a sequence and the groups in it. Along the sequence it counts the
 * variable elements in a row that can take the same characters (a mandatory
 * element they can also take does not break the row) at each point where
 * the match can fail: that count is the degree of the polynomial
 * backtracking there. An unanchored start counts as one such element.
 */
function sequenceReason(sequence: Term[], unanchored: boolean): string | null {
  let row = unanchored ? 1 : 0
  let last: Leaf[] | null = unanchored ? [ANY] : null
  let degree = 0
  for (const term of sequence) {
    if (typeof term.node === 'string') {
      if (term.node === '$') degree = Math.max(degree, row)
      continue
    }
    if (term.node.kind === 'group') {
      if (term.max > 1) {
        const reason = repeatedGroupReason(term.node)
        if (reason !== null) return reason
      }
      for (const inner of term.node.alternatives) {
        const reason = sequenceReason(inner, false)
        if (reason !== null) return reason
      }
      if (term.node.lookaround) continue
    }
    const variable = term.max > term.min || term.node.kind === 'group' && variableLeaves(term.node).length > 0
    const continues = last !== null && overlapsAny(last, starts(term))
    if (variable) {
      row = continues ? row + 1 : 1
      last = consumes(term)
    } else if (!continues) {
      row = 0
      last = null
    }
    if (term.min >= 1) degree = Math.max(degree, row)
    if (degree >= 3) return 'three or more parts in a row can take the same characters, so a failing match retries them against each other'
  }
  return null
}
