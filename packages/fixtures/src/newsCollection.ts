/** Synthetic news index: sibling lead cards above a longer chronological list. */
export const NEWS_LEADS = [
  ['Device maker reports exceptional demand', '/news/device-demand'],
  ['Investment group considers security acquisition', '/news/security-acquisition'],
  ['Research laboratory announces chip financing', '/news/chip-financing'],
] as const

export function newsCollectionFixture(kind = 'valid', mainTag = 'div role="main"'): string {
  const card = (title: string, href: string, variant = '') => `<div class="news-card ${variant}"><div class="news-card__content"><div class="news-card__heading"><a href="${href}">${title}</a></div><p><a href="${href}">The report describes the companies involved and the terms announced today.</a></p></div></div>`
  const leads = NEWS_LEADS.map(([title, href], i) => card(kind === 'missing-lead' && i === 1 ? 'Different acquisition report' : title, kind === 'missing-lead' && i === 1 ? '/news/different' : href, i === 0 ? 'hero' : 'small'))
  const extra = (title: string) => card(title, '/excluded/' + title)
  return `<!doctype html><html><head><title>Technology reports</title></head><body>
    <nav>${extra('Navigation marker')}</nav>
    <${mainTag}><div class="grid">
      <div id="leads"><section><h2>Lead story</h2>${leads[0]}</section><section><h2>Top stories</h2>${leads[1]}${leads[2]}</section></div>
      <div class="sidebar"><section><h2>Recommended</h2>${extra('Sidebar marker')}</section></div>
      <section class="recommended-stories"><h2>Recommended stories</h2>${extra('Recommendation marker')}</section>
      <section><h2>You may also like</h2>${extra('Heading recommendation marker')}</section>
      <div class="sponsored">${extra('Advertisement marker')}</div>
      <section class="different-template"><h2>Other service</h2><div><a href="/other">Unrelated marker</a></div></section>
      <section id="stream"><h2>More technology</h2><ul>${Array.from({ length: 24 }, (_, i) => `<li class="stream-item"><time>2026-10-${String(18 - Math.floor(i / 3)).padStart(2, '0')}</time>${card(`Chronological report ${i + 1} on technology markets`, `/news/stream-${i + 1}`)}</li>`).join('')}</ul></section>
      <section>${extra('Following section marker')}</section>
    </div></${mainTag.split(' ')[0]}>
    <footer>${extra('Footer marker')}</footer>
  </body></html>`
}
