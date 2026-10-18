// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hero's octopus (src/heroOctopus.ts) mounted in a browser-like window (happy-dom) on a canvas that only counts
// what is drawn, from a made-up source image, with frames and clocks driven by hand: what it puts in the page, what it
// tells the hero, that it rests off screen, and that taking it away leaves nothing behind.
const SIZE = 384
const BOXES: Array<[string, { left: number; top: number; width: number; height: number }]> = [
  ['.hero', { left: 0, top: 0, width: 1440, height: 900 }],
  ['.hero-ascii-layer', { left: 400, top: 200, width: 640, height: 610 }],
  ['#title', { left: 500, top: 220, width: 440, height: 120 }],
  ['.card', { left: 450, top: 690, width: 540, height: 80 }],
]

/** A navy square with a blue body, two arms reaching down and two cream eyes in dark sockets, or nothing but navy. */
function source(octopus: boolean): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const body = Math.hypot(x - 192, y - 160) < 80 || (y > 160 && y < 330 && (Math.abs(x - 135) < 15 || Math.abs(x - 249) < 15))
      const socket = Math.abs(y - 150) < 7 && (Math.abs(x - 170) < 7 || Math.abs(x - 214) < 7)
      const eye = Math.abs(y - 150) < 2 && (Math.abs(x - 170) < 2 || Math.abs(x - 214) < 2)
      const rgb = !octopus ? [4, 16, 50] : eye ? [255, 240, 210] : socket ? [8, 14, 40] : body ? [70, 120, 230] : [4, 16, 50]
      data.set([...rgb, 255], (y * SIZE + x) * 4)
    }
  }
  return data
}

let octopusSource = true
const drawn = new Map<HTMLCanvasElement, { frames: number; glyphs: number }>()
function fakeContext(canvas: HTMLCanvasElement): unknown {
  const counts = { frames: 0, glyphs: 0 }
  drawn.set(canvas, counts)
  const methods: Record<string, unknown> = {
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: w === SIZE && h === SIZE ? source(octopusSource) : new Uint8ClampedArray(w * h * 4).fill(60) }),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    clearRect: () => { counts.frames++ },
    fillText: () => { counts.glyphs++ },
  }
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => key in target ? target[key] : methods[key as string] ?? (() => {}),
    set: (target, key, value) => { target[key] = value; return true },
  })
}

let onScreen: (entries: Array<{ isIntersecting: boolean }>) => void = () => {}
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  drawn.clear()
  octopusSource = true
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { return fakeContext(this) as RenderingContext })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,')
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = BOXES.find(([selector]) => this.matches(selector))?.[1] ?? { left: 0, top: 0, width: 0, height: 0 }
    return { ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box } as DOMRect
  })
  // The artwork has its natural size; its bitmaps and the octopus's are made up above.
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(2400)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1350)
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.stubGlobal('fetch', async () => ({ blob: async () => new Blob() }))
  vi.stubGlobal('createImageBitmap', async (_blob: Blob, options: { resizeWidth: number; resizeHeight?: number }) => ({ width: options.resizeWidth, height: options.resizeHeight ?? 236, close: () => {} }))
  vi.stubGlobal('IntersectionObserver', class { constructor(callback: typeof onScreen) { onScreen = callback } observe() {} disconnect() {} })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  document.body.innerHTML = `<section class="hero"><div class="hero-backdrop"></div><h1 id="title">Turn web pages into data</h1>
    <div class="hero-octopus-cell" id="hero-ascii" data-calm="#title" data-reach=".card"></div><form class="card"></form></section>`
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount() {
  const { mountHeroOctopus } = await import('../src/heroOctopus.js')
  const hero = document.querySelector<HTMLElement>('.hero')!
  const cell = document.querySelector<HTMLElement>('#hero-ascii')!
  const states: string[] = []
  hero.addEventListener('w2l:octopus', (event) => states.push((event as CustomEvent<{ state: string }>).detail.state))
  const dispose = mountHeroOctopus(cell)
  const canvas = cell.querySelector<HTMLCanvasElement>('canvas.w2l-ascii-motif')!
  return { hero, cell, states, dispose, counts: () => ({ ...drawn.get(canvas)! }) }
}

describe('the hero octopus', () => {
  it('types itself in its own layer, says when it draws and wakes, rests off screen, and leaves nothing behind', async () => {
    const { hero, cell, states, dispose, counts } = await mount()
    const layer = cell.querySelector('.hero-ascii-layer')!
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect([...layer.children].map((child) => child.className)).toEqual(['w2l-ascii-veil', 'w2l-ascii-veil w2l-ascii-reach', 'w2l-ascii-motif'])

    onScreen([{ isIntersecting: true }])
    await vi.advanceTimersByTimeAsync(1600)
    // It decodes, then lights up about 1.1 s after its first frame, eyes open.
    expect(states).toEqual(['running', 'awake'])
    expect(layer.querySelector<HTMLElement>('.w2l-ascii-veil')!.hidden).toBe(false)
    expect(counts().glyphs).toBeGreaterThan(1000)

    // Off screen it draws nothing; back on screen it carries on.
    onScreen([{ isIntersecting: false }])
    const away = counts().frames
    await vi.advanceTimersByTimeAsync(500)
    expect(counts().frames).toBe(away)
    onScreen([{ isIntersecting: true }])
    hero.dispatchEvent(new CustomEvent('w2l:take', { detail: { phase: 'start' } }))
    await vi.advanceTimersByTimeAsync(500)
    expect(counts().frames).toBeGreaterThan(away + 5)

    dispose()
    expect(cell.children).toHaveLength(0)
    const after = counts()
    hero.dispatchEvent(new CustomEvent('w2l:take', { detail: { phase: 'success' } }))
    hero.dispatchEvent(new CustomEvent('w2l:summit'))
    hero.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, clientY: 500 }))
    await vi.advanceTimersByTimeAsync(1000)
    expect(counts()).toEqual(after)
    expect(states).toEqual(['running', 'awake'])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('says it stalled, and draws nothing, when its source has no octopus in it', async () => {
    octopusSource = false
    const { cell, states, dispose, counts } = await mount()
    onScreen([{ isIntersecting: true }])
    await vi.advanceTimersByTimeAsync(1000)
    expect(states).toEqual(['stalled'])
    expect(counts().glyphs).toBe(0)
    dispose()
    expect(cell.children).toHaveLength(0)
  })
})
