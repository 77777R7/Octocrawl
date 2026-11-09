import type { SiteScope } from './chromeHandoff.js'

/** The site's octopus (`apps/public-web/public/assets/octopus-160.webp`), inline: this page is written into a blank tab, so it loads nothing. */
const OCTOPUS = 'data:image/webp;base64,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'

/** Chrome's mark, drawn here for the same reason: the page shows which browser Octocrawl is connecting to. */
const CHROME = `<svg viewBox="-24 -24 48 48" width="34" height="34" aria-hidden="true"><path fill="#ea4335" d="M-18.76 -11.49A22 22 0 0 1 19.33 -10.50L0.00 -10.50A10.5 10.5 0 0 0 -9.09 5.25Z"/><path fill="#fbbc04" d="M-18.76 -11.49A22 22 0 0 1 19.33 -10.50L0.00 -10.50A10.5 10.5 0 0 0 -9.09 5.25Z" transform="rotate(120)"/><path fill="#34a853" d="M-18.76 -11.49A22 22 0 0 1 19.33 -10.50L0.00 -10.50A10.5 10.5 0 0 0 -9.09 5.25Z" transform="rotate(240)"/><circle r="10.5" fill="#fff"/><circle r="8" fill="#1a73e8"/></svg>`

/**
 * The page's look, from octocrawl.dev: a night sky over a sea of glyphs, one white card, monospaced labels, and the
 * card printed open under a dotted head as the site's menus are (`docs-assets/nav.css`). The page sets its own
 * background and `color-scheme`: a blank tab is dark in a dark Chrome, and text with only a colour of its own vanished.
 */
const STYLE = `:root{color-scheme:dark;--ink:#10254e;--text:#334563;--muted:#566b8c;--orange:#f3683d;--rust:#b8461d}
*{box-sizing:border-box}
html{min-height:100%;background:#071b4f}
body{position:relative;display:flex;min-height:100vh;margin:0;padding:40px 16px;align-items:center;justify-content:center;color:var(--ink);background:radial-gradient(90% 55% at 72% 112%,rgba(243,104,61,.5),transparent 70%),linear-gradient(#061540,#0b2263 62%,#2a2a6b);font:15px/1.55 "Helvetica Neue",Helvetica,Arial,sans-serif}
#field{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
.card{position:relative;width:100%;max-width:440px;padding:36px 32px 26px;border:1px solid #e0e8f2;border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(7,27,79,.45);text-align:center}
.marks{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 24px}
.mark{display:flex;width:56px;height:56px;align-items:center;justify-content:center;overflow:hidden;border-radius:14px;background:#071b4f}
.mark.chrome{background:#fff;box-shadow:inset 0 0 0 1px #d6dfec}
.mark img{width:100%;height:100%}
#link{width:7ch;color:var(--orange);font:700 14px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre}
h1{margin:0 0 8px;font-size:21px;font-weight:500;line-height:1.35;letter-spacing:-.01em;text-wrap:balance}
.task{margin:0 0 22px;color:var(--muted);overflow-wrap:anywhere}
code{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.access{margin:0 0 18px;padding:14px 16px;border-radius:10px;background:#f6f8fc}
.kicker{margin:0 0 8px;color:var(--muted);font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase}
.sites{max-height:28vh;margin:0;padding:0;overflow:auto;list-style:none}
.sites li{padding:1px 0}
.sites code{color:var(--ink);font-size:14px;font-weight:600}
.note{margin:0 0 22px;color:var(--text);font-size:13.5px;line-height:1.5;text-wrap:pretty}
.actions{display:grid;gap:4px}
button{border:0;font:600 15px/1 "Helvetica Neue",Helvetica,Arial,sans-serif;cursor:pointer}
#allow{min-height:46px;border-radius:23px;color:var(--ink);background:var(--orange)}
#allow:hover{background:#f7825e}
#revoke{min-height:38px;color:var(--muted);background:none}
#revoke:hover{color:var(--ink)}
button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
:root[data-octocrawl=allowed] #allow,:root[data-octocrawl=revoked] #allow{color:var(--muted);background:#eef2f9;cursor:default}
#state{margin:8px 0 0;color:var(--text);font-size:13px;line-height:1.5}
#state:empty{display:none}
.is-printing{animation:print .42s steps(24,end) backwards}
.is-printing::after{position:absolute;left:14px;right:14px;height:3px;background:radial-gradient(circle,#b8461d 1.1px,transparent 1.5px) 0 50%/7px 3px repeat-x;pointer-events:none;content:"";animation:head .42s steps(24,end) forwards}
.is-printing .row{animation:row .01s backwards;animation-delay:calc(var(--row,0)*34ms + 40ms)}
@keyframes print{from{clip-path:inset(0 0 calc(100% - 3px) 0 round 14px)}to{clip-path:inset(0 0 0 0 round 14px)}}
@keyframes head{from{top:0;opacity:1}85%{opacity:1}to{top:calc(100% - 3px);opacity:0}}
@keyframes row{from,to{opacity:0}}
@media (prefers-reduced-motion:reduce){.is-printing,.is-printing::after,.is-printing .row{animation:none}}
@media (max-width:480px){.card{padding:28px 20px 20px}h1{font-size:19px}}`

/**
 * Prints the card, then draws the glyph field: a night sky over a sea whose swells roll in from the left. Every cell
 * stays on its grid, as in the site's hero, and the water moves by which cells are water and what they show, not by a
 * picture being warped. It runs after the buttons are wired, so a failure here leaves them working, and it stands
 * still for reduced motion.
 */
const MOTION = `const field = document.getElementById('field'), card = document.querySelector('.card'), NOISE = '·:+×#'
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const decode = (element, delay) => {
  const text = element.textContent, letters = [...text], span = Math.min(380, 120 + letters.length * 10), start = performance.now() + delay
  const timer = setInterval(() => {
    const t = performance.now() - start
    if (t >= span) { element.textContent = text; clearInterval(timer); return }
    element.textContent = letters.map((letter, i) => letter === ' ' || t >= (i / letters.length) * span ? letter : NOISE[(i + Math.floor(Math.max(t, 0) / 30)) % NOISE.length]).join('')
  }, 30)
}
if (document.visibilityState === 'visible' && !still) {
  document.querySelectorAll('.row').forEach((row, i) => row.style.setProperty('--row', String(i)))
  card.classList.add('is-printing')
  ;[...document.querySelectorAll('.kicker, .sites code')].slice(0, 16).forEach((element, i) => decode(element, 60 + i * 24))
  setTimeout(() => card.classList.remove('is-printing'), 700)
}
// Between the two marks a glyph runs from Octocrawl to Chrome; the marks stay joined by plain dots for reduced motion.
const link = document.getElementById('link')
if (!still) { let at = 0; setInterval(() => { at = (at + 2) % 8; link.textContent = [...'· · · ·'].map((mark, i) => (i === at ? '×' : mark)).join('') }, 170) }
const STEP_X = 11, STEP_Y = 15, FONT = '12px ui-monospace, Menlo, monospace', WATER = '·:~+×', LEVELS = 12
const pen = field.getContext('2d'), painted = document.createElement('canvas')
const ramp = (from, to) => Array.from({ length: LEVELS }, (_, level) => {
  const light = level / (LEVELS - 1), mix = (i) => Math.round(from[i] + (to[i] - from[i]) * light)
  return 'rgba(' + mix(0) + ',' + mix(1) + ',' + mix(2) + ',' + (0.16 + 0.84 * light).toFixed(2) + ')'
})
const COOL = ramp([40, 96, 210], [150, 200, 255]), WARM = ramp([190, 70, 60], [255, 176, 120]), FOAM = ramp([170, 205, 255], [255, 250, 236])
const shade = (colours, light) => colours[Math.max(0, Math.min(LEVELS - 1, Math.round(light * (LEVELS - 1))))]
let stars = [], columns = [], sparks = [], ratio = 1, width = 0, height = 0, lastFrame = 0, nextSpark = 0
const grainAt = (x, y) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
// Two swells roll in from the left: a far one, low and slow, and a near one that carries the foam.
const farAt = (x, t) => height * (0.7 + 0.012 * Math.sin(x / 120 - t * 0.5) + 0.007 * Math.sin(x / 47 - t * 0.8 + 2))
const nearAt = (x, t) => height * (0.8 + 0.03 * Math.sin(x / 190 - t * 0.9) + 0.014 * Math.sin(x / 83 - t * 1.3 + 1) + 0.006 * Math.sin(x / 31 - t * 1.9))
const paint = () => {
  ratio = window.devicePixelRatio || 1; width = window.innerWidth; height = window.innerHeight
  field.width = painted.width = width * ratio; field.height = painted.height = height * ratio
  const brush = painted.getContext('2d')
  brush.scale(ratio, ratio); brush.font = FONT; brush.fillStyle = 'rgba(157,178,214,.45)'
  stars = []; columns = []; sparks = []
  const seaTop = Math.floor(height * 0.66 / STEP_Y) * STEP_Y + 8
  for (let x = 4; x < width; x += STEP_X) {
    for (let y = 8; y < seaTop; y += STEP_Y) {
      if (grainAt(x, y) > 0.03) continue
      brush.fillText('·', x, y)
      stars.push({ x, y, clock: grainAt(y, x), period: 5 + grainAt(x + 1, y) * 9 })
    }
    const rows = []
    for (let y = seaTop; y < height; y += STEP_Y) rows.push({ y, grain: grainAt(x, y) })
    columns.push({ x, rows })
  }
}
const put = (x, y, mark, colour) => { pen.fillStyle = colour; pen.fillText(mark, x, y) }
const draw = (t) => {
  pen.setTransform(1, 0, 0, 1, 0, 0); pen.clearRect(0, 0, field.width, field.height); pen.drawImage(painted, 0, 0)
  pen.setTransform(ratio, 0, 0, ratio, 0, 0); pen.font = FONT
  for (const star of stars) {
    const phase = (t / star.period + star.clock) % 1
    if (phase >= 0.12) continue
    const light = Math.sin((phase / 0.12) * Math.PI) ** 1.5
    pen.clearRect(star.x - 1, star.y - 11, STEP_X, STEP_Y - 1)
    put(star.x, star.y, light > 0.6 ? '+' : ':', 'rgba(228,238,255,' + (0.4 + 0.6 * light).toFixed(2) + ')')
  }
  for (const { x, rows } of columns) {
    const far = farAt(x, t), near = nearAt(x, t)
    for (const { y, grain } of rows) {
      if (y < far) continue
      if (y < near) {
        const crest = y - far < STEP_Y
        if (crest && grain > 0.55) continue
        const swell = 0.5 + 0.5 * Math.sin(x / 74 - y / 22 - t * 0.9)
        put(x, y, WATER[Math.floor(swell * 2 + grain * 1.9)], shade(crest ? FOAM : COOL, crest ? 0.32 : 0.1 + swell * 0.28))
        continue
      }
      const depth = (y - near) / Math.max(height - near, 1)
      if (y - near < STEP_Y && grain < 0.72) { put(x, y, grain < 0.3 ? '#' : '×', shade(FOAM, 0.6 + grain)); continue }
      const swell = 0.5 + 0.5 * Math.sin(x / 64 - y / 26 - t * 1.1) * Math.sin(x / 150 + y / 40 - t * 0.4)
      const glow = Math.sin(x / 210 + y / 80 - t * 0.35)
      put(x, y, WATER[Math.floor(swell * 3.1 + grain * 1.9)], shade(glow > 0.3 ? WARM : COOL, (0.2 + swell * 0.8) * (1 - depth * 0.4)))
    }
  }
  if (t >= nextSpark) {
    const x = 4 + Math.floor(Math.random() * width / STEP_X) * STEP_X
    sparks.push({ x, y: Math.round(nearAt(x, t) / STEP_Y) * STEP_Y - 7, hop: t, left: 3 + Math.floor(Math.random() * 4) })
    nextSpark = t + 0.2 + Math.random() * 0.5
  }
  sparks = sparks.filter((spark) => spark.left > 0)
  for (const spark of sparks) {
    if (t - spark.hop > 0.12) { spark.hop = t; spark.left -= 1; spark.y -= STEP_Y }
    put(spark.x, spark.y, spark.left > 3 ? '+' : spark.left > 1 ? ':' : '·', shade(FOAM, 0.25 + spark.left * 0.14))
  }
}
const frame = (now) => {
  window.requestAnimationFrame(frame)
  if (now - lastFrame < 33) return
  lastFrame = now
  draw(now / 1000)
}
const repaint = () => { paint(); draw(lastFrame / 1000 || 12) }
repaint()
window.addEventListener('resize', repaint)
if (!still) window.requestAnimationFrame(frame)`

/** The page that asks the person to allow the sites, written into a blank tab of their Chrome. */
export function scopePage(scope: SiteScope): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const sites = scope.hosts.map((host) => `<li><code>${escape(host)}</code></li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Octocrawl asks to read pages</title><link rel="icon" href="${OCTOPUS}">
<style>${STYLE}</style></head>
<body><canvas id="field" aria-hidden="true"></canvas><main class="card">
<div class="marks row"><span class="mark"><img src="${OCTOPUS}" alt="Octocrawl"></span><span id="link" aria-hidden="true">· · · ·</span><span class="mark chrome">${CHROME}</span></div>
<h1 class="row">Octocrawl asks to read pages in this Chrome</h1>
<p class="task row"><code>${escape(scope.task)}</code></p>
<div class="access row"><p class="kicker">${scope.hosts.length} ${scope.hosts.length === 1 ? 'site' : 'sites'} it may read</p><ul class="sites">${sites}</ul></div>
<p class="note row">${scope.remember === true
  ? 'It reads as you, where you are signed in, only on these sites. Octocrawl remembers them and reads them again without asking until you revoke them: Revoke here, or <code>octocrawl login revoke &lt;site&gt;</code>. Closing this page stops this run. A page that asks you to sign in, or shows a check, waits for you.'
  : 'It reads as you, where you are signed in, only on these sites and only while this page stays open. A page that asks you to sign in, or shows a check, waits for you.'}</p>
<div class="actions row"><button id="allow">Allow reading these sites</button><button id="revoke">Revoke</button></div><p id="state" role="status"></p>
</main>
<script>
const root = document.documentElement, state = document.getElementById('state')
document.getElementById('allow').onclick = () => { if (root.dataset.octocrawl !== 'revoked') { root.dataset.octocrawl = 'allowed'; state.textContent = ${JSON.stringify(scope.remember === true ? 'Allowed and remembered. Click Revoke to forget these sites; closing this page stops this run.' : 'Allowed. Close this page or click Revoke to stop.')} } }
document.getElementById('revoke').onclick = () => { root.dataset.octocrawl = 'revoked'; state.textContent = 'Revoked. Octocrawl reads nothing more here.' }
</script>
<script>${MOTION}</script></body></html>`
}
