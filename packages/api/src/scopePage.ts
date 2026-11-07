import type { SiteScope } from './chromeHandoff.js'

/** The site's octopus (`apps/public-web/public/assets/octopus-160.webp`), inline: this page is written into a blank tab, so it loads nothing. */
const OCTOPUS = 'data:image/webp;base64,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'

/**
 * The page's look, from octocrawl.dev: a night sky over a living mountain of glyphs, one white card, monospaced labels, and the
 * card printed open under a dotted head as the site's menus are (`docs-assets/nav.css`). The page sets its own
 * background and `color-scheme`: a blank tab is dark in a dark Chrome, and text with only a colour of its own vanished.
 */
const STYLE = `:root{color-scheme:dark;--ink:#10254e;--text:#334563;--muted:#566b8c;--orange:#f3683d;--rust:#b8461d}
*{box-sizing:border-box}
html{min-height:100%;background:#071b4f}
body{position:relative;display:flex;min-height:100vh;margin:0;padding:40px 16px;align-items:center;justify-content:center;color:var(--ink);background:radial-gradient(90% 55% at 72% 112%,rgba(243,104,61,.5),transparent 70%),linear-gradient(#061540,#0b2263 62%,#2a2a6b);font:15px/1.55 "Helvetica Neue",Helvetica,Arial,sans-serif}
#field{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
.card{position:relative;width:100%;max-width:520px;padding:28px 30px 26px;border:1px solid #e0e8f2;border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(7,27,79,.45)}
.brand{display:flex;align-items:center;gap:12px;margin:0 0 20px;font-size:17px;font-weight:600}
.brand img{width:52px;height:52px;border-radius:12px;background:#071b4f}
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

/**
 * Prints the card, then paints the glyph field and brings it to life the way the site's hero does: every cell stays on
 * its grid and only changes its light and its mark. Light drifts over the mountain, marks twinkle on their own clocks,
 * and sparks climb from cell to cell. The field is painted once; a frame draws only the cells that are lit. It runs
 * after the buttons are wired, so a failure here leaves them working, and it stands still for reduced motion.
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
const STEP_X = 11, STEP_Y = 15, FONT = '12px ui-monospace, Menlo, monospace'
const pen = field.getContext('2d'), painted = document.createElement('canvas')
let cells = [], crest = [], sparks = [], ratio = 1, width = 0, height = 0, lastFrame = 0, nextSpark = 0
const ridgeAt = (x) => height * (0.74 + 0.08 * Math.sin(x / 170 + 1) + 0.04 * Math.sin(x / 61) + 0.015 * Math.sin(x / 23 + 2))
const grainAt = (x, y) => Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1
const paint = () => {
  ratio = window.devicePixelRatio || 1; width = window.innerWidth; height = window.innerHeight
  field.width = painted.width = width * ratio; field.height = painted.height = height * ratio
  const brush = painted.getContext('2d')
  brush.scale(ratio, ratio); brush.font = FONT
  cells = []; crest = []; sparks = []
  for (let x = 4; x < width; x += STEP_X) {
    let top = true
    for (let y = 8; y < height; y += STEP_Y) {
      const grain = grainAt(x, y), land = y >= ridgeAt(x)
      if (!land && grain > 0.03) continue
      if (land && top) { crest.push({ x, y }); top = false }
      const warm = land && 0.5 + 0.5 * Math.sin(x / 90 - y / 60) > 0.55
      brush.fillStyle = !land ? 'rgba(157,178,214,.45)' : warm ? 'rgba(243,104,61,' + (0.25 + grain * 0.5) + ')' : 'rgba(45,162,255,' + (0.12 + grain * 0.3) + ')'
      brush.fillText(land ? NOISE[Math.floor(grain * NOISE.length)] : '·', x, y)
      cells.push({ x, y, grain, land, warm, clock: grainAt(y, x), period: 5 + grainAt(x + 1, y) * 9, twinkles: !land || grainAt(x, y + 1) < 0.34 })
    }
  }
}
// A lit cell's colour runs from its first glow to full light: orange to pale gold on warm ground, blue to ice on cool.
const lit = (cell, light) => {
  const from = cell.warm ? [243, 104, 61] : [96, 150, 255], to = cell.warm ? [255, 236, 196] : [228, 238, 255]
  const mix = (i) => Math.round(from[i] + (to[i] - from[i]) * light)
  return 'rgba(' + mix(0) + ',' + mix(1) + ',' + mix(2) + ',' + (0.45 + 0.55 * light) + ')'
}
const put = (cell, mark, colour) => {
  pen.clearRect(cell.x - 1, cell.y - 11, STEP_X, STEP_Y - 1)
  pen.fillStyle = colour; pen.fillText(mark, cell.x, cell.y)
}
const frame = (now) => {
  window.requestAnimationFrame(frame)
  if (now - lastFrame < 50) return
  lastFrame = now
  const t = now / 1000
  pen.setTransform(1, 0, 0, 1, 0, 0); pen.clearRect(0, 0, field.width, field.height); pen.drawImage(painted, 0, 0)
  pen.setTransform(ratio, 0, 0, ratio, 0, 0); pen.font = FONT
  const lights = [0, 1, 2].map((k) => ({ x: width * (0.5 + 0.62 * Math.sin(t / (13 + k * 5) + k * 2.1)), y: height * (0.86 + 0.08 * Math.sin(t / (9 + k * 3) + k)), r: width * (0.13 + k * 0.03) }))
  for (const cell of cells) {
    let light = 0
    if (cell.land) for (const glow of lights) {
      const dx = (cell.x - glow.x) / glow.r, dy = (cell.y - glow.y) / (glow.r * 0.55)
      light = Math.max(light, Math.exp(-(dx * dx + dy * dy)) * (0.45 + 0.55 * cell.grain))
    }
    if (cell.twinkles) {
      const phase = (t / cell.period + cell.clock) % 1
      if (phase < 0.12) light = Math.max(light, Math.sin((phase / 0.12) * Math.PI) ** 1.5)
    }
    if (light < 0.16) continue
    put(cell, cell.land ? NOISE[Math.min(4, Math.floor(light * 2.6 + cell.grain * 2.4))] : light > 0.6 ? '+' : ':', cell.land ? lit(cell, light) : 'rgba(228,238,255,' + (0.4 + 0.6 * light) + ')')
  }
  if (t >= nextSpark && crest.length > 0) {
    const from = crest[Math.floor(Math.random() * crest.length)]
    sparks.push({ x: from.x, y: from.y - STEP_Y, hop: t, left: 7 + Math.floor(Math.random() * 9), age: 0 })
    nextSpark = t + 0.35 + Math.random() * 0.9
  }
  sparks = sparks.filter((spark) => spark.left > 0)
  for (const spark of sparks) {
    if (t - spark.hop > 0.13) {
      spark.hop = t; spark.left -= 1; spark.age += 1; spark.y -= STEP_Y
      if (Math.random() < 0.3) spark.x += (Math.random() < 0.5 ? -1 : 1) * STEP_X
    }
    put(spark, spark.left > 6 ? '×' : spark.left > 3 ? '+' : '·', 'rgba(255,' + (150 + Math.min(spark.left, 8) * 10) + ',110,' + Math.min(1, 0.25 + spark.left * 0.14) + ')')
  }
}
const repaint = () => { paint(); pen.setTransform(1, 0, 0, 1, 0, 0); pen.clearRect(0, 0, field.width, field.height); pen.drawImage(painted, 0, 0) }
repaint()
window.addEventListener('resize', repaint)
if (!still) window.requestAnimationFrame(frame)`

/** The page that asks the person to allow the sites, written into a blank tab of their Chrome. */
export function scopePage(scope: SiteScope): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
  const sites = scope.hosts.map((host) => `<li><span aria-hidden="true">+</span><code>${escape(host)}</code></li>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Octocrawl asks to read pages</title><link rel="icon" href="${OCTOPUS}">
<style>${STYLE}</style></head>
<body><canvas id="field" aria-hidden="true"></canvas><main class="card">
<p class="brand row"><img src="${OCTOPUS}" alt="">Octocrawl</p>
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
