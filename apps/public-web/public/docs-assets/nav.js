// The top navigation's behaviour (scripts/siteNav.mjs), on the home page and every docs page. Without it the menus
// still open as <details>; with it: one menu open at a time, printed open in the site's glyph style, opening on hover
// with a mouse, closing on Escape or a click elsewhere, and on narrow windows a Menu button that shows the navigation
// as a sheet.
(() => {
  const nav = document.getElementById('site-nav')
  const toggle = document.querySelector('.nav-toggle')
  if (!nav) return
  document.documentElement.classList.add('has-nav-js')
  const drops = [...nav.querySelectorAll('details.nav-drop')]
  const narrow = window.matchMedia('(max-width: 900px)')

  // Opening prints the menu (nav.css): row by row, entries in turn, and its monospaced words decoded from noise.
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')
  const NOISE = '·:+×#'
  // Each text's real words, kept the first time it decodes, so a menu reopened mid-decode never keeps the noise; and
  // the run each element is on, so only the latest decode writes.
  const words = new WeakMap()
  const runs = new WeakMap()
  const decode = (element, delay) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const texts = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!words.has(node)) words.set(node, node.data)
      texts.push([node, words.get(node)])
    }
    const run = (runs.get(element) || 0) + 1
    runs.set(element, run)
    const start = performance.now()
    let column = 0
    const settle = texts.map(([, text]) => [...text].map(ch => { const at = delay + column * 14 + ((column * 37) % 5) * 12; column = ch === '\n' ? 0 : column + 1; return at }))
    const end = Math.max(0, ...settle.flat()) + 20
    const tick = (now) => {
      if (runs.get(element) !== run) return
      const t = now - start
      texts.forEach(([node, text], n) => {
        let out = ''
        ;[...text].forEach((ch, i) => { out += ch === ' ' || ch === '\n' || t >= settle[n][i] ? ch : NOISE[(i + Math.floor(t / 30)) % NOISE.length] })
        if (node.data !== out) node.data = out
      })
      if (t < end) requestAnimationFrame(tick)
      else texts.forEach(([node, text]) => { node.data = text })
    }
    requestAnimationFrame(tick)
  }
  const print = (target) => {
    if (still.matches) return
    target.classList.remove('is-printing')
    void target.offsetWidth
    target.classList.add('is-printing')
    target.querySelectorAll('.nav-kicker, li, .nav-feature').forEach((row, i) => row.style.setProperty('--row', String(i)))
    target.querySelectorAll('.nav-kicker, .nav-glyph, .nav-feature-tag, code').forEach((element, i) => decode(element, 40 + i * 18))
    setTimeout(() => target.classList.remove('is-printing'), 700)
  }

  // One menu at a time; the one opening prints.
  for (const drop of drops) drop.addEventListener('toggle', () => {
    if (!drop.open) return
    for (const other of drops) if (other !== drop) other.open = false
    print(drop.querySelector('.nav-panel'))
  })

  // A mouse resting on a menu opens it, and leaving it closes it after a moment, so a diagonal path to the panel keeps
  // it open. A click right after the hover opened it keeps it open instead of closing it again.
  for (const drop of drops) {
    let timer = 0
    let openedAt = 0
    const summary = drop.querySelector('summary')
    drop.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse' || narrow.matches) return
      clearTimeout(timer)
      timer = setTimeout(() => { if (!drop.open) { drop.open = true; openedAt = performance.now() } }, 120)
    })
    drop.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse' || narrow.matches) return
      clearTimeout(timer)
      timer = setTimeout(() => { drop.open = false }, 280)
    })
    summary.addEventListener('click', (event) => { if (drop.open && performance.now() - openedAt < 600) event.preventDefault() })
  }

  const closeMenus = () => { for (const drop of drops) drop.open = false }
  const setSheet = (open, focusToggle = false) => {
    nav.classList.toggle('is-open', open)
    if (open && !still.matches) { nav.classList.remove('is-printing'); void nav.offsetWidth; nav.classList.add('is-printing'); setTimeout(() => nav.classList.remove('is-printing'), 500) }
    if (toggle) toggle.setAttribute('aria-expanded', String(open))
    if (!open && focusToggle && toggle) toggle.focus()
  }

  document.addEventListener('click', (event) => {
    if (nav.contains(event.target) || (toggle && toggle.contains(event.target))) return
    closeMenus()
    if (nav.classList.contains('is-open')) setSheet(false)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    const open = drops.find(drop => drop.open)
    if (open && !narrow.matches) { open.open = false; open.querySelector('summary').focus(); return }
    if (nav.classList.contains('is-open')) setSheet(false, true)
  })
  // Following a link inside the navigation (an anchor on this page, say) closes it.
  nav.addEventListener('click', (event) => { if (event.target.closest('a')) { closeMenus(); setSheet(false) } })

  if (toggle) {
    toggle.hidden = false
    toggle.addEventListener('click', () => setSheet(!nav.classList.contains('is-open')))
  }
  // Back to a wide window: the sheet's state does not carry over.
  narrow.addEventListener('change', () => { setSheet(false); closeMenus() })
})()
