import { track } from '../analytics'
import { whenVisible } from '../motion'

/* Scripts for the sections in ./landingSections.ts, taken off the landing page on 3 Oct 2026. Nothing calls this
 * now; a page that shows those sections again calls it once its markup is in place. `form` and `input` are the page's
 * URL form, which the closing call to action hands its URL to. The sections' tab sets still rely on the `[data-tabs]`
 * loop in main.ts, which runs on markup present when the page loads. */
export function mountArchivedSections({ form, input, reducedMotion }: {
  form: HTMLFormElement
  input: HTMLInputElement
  reducedMotion: MediaQueryList
}): void {
  // The recorded-runs ticker scrolls only while it is on screen; the class keeps it still otherwise.
  const ticker = document.querySelector<HTMLElement>('#ticker')!
  whenVisible(ticker, () => ticker.classList.add('is-moving'), () => ticker.classList.remove('is-moving'))
  // Anyone can stop it, from a keyboard or a touch screen too, and it stays stopped until they start it again.
  const tickerToggle = document.querySelector<HTMLButtonElement>('#ticker-toggle')!
  tickerToggle.addEventListener('click', () => {
    const paused = ticker.classList.toggle('is-paused')
    tickerToggle.setAttribute('aria-pressed', String(paused))
    tickerToggle.setAttribute('aria-label', paused ? 'Play the recorded runs' : 'Pause the recorded runs')
    tickerToggle.firstElementChild!.textContent = paused ? '▶' : '❚❚'
  })

  // Section backgrounds load as their section comes near, not with the first screen.
  const nearSections = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-near')
      nearSections.unobserve(entry.target)
    }
  }, { rootMargin: '800px 0px' })
  for (const section of document.querySelectorAll('[data-lazy-bg]')) nearSections.observe(section)

  /** Calls `run` once, the first time `el` is a third on screen. */
  const onFirstView = (el: Element, run: () => void): void => {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(entry => entry.isIntersecting)) return
      observer.disconnect()
      run()
    }, { threshold: 0.3 })
    observer.observe(el)
  }

  // The navy band's caret and flow dots play once, for a few seconds, when the band is first seen.
  const countBand = document.querySelector<HTMLElement>('.count-band')!
  if (!reducedMotion.matches) onFirstView(countBand, () => countBand.classList.add('is-live'))

  // The benchmark bars fill once, the first time they are seen; the prerendered page shows them full.
  const bench = document.querySelector<HTMLElement>('.bench')!
  if (!reducedMotion.matches) {
    bench.classList.add('is-armed')
    onFirstView(bench, () => bench.classList.add('is-shown'))
  }

  // "103 of 106" counts up from zero the first time it is seen.
  for (const counter of document.querySelectorAll<HTMLElement>('.count-up')) {
    const target = Number(counter.dataset.to)
    if (reducedMotion.matches || !Number.isFinite(target)) continue
    counter.textContent = '0'
    onFirstView(counter, () => {
      const started = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 1200)
        counter.textContent = String(Math.round(target * (1 - (1 - t) ** 3)))
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  // The run grid and the formats grid name the cell under the pointer.
  const hoverLabel = (grid: HTMLElement, cellSelector: string, label: HTMLElement, data: string, idle: string): void => {
    let active: HTMLElement | null = null
    const show = (cell: HTMLElement | null) => {
      active?.classList.remove('is-active')
      active = cell
      active?.classList.add('is-active')
      label.textContent = cell?.dataset[data] ?? idle
    }
    grid.addEventListener('pointerover', (event) => show((event.target as Element).closest<HTMLElement>(cellSelector)))
    grid.addEventListener('pointerleave', () => show(null))
  }
  hoverLabel(document.querySelector<HTMLElement>('.run-grid')!, '.run-cell', document.querySelector<HTMLElement>('#run-label')!, 'label', 'Hover a case')
  const formatNote = document.querySelector<HTMLElement>('#format-note')!
  hoverLabel(document.querySelector<HTMLElement>('.formats-grid')!, '.format-cell', formatNote, 'note', formatNote.textContent ?? '')

  // Run it yourself: the open tab's terminal lines, copied as one script.
  const selfhostCopy = document.querySelector<HTMLButtonElement>('#selfhost-copy')!
  const selfhostStatus = document.querySelector<HTMLElement>('#selfhost-status')!
  selfhostCopy.addEventListener('click', async () => {
    const panel = document.querySelector<HTMLElement>('.selfhost-panel:not([hidden])')!
    track('get_code_copy', { tab: `selfhost-${panel.id.replace('sh-panel-', '')}` })
    const lines = [...panel.querySelectorAll<HTMLElement>('.code-text')].map(line => line.textContent ?? '')
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      selfhostCopy.textContent = 'Copied ✓'
      selfhostStatus.textContent = 'Copied to the clipboard.'
      window.setTimeout(() => { selfhostCopy.textContent = 'Copy' }, 2200)
    } catch { selfhostStatus.textContent = 'Copy failed. Select the text manually.' }
  })

  // The second form near the end hands its URL to the hero form, so the preview, its quota and its errors are the same.
  const ctaForm = document.querySelector<HTMLFormElement>('#cta-form')!
  const ctaInput = document.querySelector<HTMLInputElement>('#cta-url')!
  ctaForm.addEventListener('submit', (event) => {
    event.preventDefault()
    input.value = ctaInput.value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('#top')!.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' })
    form.requestSubmit()
  })
}
