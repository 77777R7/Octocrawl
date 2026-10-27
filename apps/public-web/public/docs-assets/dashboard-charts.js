// The dashboard's charts (dashboard.js draws them): stacked bars, a smoothed line and a squarified treemap, in SVG,
// with one frosted-glass tooltip. The site's CSP allows no inline style, so shapes get SVG attributes and classes; the
// tooltip is placed through the CSSOM (element.style), which the CSP allows. Text goes in with textContent only.
(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const number = (n) => Number(n).toLocaleString('en-US')
  const svgEl = (name, attrs = {}, parent = null) => {
    const node = document.createElementNS(NS, name)
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
    if (parent) parent.append(node)
    return node
  }
  let gradientId = 0

  // ---- the tooltip: one per page, frosted glass, kept inside the window ----
  let tip = null
  const tooltip = () => {
    if (tip) return tip
    tip = document.createElement('div')
    tip.className = 'glass-tip'
    tip.hidden = true
    tip.setAttribute('aria-hidden', 'true')
    document.body.append(tip)
    document.addEventListener('pointerdown', (event) => { if (!event.target.closest('.chart')) hide() })
    window.addEventListener('scroll', hide, { passive: true })
    return tip
  }
  /** rows: [label, value, swatch class?] */
  const show = (event, title, rows) => {
    const box = tooltip()
    const head = document.createElement('p')
    head.className = 'glass-tip-title'
    head.textContent = title
    const list = document.createElement('dl')
    for (const [label, value, swatch] of rows) {
      const term = document.createElement('dt')
      if (swatch) { const dot = document.createElement('i'); dot.className = `sw ${swatch}`; term.append(dot) }
      term.append(label)
      const detail = document.createElement('dd')
      detail.textContent = value
      if (label === 'Total') { term.className = 'total'; detail.className = 'total' }
      list.append(term, detail)
    }
    box.replaceChildren(head, list)
    box.hidden = false
    const pad = 14
    const { innerWidth: w, innerHeight: h } = window
    const rect = box.getBoundingClientRect()
    let x = event.clientX + pad
    let y = event.clientY + pad
    if (x + rect.width > w - 8) x = event.clientX - rect.width - pad
    if (y + rect.height > h - 8) y = event.clientY - rect.height - pad
    box.style.left = `${Math.max(8, x)}px`
    box.style.top = `${Math.max(8, y)}px`
  }
  const hide = () => { if (tip) tip.hidden = true }

  /** A round top for an axis: 1, 2, 2.5 or 5 times a power of ten, and four steps to it. */
  const niceScale = (max) => {
    if (max <= 0) return { top: 4, step: 1 }
    const raw = max / 4
    const power = 10 ** Math.floor(Math.log10(raw))
    // Credits and calls are whole numbers: a step is never less than one.
    const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw))
    return { top: step * 4, step }
  }

  /** Draws again when the host changes width, and once now. A host keeps one observer: a new draw replaces the old. */
  const observers = new WeakMap()
  const responsive = (host, draw) => {
    observers.get(host)?.disconnect()
    let width = 0
    const run = () => {
      const next = Math.round(host.clientWidth)
      if (next === width || next === 0) return
      width = next
      draw(width)
    }
    if ('ResizeObserver' in window) { const observer = new ResizeObserver(run); observer.observe(host); observers.set(host, observer) }
    run()
  }

  const frame = (host, width, height, label) => {
    host.replaceChildren()
    host.classList.add('chart')
    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label }, host)
    if (!still.matches) svg.classList.add('enter')
    return svg
  }
  const axis = (svg, plot, scale, format = number) => {
    for (let v = 0; v <= scale.top + 1e-9; v += scale.step) {
      const y = plot.bottom - (v / scale.top) * (plot.bottom - plot.top)
      svgEl('line', { x1: plot.left, x2: plot.right, y1: y, y2: y, class: v === 0 ? 'axis' : 'grid' }, svg)
      const text = svgEl('text', { x: plot.left - 8, y: y + 4, class: 'tick', 'text-anchor': 'end' }, svg)
      text.textContent = format(Math.round(v * 100) / 100)
    }
  }
  const dateLabels = (svg, plot, labels, xOf) => {
    const picks = labels.length > 2 ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1] : labels.map((_, i) => i)
    for (const i of picks) {
      const text = svgEl('text', { x: xOf(i), y: plot.bottom + 18, class: 'tick', 'text-anchor': i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle' }, svg)
      text.textContent = labels[i]
    }
  }

  /**
   * Stacked bars, one per label. series: [{ label, cls, values[] }]. opts: { height, unit, title(i) }.
   * Hovering a column lights it and shows each part and the total.
   */
  const bars = (host, labels, series, opts = {}) => {
    responsive(host, (width) => {
      const height = opts.height ?? 240
      const plot = { left: 44, right: width - 8, top: 12, bottom: height - 28 }
      const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0))
      const scale = niceScale(Math.max(...totals, 0))
      const svg = frame(host, width, height, opts.label ?? 'Bar chart')
      axis(svg, plot, scale)
      const band = (plot.right - plot.left) / labels.length
      const barWidth = Math.max(2, Math.min(28, band * 0.62))
      const xOf = (i) => plot.left + band * i + band / 2
      const yOf = (v) => plot.bottom - (v / scale.top) * (plot.bottom - plot.top)
      labels.forEach((label, i) => {
        const column = svgEl('g', { class: 'col' }, svg)
        svgEl('rect', { x: plot.left + band * i, y: plot.top, width: band, height: plot.bottom - plot.top, class: 'col-hit' }, column)
        let base = 0
        for (const s of series) {
          const v = s.values[i]
          if (v <= 0) continue
          const top = yOf(base + v)
          svgEl('rect', { x: xOf(i) - barWidth / 2, y: top, width: barWidth, height: Math.max(1, yOf(base) - top), rx: 2, class: `bar ${s.cls}` }, column)
          base += v
        }
        const enter = (event) => {
          column.classList.add('hover')
          show(event, opts.title ? opts.title(i) : label, [...series.filter((s) => s.values[i] > 0 || series.length <= 4).map((s) => [s.label, number(s.values[i]), s.cls]), ['Total', `${number(totals[i])} ${opts.unit ?? ''}`.trim()]])
        }
        column.addEventListener('pointermove', enter)
        column.addEventListener('pointerleave', () => { column.classList.remove('hover'); hide() })
      })
      dateLabels(svg, plot, labels, xOf)
    })
  }

  /** Monotone cubic through the points (Fritsch-Carlson): no overshoot below zero between two days. */
  const smoothPath = (pts) => {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : ''
    const n = pts.length
    const dx = []; const dy = []; const m = []
    for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / dx[i]) }
    const t = [m[0]]
    for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]))
    t.push(m[n - 2])
    let d = `M${pts[0][0]},${pts[0][1]}`
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3
      d += `C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`
    }
    return d
  }

  /** A smoothed line with an orange fill under it. opts: { height, unit, label, title(i), rows(i) }. */
  const line = (host, labels, values, opts = {}) => {
    responsive(host, (width) => {
      const height = opts.height ?? 220
      const plot = { left: 44, right: width - 12, top: 14, bottom: height - 28 }
      const scale = niceScale(Math.max(...values, 0))
      const svg = frame(host, width, height, opts.label ?? 'Line chart')
      const id = `oc-fill-${++gradientId}`
      const gradient = svgEl('linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 }, svgEl('defs', {}, svg))
      svgEl('stop', { offset: '0%', class: 'fill-top' }, gradient)
      svgEl('stop', { offset: '100%', class: 'fill-bottom' }, gradient)
      axis(svg, plot, scale)
      const step = labels.length > 1 ? (plot.right - plot.left) / (labels.length - 1) : 0
      const xOf = (i) => plot.left + step * i
      const yOf = (v) => plot.bottom - (v / scale.top) * (plot.bottom - plot.top)
      const pts = values.map((v, i) => [xOf(i), yOf(v)])
      const curve = smoothPath(pts)
      svgEl('path', { d: `${curve}L${xOf(values.length - 1)},${plot.bottom}L${plot.left},${plot.bottom}Z`, fill: `url(#${id})`, class: 'area' }, svg)
      svgEl('path', { d: curve, class: 'line', pathLength: 1 }, svg)
      const last = pts[pts.length - 1]
      if (last) svgEl('circle', { cx: last[0], cy: last[1], r: 4, class: 'end' }, svg)
      const cursor = svgEl('line', { x1: 0, x2: 0, y1: plot.top, y2: plot.bottom, class: 'cursor' }, svg)
      const dot = svgEl('circle', { cx: 0, cy: 0, r: 5, class: 'dot' }, svg)
      cursor.classList.add('off'); dot.classList.add('off')
      const hit = svgEl('rect', { x: plot.left - step / 2, y: plot.top, width: plot.right - plot.left + step, height: plot.bottom - plot.top, class: 'col-hit' }, svg)
      hit.addEventListener('pointermove', (event) => {
        const box = svg.getBoundingClientRect()
        const x = ((event.clientX - box.left) / box.width) * width
        const i = Math.max(0, Math.min(values.length - 1, Math.round((x - plot.left) / (step || 1))))
        for (const node of [cursor]) { node.setAttribute('x1', xOf(i)); node.setAttribute('x2', xOf(i)) }
        dot.setAttribute('cx', xOf(i)); dot.setAttribute('cy', yOf(values[i]))
        cursor.classList.remove('off'); dot.classList.remove('off')
        show(event, opts.title ? opts.title(i) : labels[i], opts.rows ? opts.rows(i) : [['Value', `${number(values[i])} ${opts.unit ?? ''}`.trim(), 'b-http']])
      })
      hit.addEventListener('pointerleave', () => { cursor.classList.add('off'); dot.classList.add('off'); hide() })
      dateLabels(svg, plot, labels, xOf)
    })
  }

  /** Squarified layout (Bruls et al.): rectangles close to square, in order of size. */
  const squarify = (items, x, y, w, h) => {
    const total = items.reduce((sum, item) => sum + item.value, 0)
    if (total <= 0) return []
    const scaled = items.map((item) => ({ ...item, area: (item.value / total) * w * h }))
    const out = []
    let rest = scaled
    let box = { x, y, w, h }
    const worst = (row, side) => {
      const sum = row.reduce((s, r) => s + r.area, 0)
      const max = Math.max(...row.map((r) => r.area)); const min = Math.min(...row.map((r) => r.area))
      return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
    }
    while (rest.length) {
      const side = Math.min(box.w, box.h)
      let row = [rest[0]]
      let i = 1
      while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) { row.push(rest[i]); i++ }
      const sum = row.reduce((s, r) => s + r.area, 0)
      if (box.w >= box.h) {
        const rowW = sum / box.h
        let cy = box.y
        for (const r of row) { const rh = r.area / rowW; out.push({ ...r, x: box.x, y: cy, w: rowW, h: rh }); cy += rh }
        box = { x: box.x + rowW, y: box.y, w: box.w - rowW, h: box.h }
      } else {
        const rowH = sum / box.w
        let cx = box.x
        for (const r of row) { const rw = r.area / rowH; out.push({ ...r, x: cx, y: box.y, w: rw, h: rowH }); cx += rw }
        box = { x: box.x, y: box.y + rowH, w: box.w, h: box.h - rowH }
      }
      rest = rest.slice(i)
    }
    return out
  }

  /**
   * Lays out items, largest first, with `other` (the rest, summed) after them: as a strip along the long side while every
   * tile stays within 3:1, else as the last tile when that leaves squarer tiles. Either way it ends in the bottom-right
   * corner, behind the named ones.
   */
  const arrange = (items, other, w, h) => {
    if (!other) return squarify(items, 0, 0, w, h)
    const share = other.value / (other.value + items.reduce((sum, item) => sum + item.value, 0))
    const strip = w >= h
      ? [...squarify(items, 0, 0, w * (1 - share), h), { ...other, x: w * (1 - share), y: 0, w: w * share, h }]
      : [...squarify(items, 0, 0, w, h * (1 - share)), { ...other, x: 0, y: h * (1 - share), w, h: h * share }]
    const tail = squarify([...items, other], 0, 0, w, h)
    const worst = (cells) => Math.max(...cells.map((c) => Math.max(c.w / c.h, c.h / c.w)))
    return worst(strip) <= Math.max(3, worst(tail)) ? strip : tail
  }

  /** A label's width: measured where the browser lays text out, else about 7 px a character in either tile font. */
  const textWidth = (node) => node.getComputedTextLength?.() || node.textContent.length * 7
  /**
   * Writes into `node` the first of `texts` that fits in `room` px. With `least`, the last one may instead be cut to fit,
   * ending in an ellipsis, when at least that many of its characters stay. Returns whether anything was written.
   */
  const fit = (node, texts, room, least = Infinity) => {
    for (const text of texts) { node.textContent = text; if (textWidth(node) <= room) return true }
    const last = texts[texts.length - 1]
    const cut = (n) => `${last.slice(0, n).replace(/[\s.·(_-]+$/, '')}…`
    let keep = 0
    for (let lo = least, hi = last.length - 1; lo <= hi;) {
      const mid = (lo + hi) >> 1
      node.textContent = cut(mid)
      if (textWidth(node) <= room) { keep = mid; lo = mid + 1 } else hi = mid - 1
    }
    node.textContent = keep ? cut(keep) : ''
    return keep > 0
  }
  /** A tile's name, then shorter ways to write it: without "www.", then without a closing part in brackets. */
  const nameForms = (name) => {
    const bare = name.replace(/^www\./, '')
    return [...new Set([name, bare, bare.replace(/\s+\([^()]*\)$/, '')])]
  }

  /**
   * A treemap of items [{ name, value, rows, other? }], largest first; deeper orange for a larger share. The item marked
   * other (the rest, summed) goes last, in grey. Labels never leave their tile: a name drops "www." or its part in
   * brackets, then is cut; the value drops its unit, then its count; a tile too small for a name shows none.
   */
  const treemap = (host, items, opts = {}) => {
    responsive(host, (width) => {
      const height = opts.height ?? (width < 480 ? 300 : 260)
      const svg = frame(host, width, height, opts.label ?? 'Treemap')
      const shown = items.filter((item) => item.value > 0)
      const total = shown.reduce((sum, item) => sum + item.value, 0)
      const cells = arrange(shown.filter((item) => !item.other).sort((a, b) => b.value - a.value), shown.find((item) => item.other), width, height)
      for (const cell of cells) {
        const share = cell.value / total
        const tone = cell.other ? 'other' : `t${share > 0.3 ? 4 : share > 0.15 ? 3 : share > 0.07 ? 2 : share > 0.03 ? 1 : 0}`
        const group = svgEl('g', { class: `tile ${tone}` }, svg)
        svgEl('rect', { x: cell.x + 1, y: cell.y + 1, width: Math.max(0, cell.w - 2), height: Math.max(0, cell.h - 2), rx: 4 }, group)
        const room = cell.w - 20
        if (room >= 20 && cell.h > 34) {
          const name = svgEl('text', { x: cell.x + 10, y: cell.y + 20, class: 'tile-name' }, group)
          if (!fit(name, nameForms(cell.name), room, 4)) name.remove()
          else if (cell.h > 52) {
            const value = svgEl('text', { x: cell.x + 10, y: cell.y + 38, class: 'tile-value' }, group)
            const count = number(cell.value)
            const percent = share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`
            if (!fit(value, [...new Set([`${count}${opts.unit ? ` ${opts.unit}` : ''} · ${percent}`, `${count} · ${percent}`, percent])], room)) value.remove()
          }
        }
        group.addEventListener('pointermove', (event) => { group.classList.add('hover'); show(event, cell.name, [[opts.unit ? `${opts.unit[0].toUpperCase()}${opts.unit.slice(1)}` : 'Value', number(cell.value)], ['Share', `${(share * 100).toFixed(1)}%`], ...(cell.rows ?? [])]) })
        group.addEventListener('pointerleave', () => { group.classList.remove('hover'); hide() })
      }
    })
  }

  window.OctoCharts = { bars, line, treemap, hide, niceScale, squarify }
})()
