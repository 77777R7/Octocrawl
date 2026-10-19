/** The home hero's open-source chip (page.ts): liquid glass that now and then, and on hover, turns into its ASCII
 * self, the words printed from noise in brackets, then dissolves back into noise and pours back into glass
 * (styles.css .hero-chip). Its real text stays in the page throughout; the ASCII copy is hidden from screen readers. */

// The same noise the navigation's menus decode from (public/docs-assets/nav.js).
const NOISE = '·:+×#'
// The first turn after the page settles, how long the ASCII self stays, and how long the glass stays between turns.
const FIRST_MS = 3200
const ASCII_MS = 2600
const GLASS_MS = 7000
// Each column settles this long after the one before it, with a little jitter, as the menus do.
const COLUMN_MS = 16

export function mountHeroChip(chip: HTMLElement): void {
  const text = chip.querySelector<HTMLElement>('.hero-chip-text')
  const ascii = chip.querySelector<HTMLElement>('.hero-chip-ascii')
  if (!text || !ascii) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const word = `[ ${text.textContent?.trim() ?? ''} ]`
  const chars = [...word]

  // The monospaced copy fits the glass pill's width, so the chip never changes size as it turns.
  const fit = (): void => {
    const width = chip.getBoundingClientRect().width
    if (width) chip.style.setProperty('--chip-ascii', `${Math.min(15, (width - 6) / (chars.length * 0.61)).toFixed(2)}px`)
  }
  fit()
  new ResizeObserver(fit).observe(chip)

  let run = 0
  // Print the words from noise left to right (showing) or wipe them back to noise and then to nothing (hiding).
  const print = (showing: boolean, done?: () => void): void => {
    const mine = ++run
    const start = performance.now()
    const settle = chars.map((_, i) => i * COLUMN_MS + ((i * 37) % 5) * 12)
    const end = Math.max(...settle) + 140
    const tick = (now: number): void => {
      if (mine !== run) return
      const t = now - start
      let out = ''
      chars.forEach((ch, i) => {
        const noise = NOISE[(i + Math.floor(t / 30)) % NOISE.length]
        if (ch === ' ') out += ' '
        else if (showing) out += t >= settle[i] ? ch : t >= settle[i] - 120 ? noise : ' '
        else out += t < settle[i] ? ch : t < settle[i] + 120 ? noise : ' '
      })
      ascii.textContent = out
      if (t < end) requestAnimationFrame(tick)
      else {
        ascii.textContent = showing ? word : ''
        done?.()
      }
    }
    requestAnimationFrame(tick)
  }

  let isAscii = false
  const toAscii = (): void => {
    if (isAscii) return
    isAscii = true
    chip.classList.remove('is-pouring')
    chip.classList.add('is-ascii')
    print(true)
  }
  const toGlass = (): void => {
    if (!isAscii) return
    isAscii = false
    print(false)
    // The glass comes back while the last columns are still dissolving.
    window.setTimeout(() => {
      if (isAscii) return
      chip.classList.remove('is-ascii')
      chip.classList.add('is-pouring')
    }, chars.length * COLUMN_MS * 0.6)
  }
  chip.addEventListener('animationend', (event) => { if (event.animationName === 'chip-pour') chip.classList.remove('is-pouring') })

  // The turns run only while the chip is on screen and the tab is visible; a hover turns it at once.
  let timer = 0
  let visible = false
  const schedule = (ms: number): void => {
    window.clearTimeout(timer)
    if (!visible || document.hidden) return
    timer = window.setTimeout(() => {
      if (isAscii) { toGlass(); schedule(GLASS_MS) } else { toAscii(); schedule(ASCII_MS) }
    }, ms)
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    if (visible) schedule(isAscii ? ASCII_MS : FIRST_MS)
    else window.clearTimeout(timer)
  }).observe(chip)
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.clearTimeout(timer); else schedule(isAscii ? ASCII_MS : GLASS_MS) })
  chip.addEventListener('pointerenter', () => {
    if (isAscii) { toGlass(); schedule(GLASS_MS) } else { toAscii(); schedule(ASCII_MS) }
  })
}
