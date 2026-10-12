// The Playground's glyphs (scripts/build-docs.mjs, playgroundBody): the home page's octopus redrawn as a grid of glyphs
// on a canvas, and a slow current of glyphs behind the recent runs. Plain script, no bundle: the hero's own octopus is a
// WebGL renderer tied to the home page. Every glyph stays on its cell; motion changes which glyph a cell shows and how
// bright it is, never where it is. Still with reduced motion, paused in a hidden tab or off screen.
// window.OctoGlyphs.octopus(canvas, anchor) → { set(state) } with 'idle' | 'running'; window.OctoGlyphs.current(pre).
// With an anchor (the URL card in front of it), the octopus is drawn wider than the card and centred on it a little
// high, so its eyes peek over the card's top edge and its arms reach out on both sides.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const RAMP = ' .·:+×x#▪'
  /** Calls draw(seconds) about `fps` times a second while the element is on screen and the tab is visible. */
  const animate = (element, fps, draw) => {
    if (reduced) return
    let visible = true
    let last = 0
    if ('IntersectionObserver' in window) new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting) }).observe(element)
    const frame = (ms) => {
      if (visible && !document.hidden && ms - last >= 1000 / fps) { last = ms; draw(ms / 1000) }
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  /**
   * The octopus: the artwork sampled cell by cell, each cell keeping the artwork's colour and a glyph by how far it
   * stands out from the sea behind. Idle, a slow wave runs out along the arms; running, rings leave the head one after
   * another; a click sends one ring out from where it landed. Nothing follows the pointer.
   */
  const octopus = (canvas, anchor = null) => {
    const context = canvas.getContext('2d')
    let cells = []
    let cols = 0
    let rows = 0
    let cellW = 7
    let cellH = 9
    let left = 0
    let top = 0
    let state = 'idle'
    let stateAt = 0
    let clicks = []
    let image = null
    // The artwork's own bounds within its square, and the sea's colour behind it.
    const CROP = { x: 0.11, y: 0.15, w: 0.78, h: 0.7 }
    const SEA = [12, 26, 92]
    const sample = () => {
      if (!image) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      cellW = width < 520 ? 4.8 : 5.6
      cellH = cellW * 1.3
      // Behind an anchor: wider than it, its eyes (0.42 of the artwork's height down) just over the anchor's top edge.
      // Else as large as fits, centred. The artwork's width to height is CROP.w to CROP.h.
      const across = anchor ? Math.min(width * 0.98, Math.max(anchor.offsetWidth * 1.45, 320), 1060) : Math.min(width, (height * CROP.w) / CROP.h) * 0.98
      cols = Math.floor(across / cellW)
      rows = Math.floor((across * CROP.h) / CROP.w / cellH)
      left = (width - cols * cellW) / 2
      top = anchor ? anchor.offsetTop - rows * cellH * 0.42 - cellH * 3 : (height - rows * cellH) / 2
      const probe = document.createElement('canvas')
      probe.width = cols
      probe.height = rows
      const p = probe.getContext('2d', { willReadFrequently: true })
      p.drawImage(image, CROP.x * image.naturalWidth, CROP.y * image.naturalHeight, CROP.w * image.naturalWidth, CROP.h * image.naturalHeight, 0, 0, cols, rows)
      const data = p.getImageData(0, 0, cols, rows).data
      const head = { x: cols / 2, y: rows * 0.28 }
      cells = []
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const at = (y * cols + x) * 4
          // Shrunk, the artwork's dots average into the sea: each cell is pushed back out from it, colour and all.
          const [r, g, b] = [data[at], data[at + 1], data[at + 2]].map((v, i) => Math.max(0, Math.min(255, Math.round(SEA[i] + (v - SEA[i]) * 1.7))))
          const stand = Math.min(1, Math.hypot(r - SEA[0], g - SEA[1], b - SEA[2]) / 230)
          if (stand < 0.16) continue
          cells.push({ x: left + x * cellW, y: top + y * cellH + cellH * 0.8, gx: x, gy: y, stand: Math.min(1, 0.25 + stand * 0.9), color: `rgb(${r},${g},${b})`, dist: Math.hypot((x - head.x) * 0.6, y - head.y) })
        }
      }
      context.font = `${Math.round(cellH * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
      draw(performance.now() / 1000)
    }
    const draw = (t) => {
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      const since = t - stateAt
      clicks = clicks.filter((c) => t - c.at < 1.6)
      for (const cell of cells) {
        // Idle: a wave out from the head along the arms. Running: rings leave the head every 0.9 s and light the cells
        // they cross. A click: one ring from where it landed.
        let wave = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(cell.dist * 0.32 - t * 1.4 + cell.gx * 0.05)
        let lift = 0
        if (state === 'running' && !reduced) {
          const front = ((since * 26) % 23) - cell.dist * 0.6
          lift = Math.max(0, 1 - Math.abs(front) / 2.2)
          wave = 0.5 + 0.5 * Math.sin(cell.dist * 0.5 - t * 4)
        }
        for (const click of clicks) {
          const front = (t - click.at) * 30 - Math.hypot((cell.gx - click.x) * 0.6, cell.gy - click.y)
          lift = Math.max(lift, Math.max(0, 1 - Math.abs(front) / 2) * (1 - (t - click.at) / 1.6))
        }
        const level = Math.max(0, Math.min(RAMP.length - 1, Math.round(cell.stand * (RAMP.length - 1) * (0.72 + 0.36 * wave) + lift * 3)))
        if (level === 0) continue
        context.globalAlpha = Math.min(1, 0.55 + 0.45 * wave + lift * 0.5)
        context.fillStyle = lift > 0.35 ? '#ff9a6c' : cell.color
        context.fillText(RAMP[level], cell.x, cell.y)
      }
      context.globalAlpha = 1
    }
    const source = new Image()
    source.decoding = 'async'
    source.addEventListener('load', () => { image = source; sample() })
    source.src = '/assets/octopus-original.webp'
    if ('ResizeObserver' in window) { const watch = new ResizeObserver(() => sample()); watch.observe(canvas); if (anchor) watch.observe(anchor) }
    canvas.addEventListener('click', (event) => {
      const box = canvas.getBoundingClientRect()
      clicks.push({ x: (event.clientX - box.left - left) / cellW, y: (event.clientY - box.top - top) / cellH, at: performance.now() / 1000 })
      if (reduced) draw(performance.now() / 1000)
    })
    animate(canvas, 14, draw)
    return { set(next) { if (next !== state) { state = next; stateAt = performance.now() / 1000; if (reduced) draw(stateAt) } } }
  }

  /** A slow current of glyphs drifting left to right, its crests in orange, as faint as a background should be. */
  const current = (pre) => {
    const GLYPHS = ' .·-~=≈'
    const draw = (t) => {
      const cols = Math.max(40, Math.ceil(pre.clientWidth / 7.2))
      const rows = Math.max(10, Math.ceil(pre.clientHeight / 13))
      let text = ''
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const swell = Math.sin(x * 0.09 - t * 0.7 + Math.sin(y * 0.35 + t * 0.25) * 1.6) * Math.cos(y * 0.22 - x * 0.02 + t * 0.15)
          const v = Math.max(0, swell) ** 1.4
          text += GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(v * GLYPHS.length))]
        }
        text += '\n'
      }
      pre.textContent = text
    }
    draw(0)
    if ('ResizeObserver' in window) new ResizeObserver(() => draw(performance.now() / 1000)).observe(pre)
    animate(pre, 8, draw)
  }

  window.OctoGlyphs = { octopus, current }
})()
