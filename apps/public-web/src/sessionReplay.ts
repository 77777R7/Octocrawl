/** Replays the recorded runs in sessionScript.ts the way an agent session streams, beside the steps of How it
 * works: the address is typed, steps stream in, output decodes out of garbled glyphs, the run holds, then the next
 * starts. The runs alternate while the window is on screen in a visible tab. It never shows the visitor's own URL
 * or results. */
import { RUNS } from './sessionScript'

// Latin-1 mojibake and ASCII symbols: one cell wide in every common monospace font.
const GLITCH = [...'ÃÂßØÆ¶µ§¤ðø±¿¢Ðþ#%&@$*+=<>?/\\|{}']
// The loop after the static first frame (the first run's result): the other run, then the first again.
const PLAN = [1, 0]
// The pending mark breathes through the artwork's light marks (dot, colon, four dots); its crosses beside a
// step in progress would read as a failure.
const PENDING = [1, 2, 3, 2]
const INTRO_HOLD = 2600
const WIPE_MS = 560
const NEXT_RUN_MS = 620

const glitch = (text: string): string => {
  let out = ''
  for (const char of text) out += char === ' ' ? ' ' : GLITCH[(Math.random() * GLITCH.length) | 0]
  return out
}
const easeOut = (p: number): number => 1 - (1 - p) ** 3
// Thousands separators by hand: a first toLocaleString call pays for number-format setup mid-animation.
const grouped = (value: number): string => String(value).replace(/\B(?=(\d{3})+$)/g, ',')

/** One text slot: settled text, a garbled run and an untouched tail, written only when they change. */
class Slot {
  readonly head = document.createTextNode('')
  readonly noise = document.createTextNode('')
  readonly tail = document.createTextNode('')
  /** What the slot says once settled; the wipe garbles it away from here. */
  value = ''
  constructor(readonly el: HTMLElement) {
    const span = document.createElement('span')
    span.className = 's-glitch'
    span.append(this.noise)
    this.value = el.textContent ?? ''
    el.replaceChildren(this.head, span, this.tail)
    this.head.data = this.value
  }
  show(head: string, noise = '', tail = ''): void {
    if (this.head.data !== head) this.head.data = head
    if (this.noise.data !== noise) this.noise.data = noise
    if (this.tail.data !== tail) this.tail.data = tail
  }
  set(settled: string, noise = ''): void {
    this.show(settled, noise)
    this.value = settled + noise
  }
}

class Row {
  readonly mark: Slot
  readonly label: Slot
  readonly detail: Slot
  constructor(readonly el: HTMLElement) {
    const [mark, label, detail] = el.querySelectorAll<HTMLElement>('span')
    this.mark = new Slot(mark)
    this.label = new Slot(label)
    this.detail = new Slot(detail)
  }
  state(className: string): void {
    const next = `s-row ${className}`.trim()
    if (this.el.className !== next) this.el.className = next
  }
  glyph(level: number): void {
    const next = level ? String(level) : ''
    if ((this.mark.el.dataset.g ?? '') === next) return
    if (next) this.mark.el.dataset.g = next
    else delete this.mark.el.dataset.g
  }
  clear(): void {
    this.state('')
    this.glyph(0)
    this.mark.set('')
    this.label.set('')
    this.detail.set('')
  }
}

type Segment = { at: number; ms: number; apply: (p: number) => void; done?: boolean }
/** start() holds the static frame for `hold` ms first. */
export type SessionReplay = { start(hold?: number): void; dispose(): void }

/** Prepares nothing until start(): the static frame stays untouched unless the replay really plays. */
export function playSession(container: HTMLElement): SessionReplay {
  const body = container.querySelector<HTMLElement>('.session-body')!
  const windowEl = container.querySelector<HTMLElement>('.session-window')!
  const tagEl = container.querySelector<HTMLElement>('.session-tag')!
  const original = body.innerHTML
  const originalTag = tagEl.textContent ?? ''
  let rows: Row[] = []
  let tag: Slot | undefined
  let segments: Segment[] = []
  let clock = 0
  let total = 0
  let played = 0
  let raf = 0
  let last = 0
  let started = false
  let finished = false
  let onScreen = true
  const view = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true
    sync()
  }, { threshold: 0.05 })

  const onVisibility = (): void => sync()

  function attach(): void {
    document.addEventListener('visibilitychange', onVisibility)
    view.observe(windowEl)
  }
  function detach(): void {
    document.removeEventListener('visibilitychange', onVisibility)
    view.disconnect()
  }
  function stop(): void {
    cancelAnimationFrame(raf)
    raf = 0
  }
  /** Back to the page's static frame, the first run's result, when disposed. */
  function finish(): void {
    if (finished) return
    finished = true
    stop()
    if (!started) return
    detach()
    body.innerHTML = original
    tagEl.textContent = originalTag
  }
  // The replay runs only while its window is on screen in a visible tab.
  function sync(): void {
    if (started && !finished && onScreen && !document.hidden) {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame) }
    } else if (raf) stop()
  }
  function frame(now: number): void {
    raf = requestAnimationFrame(frame)
    // About 30 fps is plenty for typing and decoding.
    if (now - last < 32) return
    const dt = Math.min(50, now - last)
    last = now
    advance(dt)
  }
  function advance(dt: number): void {
    clock += dt
    for (const segment of segments) {
      if (segment.done || clock < segment.at) continue
      const p = segment.ms ? Math.min(1, (clock - segment.at) / segment.ms) : 1
      segment.apply(p)
      if (p >= 1) segment.done = true
    }
    if (clock >= total) {
      clock = 0
      build(PLAN[played])
      played = (played + 1) % PLAN.length
    }
  }
  function wipe(p: number): void {
    const t = p * WIPE_MS
    rows.forEach((row, i) => {
      const local = t - i * 22
      if (local <= 0) return
      for (const slot of [row.mark, row.label, row.detail]) {
        const text = slot.value
        const cleared = Math.min(text.length, Math.floor(local / 6))
        const noisy = Math.min(text.length, cleared + 6)
        slot.show(' '.repeat(cleared), glitch(text.slice(cleared, noisy)), text.slice(noisy))
      }
      if (local > 60) row.glyph(0)
    })
    if (p >= 1) rows.forEach((row) => row.clear())
  }
  function decode(slot: Slot, text: string, t: number): void {
    const shown = Math.min(text.length, Math.floor(t / 4) + 1)
    const settled = Math.max(0, Math.min(text.length, Math.floor((t - 150) / 9) + 1))
    slot.set(text.slice(0, settled), glitch(text.slice(settled, shown)))
  }
  function build(index: number): void {
    const run = RUNS[index]
    const [prompt] = rows
    const result = rows[rows.length - 1]
    const list: Segment[] = []
    const at = (time: number, ms: number, apply: (p: number) => void): void => { list.push({ at: time, ms, apply }) }
    const play = played + 1
    at(0, 0, () => {
      rows.forEach((row) => row.clear())
      tag?.set(`replay ${play}/${PLAN.length}`)
      prompt.state('is-prompt is-typing')
      prompt.mark.set('›')
    })
    // Typing: about 24 ms a key with human jitter, and a beat after the host's first dot.
    const keys: number[] = []
    let typing = 0
    const firstDot = run.typed.indexOf('.')
    for (let i = 0; i < run.typed.length; i++) {
      typing += 18 + Math.random() * 12 + (i === firstDot + 1 ? 90 : 0)
      keys.push(typing)
    }
    let t = 200
    at(t, typing, (p) => {
      let count = 0
      while (count < keys.length && keys[count] <= p * typing) count++
      prompt.label.set(run.typed.slice(0, count))
    })
    t += typing + 200
    at(t, 0, () => prompt.state('is-prompt is-sent'))
    t += 160
    run.steps.forEach((step, i) => {
      const row = rows[2 + i]
      const start = t
      at(start, step.ms, (p) => {
        row.state('is-step is-active')
        row.glyph(PENDING[Math.floor((clock - start) / 90) % PENDING.length])
        row.label.set(step.count ? `${step.doing} · ${grouped(Math.round(easeOut(p) * step.count))} chars` : step.doing)
      })
      t += step.ms
      at(t, 0, () => {
        row.state('is-step is-ok')
        row.glyph(0)
        row.mark.set('✓')
        row.label.set(step.done)
        row.detail.set(step.detail)
      })
      t += 110
    })
    let decodeEnd = t
    run.out.forEach((line, i) => {
      const row = rows[7 + i]
      const start = t + i * 120
      const ms = 190 + line.text.length * 9
      decodeEnd = Math.max(decodeEnd, start + ms)
      at(start, ms, (p) => {
        const done = p >= 1
        if (line.key) {
          row.state(done && line.check ? 'is-field is-ok' : 'is-field')
          row.label.set(line.key)
          decode(row.detail, line.text, p * ms)
          if (done && line.check) row.mark.set('✓')
        } else {
          row.state('is-out')
          decode(row.label, line.text, p * ms)
        }
      })
    })
    t = decodeEnd + 160
    at(t, 0, () => {
      result.state('is-result is-ok is-new')
      result.mark.set('●')
      result.label.set(run.result)
      result.detail.set(run.time)
    })
    const wipeAt = t + run.hold
    at(wipeAt, WIPE_MS, wipe)
    total = wipeAt + NEXT_RUN_MS
    segments = list
  }

  return {
    start(hold = INTRO_HOLD) {
      if (started || finished) return
      started = true
      rows = [...body.querySelectorAll<HTMLElement>('.s-row')].map((el) => new Row(el))
      tag = new Slot(tagEl)
      // The static frame is the first run's result: hold it, then continue with the next run.
      segments = [{ at: hold, ms: WIPE_MS, apply: wipe }]
      total = hold + NEXT_RUN_MS
      attach()
      sync()
    },
    dispose: () => finish(),
  }
}
