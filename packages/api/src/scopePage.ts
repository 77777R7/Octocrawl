import type { SiteScope } from './chromeHandoff.js'

/** The site's octopus mark, inline: this page is written into a blank tab, so it loads nothing. */
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#2da2ff"/><stop offset=".52" stop-color="#f9dec0"/><stop offset="1" stop-color="#ff764b"/></linearGradient></defs><g fill="none" stroke="url(#g)" stroke-linecap="square" stroke-linejoin="miter"><path stroke-width="6" d="M22 24v-4l4-5h12l4 5v4M20 26v16m24-16v16M18 41c-2 5-6 6-9 3-3-3-1-7 2-7m8 8c-4 6-10 7-13 2m16-4c-2 7-4 11-8 11-3 0-4-3-2-5m15-5c-1 7-2 12-5 12-3 0-3-3-2-5m17-7c1 7 2 12 5 12 3 0 3-3 2-5m0-8c2 7 4 11 8 11 3 0 4-3 2-5m-7-8c2 5 6 6 9 3 3-3 1-7-2-7m-8 8c4 6 10 7 13 2"/><path stroke-width="4" d="M20 27c-5-2-8 0-8 4m32-4c5-2 8 0 8 4"/></g><path d="M22 24h20v13H22z" fill="#0d3d98"/><rect x="27" y="30" width="3" height="3" fill="#fff7dc"/><rect x="35" y="30" width="3" height="3" fill="#fff7dc"/><g fill="#fff7dc"><rect x="28" y="10" width="2" height="2"/><rect x="33" y="8" width="2" height="2"/><rect x="39" y="11" width="2" height="2"/></g></svg>`

/**
 * The page's look, from octocrawl.dev: a night sky over a mountain of glyphs, one white card, monospaced labels, and the
 * card printed open under a dotted head as the site's menus are (`docs-assets/nav.css`). The page sets its own
 * background and `color-scheme`: a blank tab is dark in a dark Chrome, and text with only a colour of its own vanished.
 */
const STYLE = `:root{color-scheme:dark;--ink:#10254e;--text:#334563;--muted:#566b8c;--orange:#f3683d;--rust:#b8461d}
*{box-sizing:border-box}
html{min-height:100%;background:#071b4f}
body{position:relative;display:flex;min-height:100vh;margin:0;padding:40px 16px;align-items:center;justify-content:center;color:var(--ink);background:radial-gradient(90% 55% at 72% 112%,rgba(243,104,61,.5),transparent 70%),linear-gradient(#061540,#0b2263 62%,#2a2a6b);font:15px/1.55 "Helvetica Neue",Helvetica,Arial,sans-serif}
#field{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
.card{position:relative;width:100%;max-width:520px;padding:28px 30px 26px;border:1px solid #e0e8f2;border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(7,27,79,.45)}
.brand{display:flex;align-items:center;gap:10px;margin:0 0 20px;font-size:16px;font-weight:600}
.brand svg{padding:3px;border-radius:8px;background:#071b4f;width:36px;height:36px}
h1{margin:0 0 20px;font-size:22px;font-weight:500;line-height:1.3;letter-spacing:-.01em}
.kicker{display:flex;align-items:center;gap:8px;margin:0 0 8px;color:var(--muted);font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase}
.kicker::before{flex:none;width:6px;height:6px;background:var(--rust);content:""}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.task{margin:0 0 18px;color:var(--text)}
.sites{max-height:32vh;margin:0 0 18px;padding:10px 14px;overflow:auto;border-radius:8px;background:#f6f8fc;list-style:none}
.sites li{display:flex;gap:10px;padding:2px 0}
.sites span{color:var(--rust);font:600 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.note{margin:0 0 22px;color:var(--text);font-size:14px}
.actions{display:flex;flex-wrap:wrap;gap:8px}
button{min-height:44px;padding:0 20px;border:1px solid transparent;border-radius:22px;font:600 15px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;cursor:pointer}
#allow{color:var(--ink);background:var(--orange)}
#allow:hover{background:#f7825e}
#revoke{color:var(--ink);background:#fff;border-color:#c9d4e6}
#revoke:hover{background:#f6f8fc}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
:root[data-octocrawl=allowed] #allow,:root[data-octocrawl=revoked] #allow{color:var(--muted);background:#eef2f9;cursor:default}
#state{margin:14px 0 0;color:var(--rust);font:600 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
#state:empty{display:none}
.is-printing{animation:print .42s steps(24,end) backwards}
.is-printing::after{position:absolute;left:14px;right:14px;height:3px;background:radial-gradient(circle,#b8461d 1.1px,transparent 1.5px) 0 50%/7px 3px repeat-x;pointer-events:none;content:"";animation:head .42s steps(24,end) forwards}
.is-printing .row{animation:row .01s backwards;animation-delay:calc(var(--row,0)*34ms + 40ms)}
@keyframes print{from{clip-path:inset(0 0 calc(100% - 3px) 0 round 14px)}to{clip-path:inset(0 0 0 0 round 14px)}}
@keyframes head{from{top:0;opacity:1}85%{opacity:1}to{top:calc(100% - 3px);opacity:0}}
@keyframes row{from,to{opacity:0}}
@media (prefers-reduced-motion:reduce){.is-printing,.is-printing::after,.is-printing .row{animation:none}}
@media (max-width:480px){.card{padding:22px 20px}h1{font-size:19px}.actions button{width:100%}}`

/** Paints the glyph field and prints the card. It runs after the buttons are wired, and a failure here leaves them working. */
const MOTION = `const field = document.getElementById('field'), card = document.querySelector('.card'), NOISE = '·:+×#'
const paint = () => {
  const ratio = window.devicePixelRatio || 1, width = window.innerWidth, height = window.innerHeight
  field.width = width * ratio; field.height = height * ratio
  const pen = field.getContext('2d')
  pen.scale(ratio, ratio); pen.font = '12px ui-monospace, Menlo, monospace'
  for (let y = 8; y < height; y += 15) for (let x = 4; x < width; x += 11) {
    const ridge = height * (0.74 + 0.08 * Math.sin(x / 170 + 1) + 0.04 * Math.sin(x / 61) + 0.015 * Math.sin(x / 23 + 2))
    const grain = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
    if (y < ridge) {
      if (grain > 0.03) continue
      pen.fillStyle = 'rgba(157,178,214,.45)'; pen.fillText('·', x, y)
      continue
    }
    const face = 0.5 + 0.5 * Math.sin(x / 90 - y / 60)
    pen.fillStyle = face > 0.55 ? 'rgba(243,104,61,' + (0.25 + grain * 0.5) + ')' : 'rgba(45,162,255,' + (0.12 + grain * 0.3) + ')'
    pen.fillText(NOISE[Math.floor(grain * NOISE.length)], x, y)
  }
}
paint()
window.addEventListener('resize', paint)
const decode = (element, delay) => {
  const text = element.textContent, letters = [...text], span = Math.min(380, 120 + letters.length * 10), start = performance.now() + delay
  const timer = setInterval(() => {
    const t = performance.now() - start
    if (t >= span) { element.textContent = text; clearInterval(timer); return }
    element.textContent = letters.map((letter, i) => letter === ' ' || t >= (i / letters.length) * span ? letter : NOISE[(i + Math.floor(Math.max(t, 0) / 30)) % NOISE.length]).join('')
  }, 30)
}
if (document.visibilityState === 'visible' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.querySelectorAll('.row').forEach((row, i) => row.style.setProperty('--row', String(i)))
  card.classList.add('is-printing')
  ;[...document.querySelectorAll('.kicker, .sites code')].slice(0, 16).forEach((element, i) => decode(element, 60 + i * 24))
  setTimeout(() => card.classList.remove('is-printing'), 700)
}`

/** The page that asks the person to allow the sites, written into a blank tab of their Chrome. */
export function scopePage(scope: SiteScope): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const sites = scope.hosts.map((host) => `<li><span aria-hidden="true">+</span><code>${escape(host)}</code></li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Octocrawl asks to read pages</title>
<style>${STYLE}</style></head>
<body><canvas id="field" aria-hidden="true"></canvas><main class="card">
<p class="brand row">${MARK}Octocrawl</p>
<h1 class="row">Octocrawl asks to read pages in this Chrome</h1>
<p class="kicker row">Task</p><p class="task row"><code>${escape(scope.task)}</code></p>
<p class="kicker row">${scope.hosts.length} ${scope.hosts.length === 1 ? 'site' : 'sites'} it may read, signed in as you where you are</p><ul class="sites row">${sites}</ul>
<p class="note row">It reads only pages on these sites, only while this page stays open. A page that shows a check waits for you.</p>
<div class="actions row"><button id="allow">Allow reading these sites</button><button id="revoke">Revoke</button></div><p id="state" role="status"></p>
</main>
<script>
const root = document.documentElement, state = document.getElementById('state')
document.getElementById('allow').onclick = () => { if (root.dataset.octocrawl !== 'revoked') { root.dataset.octocrawl = 'allowed'; state.textContent = 'Allowed. Close this page or click Revoke to stop.' } }
document.getElementById('revoke').onclick = () => { root.dataset.octocrawl = 'revoked'; state.textContent = 'Revoked. Octocrawl reads nothing more here.' }
</script>
<script>${MOTION}</script></body></html>`
}
