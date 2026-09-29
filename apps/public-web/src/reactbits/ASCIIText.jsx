// Adapted from the React Bits ASCIIText JS-CSS registry source:
// https://reactbits.dev/r/ASCIIText-JS-CSS.json
// The W2L version keeps the text-to-ASCII renderer while limiting motion,
// removing external fonts and inline styles, and tracking only its Hero.

import { useEffect, useRef } from 'react';
import { CanvasTexture, Mesh, NearestFilter, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';
import './ASCIIText.css';

const vertexShader = `
varying vec2 vUv;
uniform float uTime;
uniform float mouse;
uniform float uEnableWaves;

void main() {
    vUv = uv;
    float time = uTime * 5.;

    float waveFactor = uEnableWaves;

    vec3 transformed = position;

    transformed.x += sin(time + position.y) * 0.5 * waveFactor;
    transformed.y += cos(time + position.z) * 0.15 * waveFactor;
    transformed.z += sin(time + position.x) * waveFactor;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float mouse;
uniform float uTime;
uniform sampler2D uTexture;

void main() {
    float time = uTime;
    vec2 pos = vUv;

    float move = sin(time + mouse) * 0.01;
    float r = texture2D(uTexture, pos + cos(time * 2. - time + pos.x) * .01).r;
    float g = texture2D(uTexture, pos + tan(time * .5 + pos.x - time) * .01).g;
    float b = texture2D(uTexture, pos - cos(time * 2. + time + pos.y) * .01).b;
    float a = texture2D(uTexture, pos).a;
    gl_FragColor = vec4(r, g, b, a);
}
`;

const mapRange = (n, start, stop, start2, stop2) => {
  return ((n - start) / (stop - start)) * (stop2 - start2) + start2;
};

// The mountain remains a normal, readable image. Its contours also determine
// the density of the decorative ASCII layer drawn over it.
const ARTWORK_SRC = '/assets/mountain-hero.webp';
const mountainImage = new Image();
mountainImage.src = ARTWORK_SRC;
const OCTOPUS_SRC = '/assets/octopus-original.webp';
const GLYPHS = '.,:;+=*/\\<>x#%@';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = value => value * value * (3 - 2 * value);
const cellNoise = (x, y, seed) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
};

// Glyph row height of the Hero artwork, in natural pixels of mountain-hero.webp. The artwork is hand-drawn,
// so its spacing drifts between ~12 and ~13 px; the octopus's rows follow it at MOTIF_ROW_SCALE.
const ARTWORK_CELL_Y = 12.9;
// The Hero shade darkens the artwork by roughly this much where the octopus sits.
const ARTWORK_SHADE = 0.8;
const mix = (from, to, amount) => from + (to - from) * amount;

// Rows follow the artwork's glyph rows (0.78×, clamped) so the arms keep their curls; columns are a monospace advance.
const MOTIF_ROW_SCALE = 0.78;
const MOTIF_ROW_MIN = 8;
const MOTIF_ROW_MAX = 11;
const MOTIF_ASPECT = 0.6;
const MOTIF_FIT = 0.94;
const MOTIF_FONT = "Menlo, 'SF Mono', SFMono-Regular, Consolas, 'DejaVu Sans Mono', monospace";
// Tone bands, light to heavy ink, in the artwork's own marks (drawn, not typed) and a few plain ASCII characters:
// dots and colons at the edge, where the silhouette dissolves into the mountain's glyphs, then crosses, then x and X
// in the body, like the crosses the artwork's light draws.
const ART_MARKS = { dot: 1, colon: 2, four: 3, cross: 4 };
const MOTIF_EDGES = [0.10, 0.26, 0.40, 0.55, 0.70, 0.85];
const MOTIF_BANDS = [
  [],
  ['dot', 'dot', '.'],
  ['colon', 'four', ':'],
  ['+', 'cross', '+'],
  ['x', 'cross', 'x'],
  ['X', 'x', 'X'],
  ['X'],
];
// What the arrival and the octopus's answer to the summit's light are written in.
const WAVE_GLYPHS = [...'+xX*'];
const WARM_GLOW = [255, 214, 188];
const EYE_COLOR = '#fff3d6';
// The warm light the eyes catch from the summit, and for how long.
const EYE_GLINT = '255,208,140';
const GLINT_MS = 800;
// The octopus decodes out of noise from its centre; the front starts a little way out and eases, so the
// head and inner arms are there within ~150 ms and the arm tips within ~0.8 s.
const ARRIVAL_MS = 1400;
const WAVE_MS = 900;
// The octopus needs only the wave field's slow drift, so it samples the field a few times a second.
const FIELD_MS = 150;
// How far the pointer (and its fading trail) pushes glyphs aside.
const PUSH_REACH = 152;
// Layout changes are coalesced: the glyph grid is rebuilt once the layer has kept its size this long.
const RESIZE_MS = 140;

/** The artwork's own marks: dot, colon, four-dot cross and cross. */
const drawArtworkGlyph = (ctx, level, cx, cy, size) => {
  const d = Math.max(1, size * 0.14);
  const dot = (x, y) => ctx.fillRect(x - d / 2, y - d / 2, d, d);
  const r = size * 0.2;
  if (level === 1) { dot(cx, cy); return; }
  if (level === 2) { dot(cx, cy - r); dot(cx, cy + r); return; }
  if (level === 3) { dot(cx - r, cy - r); dot(cx + r, cy - r); dot(cx - r, cy + r); dot(cx + r, cy + r); return; }
  const a = size * 0.25;
  ctx.lineWidth = d;
  ctx.beginPath();
  ctx.moveTo(cx - a, cy - a);
  ctx.lineTo(cx + a, cy + a);
  ctx.moveTo(cx + a, cy - a);
  ctx.lineTo(cx - a, cy + a);
  ctx.stroke();
};

// The source is analysed once at this size: large enough that the gaps between the arms stay open after
// blurring, small enough to sample every glyph cell cheaply on resize.
const ANALYSIS_SIZE = 384;
let octopusAnalysis = null;
let analysisRequest = null;

/** Separable box blur of a square field. */
const boxBlur = (source, size, radius) => {
  const pass = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const span = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += source[y * size + clamp(x, 0, size - 1)];
    for (let x = 0; x < size; x++) {
      pass[y * size + x] = sum / span;
      sum += source[y * size + clamp(x + radius + 1, 0, size - 1)] - source[y * size + clamp(x - radius, 0, size - 1)];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += pass[clamp(y, 0, size - 1) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum / span;
      sum += pass[clamp(y + radius + 1, 0, size - 1) * size + x] - pass[clamp(y - radius, 0, size - 1) * size + x];
    }
  }
  return out;
};

/** The two cream eye squares: small bright blobs with a dark ring around them (measured on the asset:
 * 14 px squares at 560.5,560.5 and 687.5,560.5 of 1254; ring mean luma about 0.10). */
const findEyes = (lum, size, crop) => {
  const seen = new Uint8Array(size * size);
  const found = [];
  for (let y = crop.y + 1; y < crop.y + crop.h - 1; y++) {
    for (let x = crop.x + 1; x < crop.x + crop.w - 1; x++) {
      const start = y * size + x;
      if (seen[start] || lum[start] < 0.7) continue;
      const stack = [start];
      seen[start] = 1;
      let count = 0, sumX = 0, sumY = 0, left = x, right = x, top = y, bottom = y;
      while (stack.length) {
        const i = stack.pop();
        const px = i % size;
        const py = (i - px) / size;
        count++; sumX += px; sumY += py;
        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
        for (const next of [i - 1, i + 1, i - size, i + size]) {
          if (next >= 0 && next < size * size && !seen[next] && lum[next] >= 0.7) { seen[next] = 1; stack.push(next); }
        }
      }
      if (count < 8 || count > 64 || right - left > 9 || bottom - top > 9) continue;
      let ring = 0, ringCount = 0;
      for (let ry = top - 4; ry <= bottom + 4; ry++) {
        for (let rx = left - 4; rx <= right + 4; rx++) {
          if (rx < 0 || ry < 0 || rx >= size || ry >= size) continue;
          if (rx >= left - 1 && rx <= right + 1 && ry >= top - 1 && ry <= bottom + 1) continue;
          ring += lum[ry * size + rx];
          ringCount++;
        }
      }
      if (ringCount && ring / ringCount < 0.2) found.push({ x: sumX / count + 0.5, y: sumY / count + 0.5, ring: ring / ringCount, left, right, top, bottom });
    }
  }
  return found.sort((a, b) => a.ring - b.ring).slice(0, 2);
};

const analyseOctopus = source => {
  const size = ANALYSIS_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  // Ground colour: median of the one-pixel border ring, robust to an odd bright border pixel.
  const ring = [[], [], []];
  for (let i = 0; i < size; i++) {
    for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]]) {
      const p = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) ring[c].push(pixels[p + c]);
    }
  }
  const ground = ring.map(values => values.sort((a, b) => a - b)[values.length >> 1]);
  const count = size * size;
  const ink = new Float32Array(count);
  const lum = new Float32Array(count);
  const rgb = new Uint8ClampedArray(count * 3);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    ink[i] = Math.hypot(pixels[p] - ground[0], pixels[p + 1] - ground[1], pixels[p + 2] - ground[2]) / 441.67;
    lum[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255;
    rgb[i * 3] = pixels[p]; rgb[i * 3 + 1] = pixels[p + 1]; rgb[i * 3 + 2] = pixels[p + 2];
  }
  // Two blurs fuse the source's own dot texture into a solid body while the gaps between the arms stay open.
  const body = boxBlur(boxBlur(ink, size, 3), size, 3);
  let left = size, top = size, right = 0, bottom = 0, lumHigh = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (body[i] > 0.06) lumHigh = Math.max(lumHigh, lum[i]);
      if (body[i] < 0.05) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (left > right) return null;
  const crop = { x: Math.max(0, left - 3), y: Math.max(0, top - 3) };
  crop.w = Math.min(size, right + 4) - crop.x;
  crop.h = Math.min(size, bottom + 4) - crop.y;
  const lumGround = (ground[0] * 0.2126 + ground[1] * 0.7152 + ground[2] * 0.0722) / 255;
  const eyes = findEyes(lum, size, crop);
  // The eyes are drawn as their own squares, so their light (and antialiased edge) must not brighten the
  // glyphs beside them: those cells see the dark socket around each eye instead, as in the source.
  const eyePixels = new Uint8Array(count);
  let socket = 0;
  for (const eye of eyes) {
    socket += eye.ring / eyes.length;
    for (let y = Math.max(0, eye.top - 1); y <= Math.min(size - 1, eye.bottom + 1); y++) {
      for (let x = Math.max(0, eye.left - 1); x <= Math.min(size - 1, eye.right + 1); x++) eyePixels[y * size + x] = 1;
    }
  }
  return { size, ink, lum, rgb, body, crop, lumGround, lumHigh, eyes, eyePixels, socket };
};

/** Analyse the source once per page. A Blob's bitmap is decoded and scaled off the main thread; drawing
 * the 1254 px image element instead blocks it for ~12 ms (~45 ms on a slow CPU), so that is the fallback. */
const requestOctopusAnalysis = () => {
  analysisRequest ??= (async () => {
    let source = null;
    try {
      const blob = await (await fetch(OCTOPUS_SRC)).blob();
      source = await createImageBitmap(blob, { resizeWidth: ANALYSIS_SIZE, resizeHeight: ANALYSIS_SIZE, resizeQuality: 'high' });
    } catch {
      const image = new Image();
      image.src = OCTOPUS_SRC;
      source = await image.decode().then(() => image, () => null);
    }
    octopusAnalysis = source ? analyseOctopus(source) : null;
    source?.close?.();
    // A failure is not cached here, but the hero treats an octopus that never drew as final for the page view.
    if (!octopusAnalysis) analysisRequest = null;
    return octopusAnalysis;
  })();
  return analysisRequest;
};

// The scene colours under the octopus come from a small copy of the artwork, decoded and scaled off the main
// thread once per page; sampling the full image on the main thread cost ~12 ms per resize (~50 ms on a slow CPU).
const ARTWORK_THUMB_WIDTH = 420;
let artworkThumb = null;
let artworkRequest = null;
let artworkFailed = false;

const requestArtworkThumb = () => {
  artworkRequest ??= (async () => {
    try {
      const blob = await (await fetch(ARTWORK_SRC)).blob();
      artworkThumb = await createImageBitmap(blob, { resizeWidth: ARTWORK_THUMB_WIDTH, resizeQuality: 'high' });
    } catch {
      try {
        // Without off-thread scaling, scale the loaded image once here.
        await mountainImage.decode();
        const canvas = document.createElement('canvas');
        canvas.width = ARTWORK_THUMB_WIDTH;
        canvas.height = Math.round(ARTWORK_THUMB_WIDTH * mountainImage.naturalHeight / mountainImage.naturalWidth);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(mountainImage, 0, 0, canvas.width, canvas.height);
        artworkThumb = canvas;
      } catch {
        artworkFailed = true;
      }
    }
    return artworkThumb;
  })();
  return artworkRequest;
};

class AsciiFilter {
  constructor(renderer, { fontSize, fontFamily, charset, invert, container, variant, fieldMode, motifMode } = {}) {
    this.renderer = renderer;
    this.domElement = document.createElement('div');
    this.domElement.className = 'w2l-ascii-filter';

    this.pre = document.createElement('pre');
    if (motifMode) {
      // The octopus is typed in characters on a canvas. A veil softens the artwork's own glyphs under
      // its silhouette so the two textures never clash; it stays hidden until it has that shape.
      this.veil = document.createElement('div');
      this.veil.className = 'w2l-ascii-veil';
      this.veil.hidden = true;
      this.domElement.appendChild(this.veil);
      this.output = document.createElement('canvas');
      this.output.className = 'w2l-ascii-motif';
      this.output.setAttribute('aria-hidden', 'true');
      this.outputContext = this.output.getContext('2d');
      this.domElement.appendChild(this.output);
      // The wave field renders into a target of one texel per glyph cell and is read back asynchronously, so
      // the GPU never stalls the page; the renderer's own canvas stays unused.
      this.fieldTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
      this.renderer.setSize(1, 1, false);
    } else {
      this.domElement.appendChild(this.pre);
    }
    this.maskTarget = this.output ?? this.pre;

    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.context = this.canvas.getContext('2d');
    this.domElement.appendChild(this.canvas);

    this.invert = invert ?? true;
    this.fontSize = fontSize ?? 12;
    this.fontFamily = fontFamily ?? "'Courier New', monospace";
    this.pre.style.fontSize = `${this.fontSize}px`;
    this.charset = charset ?? ' .\'`^",:;Il!i~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$';
    this.container = container;
    this.variant = variant ?? 0;
    this.fieldMode = Boolean(fieldMode);
    this.motifMode = Boolean(motifMode);
    this.pointer = { x: -1000, y: -1000, active: false };
    this.lastPointer = { x: -1000, y: -1000 };
    this.repel = 0;
    this.trail = [];
    this.lastTrailAt = 0;
    this.pushX = 0;
    this.pushY = 0;
    this.mountainTones = null;
    this.motifTones = null;
    this.fieldPixels = null;
    this.fieldReading = false;
    this.fieldAt = 0;
    this.sceneColors = null;
    this.scenePending = true;
    this.fit = MOTIF_FIT;
    this.ink = 1;
    this.eyeIndex = [];
    // The octopus's motion runs on a virtual clock that advances only while it is live, so resting freezes
    // every glyph where it is and waking carries on from there. Also: answers to the summit's light (one
    // running, at most one queued), glyphs rewritten by past answers, the arrival start (null before the first
    // frame), the next eye blink, when the eyes last caught the summit's light, and whether the canvas must be
    // redrawn.
    this.clock = 0;
    this.lastTick = 0;
    this.restRequested = false;
    this.resting = false;
    this.pointerMoved = false;
    this.waves = [];
    this.rewrites = 0;
    this.arrivalAt = null;
    this.nextBlink = 4200;
    this.glintAt = null;
    this.dirty = true;
    this.disposed = false;
    // In motif mode the artwork sets the glyph scale and colours, so its arrival (or failure) resets the grid.
    this.onMountainLoad = () => {
      if (!this.motifMode) this.updateMountainSample();
      else this.regrid();
    };
    if (this.fieldMode || this.motifMode) {
      mountainImage.addEventListener('load', this.onMountainLoad);
      mountainImage.addEventListener('error', this.onMountainLoad);
    }

    this.context.webkitImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.imageSmoothingEnabled = false;

  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    if (!this.motifMode) this.renderer.setSize(width, height);
    this.reset();
    if (this.motifMode) this.fieldTarget.setSize(this.cols, this.rows);
  }

  /** Rebuild the grid for the current size (the artwork or its colours arrived), and let the owner redraw. */
  regrid() {
    if (!this.width || this.disposed) return;
    this.setSize(this.width, this.height);
    this.onRegrid?.();
  }

  reset() {
    if (this.motifMode) this.resetArtworkGrid();
    else {
      this.context.font = `${this.fontSize}px ${this.fontFamily}`;
      this.cellW = this.context.measureText('A').width;
      this.cellH = this.fontSize;
      this.offsetX = 0;
      this.offsetY = 0;
      this.cols = Math.floor(this.width / this.cellW);
      this.rows = Math.floor(this.height / this.cellH);
    }

    this.canvas.width = this.cols;
    this.canvas.height = this.rows;
    this.fieldPixels = null;
    this.dirty = true;
    this.updateMountainSample();
    this.updateMotifSample();
  }

  /** Where the Hero artwork is drawn relative to this layer (CSS `cover` + background-position). */
  artworkPlacement() {
    const hero = this.container?.closest('.hero');
    const backdrop = hero?.querySelector('.hero-backdrop');
    if (!hero || !backdrop || !mountainImage.naturalWidth) return null;
    const heroRect = hero.getBoundingClientRect();
    const layerRect = this.container.getBoundingClientRect();
    if (!heroRect.width || !heroRect.height || !layerRect.width || !layerRect.height) return null;

    const [rawX = '50%', rawY = '50%'] = getComputedStyle(backdrop).backgroundPosition.split(' ');
    const position = raw => raw === 'center' ? 0.5 : clamp(parseFloat(raw) / 100 || 0, 0, 1);
    const scale = Math.max(heroRect.width / mountainImage.naturalWidth, heroRect.height / mountainImage.naturalHeight);
    const imageWidth = mountainImage.naturalWidth * scale;
    const imageHeight = mountainImage.naturalHeight * scale;
    return {
      scale,
      imageWidth,
      imageHeight,
      layerRect,
      imageX: (heroRect.width - imageWidth) * position(rawX),
      imageY: (heroRect.height - imageHeight) * position(rawY),
      layerX: layerRect.left - heroRect.left,
      layerY: layerRect.top - heroRect.top
    };
  }

  resetArtworkGrid() {
    const art = this.artworkPlacement();
    const scale = art?.scale ?? 0.8;
    // The page sets how much of its layer the octopus fills (--octopus-fit) and how strongly its glyphs are inked
    // (--octopus-ink), so it keeps the left window's weight at every width; the static octopus follows both.
    const style = getComputedStyle(this.container);
    this.fit = parseFloat(style.getPropertyValue('--octopus-fit')) || MOTIF_FIT;
    this.ink = parseFloat(style.getPropertyValue('--octopus-ink')) || 1;
    this.cellH = clamp(ARTWORK_CELL_Y * scale * MOTIF_ROW_SCALE, MOTIF_ROW_MIN, MOTIF_ROW_MAX);
    this.cellW = this.cellH * MOTIF_ASPECT;
    this.fontPx = Math.max(7, Math.round(Math.min(this.cellH * 0.96, this.cellW / 0.6) * 2) / 2);
    this.cols = Math.max(1, Math.floor(this.width / this.cellW));
    this.rows = Math.max(1, Math.floor(this.height / this.cellH));
    this.offsetX = (this.width - this.cols * this.cellW) / 2;
    this.offsetY = (this.height - this.rows * this.cellH) / 2;
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.output.width = Math.max(1, Math.round(this.width * this.pixelRatio));
    this.output.height = Math.max(1, Math.round(this.height * this.pixelRatio));
    Object.assign(this.veil.style, {
      left: `${this.offsetX}px`,
      top: `${this.offsetY}px`,
      width: `${this.cols * this.cellW}px`,
      height: `${this.rows * this.cellH}px`
    });
    this.sceneColors = null;
    // The first frame waits while the artwork or its thumbnail is on its way (see drawMotif); without them the
    // octopus goes ahead untinted.
    this.scenePending = art ? !artworkThumb && !artworkFailed : !mountainImage.complete;
    if (!art) return;
    if (!artworkThumb) {
      // The shared thumbnail scales off the main thread; sample (once) when it lands, or go on without it.
      if (!this.awaitingArtwork && !artworkFailed) {
        this.awaitingArtwork = true;
        requestArtworkThumb().then(() => {
          this.awaitingArtwork = false;
          this.regrid();
        });
      }
      return;
    }
    // One averaged artwork colour per glyph cell, used to tint the octopus glyph drawn there.
    const sample = document.createElement('canvas');
    sample.width = this.cols;
    sample.height = this.rows;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingQuality = 'high';
    const thumb = artworkThumb.width / mountainImage.naturalWidth;
    context.drawImage(
      artworkThumb,
      (art.layerX + this.offsetX - art.imageX) / art.scale * thumb,
      (art.layerY + this.offsetY - art.imageY) / art.scale * thumb,
      this.cols * this.cellW / art.scale * thumb,
      this.rows * this.cellH / art.scale * thumb,
      0, 0, this.cols, this.rows
    );
    this.sceneColors = context.getImageData(0, 0, this.cols, this.rows).data;
  }

  updateMountainSample() {
    if (!this.fieldMode || this.motifMode || !this.cols || !this.rows) return;
    const art = this.artworkPlacement();
    if (!art) return;

    const sample = document.createElement('canvas');
    sample.width = this.cols;
    sample.height = this.rows;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(
      mountainImage,
      (art.imageX - art.layerX) * this.cols / art.layerRect.width,
      (art.imageY - art.layerY) * this.rows / art.layerRect.height,
      art.imageWidth * this.cols / art.layerRect.width,
      art.imageHeight * this.rows / art.layerRect.height
    );
    const pixels = context.getImageData(0, 0, this.cols, this.rows).data;
    const luminance = new Float32Array(this.cols * this.rows);
    for (let i = 0; i < luminance.length; i++) {
      const p = i * 4;
      luminance[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255;
    }
    const sorted = Array.from(luminance).sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.05)];
    const high = sorted[Math.floor(sorted.length * 0.95)];
    const range = Math.max(0.08, high - low);
    this.mountainTones = luminance.map(value => Math.pow(clamp((value - low) / range, 0, 1), 0.58));
  }

  /** Sample the analysed octopus once per glyph cell: its shape, tone, colour bucket and eyes, plus the
   * per-cell timing that keeps the glyphs changing at different moments. */
  updateMotifSample() {
    if (!this.motifMode || !this.cols || !this.rows) return;
    const analysis = octopusAnalysis;
    if (!analysis) {
      // The shared analysis decodes off the main thread; sample (once) when it lands.
      if (!this.awaitingAnalysis && !this.analysisFailed) {
        this.awaitingAnalysis = true;
        requestOctopusAnalysis().then(result => {
          this.awaitingAnalysis = false;
          if (this.disposed) return;
          if (result) this.updateMotifSample();
          else {
            // Without the source's shape there is nothing to type: the owner stops and reports a stall.
            this.analysisFailed = true;
            this.onAnalysisFailed?.();
          }
        });
      }
      return;
    }
    // The artwork's colours re-grid the octopus when they land; a sample taken before them would be thrown away.
    if (this.scenePending) return;
    const { size, ink, lum, rgb, body, crop, lumGround, lumHigh, eyePixels, socket } = analysis;
    const { cols, rows, cellW, cellH, variant } = this;
    const count = cols * rows;
    // Contain the silhouette in the grid, centred, in layer px per analysis px.
    const scale = Math.min(cols * cellW / crop.w, rows * cellH / crop.h) * this.fit;
    const drawX = (cols * cellW - crop.w * scale) / 2;
    const drawY = (rows * cellH - crop.h * scale) / 2;
    const litRange = Math.max(0.05, lumHigh - lumGround);
    const tones = new Float32Array(count);
    const fill = new Float32Array(count);
    const bucketOf = new Uint8Array(count);
    const eye = new Uint8Array(count);
    const phase = new Float32Array(count);
    const period = new Float32Array(count);
    // Turns a cell has gained on its period under the pointer (see drawMotif).
    const boost = new Float32Array(count);
    const dither = new Float32Array(count);
    const radius = new Float32Array(count);
    const floor = new Float32Array(count);
    const buckets = new Map();
    const scene = this.sceneColors;
    for (let cy = 0; cy < rows; cy++) {
      const y0 = Math.floor(crop.y + (cy * cellH - drawY) / scale);
      const y1 = Math.max(y0 + 1, Math.ceil(crop.y + ((cy + 1) * cellH - drawY) / scale));
      for (let cx = 0; cx < cols; cx++) {
        const i = cx + cy * cols;
        const x0 = Math.floor(crop.x + (cx * cellW - drawX) / scale);
        const x1 = Math.max(x0 + 1, Math.ceil(crop.x + ((cx + 1) * cellW - drawX) / scale));
        let n = 0, b = 0, k = 0, l = 0, lMax = 0, best = -1, weight = 0, wr = 0, wg = 0, wb = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            n++;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const p = y * size + x;
            b += body[p];
            k += ink[p];
            if (eyePixels[p]) {
              l += socket;
              continue;
            }
            l += lum[p];
            if (lum[p] > lMax) { lMax = lum[p]; best = p; }
            const w = ink[p] + 0.001;
            weight += w;
            wr += rgb[p * 3] * w; wg += rgb[p * 3 + 1] * w; wb += rgb[p * 3 + 2] * w;
          }
        }
        b /= n;
        k /= n;
        l /= n;
        // The blurred body also closes the two- and three-cell gaps between the arms. Typing needs the source's
        // own ink in the cell as well, so those gaps stay open and the arms keep their curled tips; the veil
        // still follows the blurred body.
        const inside = clamp((b - 0.035) / 0.05, 0, 1) * smoothstep(clamp((k - 0.05) / 0.07, 0, 1));
        const lit = clamp((0.6 * lMax + 0.4 * l - lumGround) / litRange, 0, 1);
        const tone = inside * (0.28 + 0.72 * lit ** 0.85);
        tones[i] = tone;
        fill[i] = b;
        phase[i] = cellNoise(i, 5, variant) * 3000;
        period[i] = 1000 + 2000 * cellNoise(i, 3, variant);
        dither[i] = (cellNoise(cx, cy, variant) - 0.5) * 0.144;
        // Over the bright sunset the veil leaves a mid-grey bed rather than navy, so glyphs there gain opacity
        // (and lift toward their highlight below) to keep the lower arms readable.
        const at = i * 4;
        const bright = scene ? smoothstep(clamp(((scene[at] * 0.2126 + scene[at + 1] * 0.7152 + scene[at + 2] * 0.0722) / 255 - 0.3) / 0.35, 0, 1)) : 0;
        floor[i] = 0.3 + 0.22 * bright;
        // Only cells that can ever be drawn get a colour, so empty sky never skews a bucket's mean.
        if (tone < 0.06 || !weight) continue;
        // The brightest pixel keeps a dot's own colour; plain averaging turns the cream and blue dots grey.
        let r, g, bl;
        if (best >= 0 && ink[best] > 0.12) { r = rgb[best * 3]; g = rgb[best * 3 + 1]; bl = rgb[best * 3 + 2]; }
        else { r = wr / weight; g = wg / weight; bl = wb / weight; }
        let cr, cg, cb;
        const warm = clamp((r - bl) / 90, 0, 1) >= 0.35;
        if (!warm) {
          // Blue body, brightened to read over the navy sky; brighter cells lift toward ice blue.
          cr = mix(mix(r, 92, 0.55), 190, tone * 0.45); cg = mix(mix(g, 138, 0.55), 212, tone * 0.45); cb = mix(mix(bl, 255, 0.55), 255, tone * 0.45);
        } else {
          // The warm rim keeps its orange; highlights lift toward cream.
          cr = mix(r, 255, tone * 0.25); cg = mix(g, 232, tone * 0.25); cb = mix(bl, 200, tone * 0.25);
        }
        if (bright) {
          const lift = bright * 0.4;
          cr = mix(cr, warm ? 255 : 214, lift); cg = mix(cg, warm ? 238 : 228, lift); cb = mix(cb, warm ? 220 : 255, lift);
        }
        if (scene) {
          cr = mix(cr, scene[at] * ARTWORK_SHADE, 0.1); cg = mix(cg, scene[at + 1] * ARTWORK_SHADE, 0.1); cb = mix(cb, scene[at + 2] * ARTWORK_SHADE, 0.1);
        }
        // A handful of colour buckets keeps fillStyle changes rare while drawing.
        const key = `${Math.round(clamp((cr - cb) / 180 + 0.5, 0, 1) * 4)}:${Math.round((cr + cg + cb) / 765 * 5)}`;
        let entry = buckets.get(key);
        if (!entry) {
          entry = { index: buckets.size, r: 0, g: 0, b: 0, n: 0 };
          buckets.set(key, entry);
        }
        entry.r += cr; entry.g += cg; entry.b += cb; entry.n++;
        bucketOf[i] = entry.index;
      }
    }
    const colors = [];
    const hot = [];
    for (const { r, g, b, n } of buckets.values()) {
      const mean = [r / n, g / n, b / n];
      colors.push(`rgb(${mean.map(Math.round).join(',')})`);
      for (let level = 1; level <= 3; level++) {
        const amount = 0.18 + 0.5 * level / 3;
        hot.push(`rgb(${mean.map((value, c) => Math.round(mix(value, WARM_GLOW[c], amount))).join(',')})`);
      }
    }
    // The eyes stay fixed, cream squares in the cells that hold the source's eyes.
    const eyeIndex = [];
    for (const spot of analysis.eyes) {
      const ex = Math.floor((drawX + (spot.x - crop.x) * scale) / cellW);
      const ey = Math.floor((drawY + (spot.y - crop.y) * scale) / cellH);
      if (ex < 0 || ey < 0 || ex >= cols || ey >= rows || eye[ex + ey * cols]) continue;
      eye[ex + ey * cols] = 1;
      eyeIndex.push(ex + ey * cols);
    }
    // Extents and centroid of the silhouette in layer px: the read wave crosses them, the arrival grows from the centre.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, sumX = 0, sumY = 0, members = 0;
    for (let i = 0; i < count; i++) {
      if (tones[i] < 0.1) continue;
      const x = this.offsetX + (i % cols + 0.5) * cellW;
      const y = this.offsetY + (Math.floor(i / cols) + 0.5) * cellH;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      members++;
    }
    if (!members) return;
    const centreX = sumX / members;
    const centreY = sumY / members;
    let far = 1;
    for (let i = 0; i < count; i++) {
      const distance = Math.hypot(this.offsetX + (i % cols + 0.5) * cellW - centreX, this.offsetY + (Math.floor(i / cols) + 0.5) * cellH - centreY);
      radius[i] = distance;
      if (tones[i] >= 0.1) far = Math.max(far, distance);
    }
    // Every cell gets a radius: pointer displacement can make any cell draw.
    for (let i = 0; i < count; i++) radius[i] = Math.min(1.2, radius[i] / far);
    // The page's text keeps quieter ink behind it (the page names it in a data-calm attribute): the octopus still
    // shows through the headline, but never at a glyph's full weight under a letter.
    const calm = new Float32Array(count).fill(1);
    const selectors = this.container?.closest('[data-calm]')?.getAttribute('data-calm');
    const layer = this.container?.getBoundingClientRect();
    if (selectors && layer) {
      for (const element of document.querySelectorAll(selectors)) {
        const r = element.getBoundingClientRect();
        const l = r.left - layer.left - 16;
        const t = r.top - layer.top - 10;
        const rr = r.right - layer.left + 16;
        const b = r.bottom - layer.top + 10;
        for (let cy = 0; cy < rows; cy++) {
          const y = this.offsetY + (cy + 0.5) * cellH;
          for (let cx = 0; cx < cols; cx++) {
            const x = this.offsetX + (cx + 0.5) * cellW;
            const outside = Math.hypot(Math.max(l - x, 0, x - rr), Math.max(t - y, 0, y - b));
            const i = cx + cy * cols;
            calm[i] = Math.min(calm[i], 1 - 0.62 * (1 - smoothstep(Math.min(1, outside / 28))));
          }
        }
      }
    }
    this.motifCalm = calm;
    this.motifMinX = minX;
    this.motifMaxX = maxX;
    this.motifMinY = minY;
    this.motifMaxY = maxY;
    this.motifTones = tones;
    this.motifFill = fill;
    this.motifBucket = bucketOf;
    this.motifEye = eye;
    this.motifPhase = phase;
    this.motifPeriod = period;
    this.motifBoost = boost;
    this.motifDither = dither;
    this.motifRadius = radius;
    this.motifFloor = floor;
    this.eyeIndex = eyeIndex;
    this.bucketColors = colors;
    this.bucketHot = hot;
    this.dirty = true;
    this.updateVeil();
  }

  /** Soften the artwork's glyphs under the octopus silhouette only (feathered, never a box). */
  updateVeil() {
    if (!this.veil || !this.motifFill) return;
    const mask = document.createElement('canvas');
    mask.width = this.cols;
    mask.height = this.rows;
    const context = mask.getContext('2d');
    if (!context) return;
    const image = context.createImageData(this.cols, this.rows);
    for (let i = 0; i < this.motifFill.length; i++) {
      image.data[i * 4 + 3] = Math.round(smoothstep(clamp((this.motifFill[i] - 0.03) / 0.08, 0, 1)) * 235);
    }
    context.putImageData(image, 0, 0);
    const url = `url(${mask.toDataURL()})`;
    this.veil.style.maskImage = url;
    this.veil.style.webkitMaskImage = url;
    // It fades in with the arrival (drawMotif), together with the glyphs.
    this.veil.hidden = this.arrivalAt === null;
  }

  render(scene, camera) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (this.motifMode) this.sampleField(scene, camera);
    else {
      this.renderer.render(scene, camera);
      this.context.clearRect(0, 0, w, h);
      if (this.context && w && h) {
        this.context.drawImage(this.renderer.domElement, 0, 0, w, h);
        this.fieldPixels = this.context.getImageData(0, 0, w, h).data;
      }
    }

    this.asciify(this.fieldPixels, w, h);
  }

  /** The octopus needs only the wave field's slow drift: render it a few times a second (never at rest) into
   * the one-texel-per-cell target and read it back without blocking; frames in between reuse the last field. */
  sampleField(scene, camera) {
    const now = performance.now();
    if (this.fieldReading || (this.fieldPixels && (this.resting || now - this.fieldAt < FIELD_MS))) return;
    const w = this.cols;
    const h = this.rows;
    const target = this.fieldTarget;
    if (target.width !== w || target.height !== h) return;
    this.renderer.setRenderTarget(target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.fieldReading = true;
    this.fieldAt = now;
    this.renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h, new Uint8Array(w * h * 4)).then(data => {
      this.fieldReading = false;
      if (this.disposed || w !== this.cols || h !== this.rows) return;
      // WebGL rows run bottom to top; the glyph grid runs top to bottom.
      const field = this.fieldPixels?.length === data.length ? this.fieldPixels : new Uint8Array(data.length);
      const stride = w * 4;
      for (let y = 0; y < h; y++) field.set(data.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
      this.fieldPixels = field;
    }, () => {
      this.fieldReading = false;
    });
  }

  /** How strongly the pointer and its fading trail push a cell aside; the push's origin lands in pushX/pushY. */
  pushAt(cellX, cellY) {
    let influence = 0;
    let sourceX = this.pointer.x;
    let sourceY = this.pointer.y;
    for (const stamp of this.trail) {
      const dx = cellX - stamp.x;
      const dy = cellY - stamp.y;
      const squared = dx * dx + dy * dy;
      if (squared >= PUSH_REACH * PUSH_REACH) continue;
      const strength = smoothstep(1 - Math.sqrt(squared) / PUSH_REACH) * stamp.fade;
      if (strength > influence) {
        influence = strength;
        sourceX = stamp.x;
        sourceY = stamp.y;
      }
    }
    if (this.pointer.active) {
      const distance = Math.hypot(cellX - this.pointer.x, cellY - this.pointer.y);
      const strength = distance < PUSH_REACH ? smoothstep(1 - distance / PUSH_REACH) * this.repel : 0;
      if (strength > influence) {
        influence = strength;
        sourceX = this.pointer.x;
        sourceY = this.pointer.y;
      }
    }
    this.pushX = sourceX;
    this.pushY = sourceY;
    return influence;
  }

  asciify(field, w, h) {
    // The octopus draws before its first field arrives (and between a resize and the next read) with a
    // neutral field; the other modes need one.
    if (w && h && (field || this.motifMode)) {
      this.repel += ((this.pointer.active ? 1 : 0) - this.repel) * 0.16;
      const now = performance.now();
      this.trail = this.trail.filter(stamp => now - stamp.at < 1050);
      for (const stamp of this.trail) stamp.fade = Math.pow(1 - (now - stamp.at) / 1050, 2);
      const lastStamp = this.trail.at(-1);
      const maskStrength = this.pointer.active ? this.repel : lastStamp ? Math.pow(1 - (now - lastStamp.at) / 1050, 2) : 0;
      if (maskStrength > 0.01) {
        const center = (1 - 0.45 * maskStrength).toFixed(3);
        const middle = (1 - 0.2 * maskStrength).toFixed(3);
        const mask = `radial-gradient(circle 155px at ${this.lastPointer.x}px ${this.lastPointer.y}px, rgba(0,0,0,${center}) 0%, rgba(0,0,0,${middle}) 45%, #000 100%)`;
        this.maskTarget.style.maskImage = mask;
        this.maskTarget.style.webkitMaskImage = mask;
      } else if (this.maskTarget.style.maskImage) {
        this.maskTarget.style.maskImage = '';
        this.maskTarget.style.webkitMaskImage = '';
      }
      if (this.motifMode) {
        this.drawMotif(field, w, h, now);
        return;
      }
      let str = '';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cellX = this.offsetX + (x + .5) * this.cellW;
          const cellY = this.offsetY + (y + .5) * this.cellH;
          const influence = this.pushAt(cellX, cellY);

          let sampleX = x;
          let sampleY = y;
          if (influence > 0.01) {
            const dx = cellX - this.pushX;
            const dy = cellY - this.pushY;
            const distance = Math.hypot(dx, dy);
            if (distance > 0) {
              // Soft inverse sampling moves glyphs aside without cutting a hole.
              sampleX -= (dx / distance) * 18 * influence / this.cellW;
              sampleY -= (dy / distance) * 18 * influence / this.cellH;
            }
          }
          const sx = clamp(Math.round(sampleX), 0, w - 1);
          const sy = clamp(Math.round(sampleY), 0, h - 1);
          const i = (sx + sy * w) * 4;
          const [r, g, b, a] = [field[i], field[i + 1], field[i + 2], field[i + 3]];

          if (a === 0) {
            str += this.fieldMode ? this.charset[0] : ' ';
            continue;
          }

          const gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
          let idx;
          if (this.fieldMode) {
            const mountain = this.mountainTones?.[sx + sy * w] ?? gray;
            const dither = (cellNoise(x, y, this.variant) - 0.5) * 0.16;
            const tone = clamp(mountain * 0.78 + gray * 0.22 + dither, 0, 1);
            idx = Math.round(tone * (1 - 0.55 * influence) * (this.charset.length - 1));
          } else {
            idx = Math.floor((1 - gray) * (this.charset.length - 1));
            if (this.invert) idx = this.charset.length - idx - 1;
          }
          str += this.charset[idx];
        }
        str += '\n';
      }
      this.pre.textContent = str;
    }
  }

  /** Type the octopus: tone bands of the artwork's marks and plain ASCII, re-rolled per cell over time and faster
   * under the pointer, a one-time decode from the centre, a warm answer that spreads from the side facing the
   * summit when the mountain's light reaches it (the eyes blink, then catch the light), blinking eyes, and quieter
   * ink behind the page's text. All of it runs on the virtual clock; at rest only the pointer's push changes glyphs,
   * and they return. */
  drawMotif(field, w, h, now) {
    const out = this.outputContext;
    if (!out) return;
    // Real time only feeds the virtual clock, capped so a slow frame or a hidden tab never jumps it.
    const dt = this.lastTick ? Math.min(50, now - this.lastTick) : 0;
    this.lastTick = now;
    out.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    out.clearRect(0, 0, this.width, this.height);
    const tones = this.motifTones;
    if (!tones || tones.length !== w * h) return;
    if (this.arrivalAt === null) {
      // Held until the artwork has set the glyph grid and colours, so the octopus never re-grids mid-arrival.
      if (this.scenePending) return;
      this.arrivalAt = this.clock;
      this.veil.hidden = false;
      this.onFirstFrame?.();
    }
    // A requested rest begins once the arrival and any wave have finished, so nothing freezes half-drawn.
    this.resting = this.restRequested && this.clock - this.arrivalAt >= ARRIVAL_MS && !this.waves.length;
    const step = this.resting ? 0 : dt;
    this.clock += step;
    const clock = this.clock;
    out.font = `600 ${this.fontPx}px ${MOTIF_FONT}`;
    out.textAlign = 'center';
    out.textBaseline = 'middle';
    out.lineCap = 'round';
    const { cellW, cellH, offsetX, offsetY, motifRadius: radius, motifEye: eye, motifBucket: bucket } = this;
    const { motifPhase: phase, motifPeriod: period, motifBoost: boost, motifDither: dither, motifFloor: floor, motifCalm: calm, bucketColors, bucketHot, ink } = this;
    const t = (clock - this.arrivalAt) / ARRIVAL_MS;
    const arriving = t < 1;
    const arrive = 0.12 + 1.08 * (1 - (1 - Math.min(1, t)) ** 2);
    let wave = this.waves[0];
    // The answer's radius, spreading from the octopus's side that faces the summit, below its eyes.
    let front = null;
    const originX = this.motifMaxX;
    const originY = mix(this.motifMinY, this.motifMaxY, 0.7);
    if (wave) {
      const k = (clock - wave.at) / WAVE_MS;
      if (k >= 1) {
        // The finished answer leaves its rewritten glyphs behind; a queued one starts now.
        this.waves.shift();
        this.rewrites += 1;
        if (this.waves[0]) this.waves[0].at = clock;
        wave = null;
      } else {
        front = Math.max(0, k) * (Math.hypot(this.motifMaxX - this.motifMinX, this.motifMaxY - this.motifMinY) + 48);
        // The light makes it blink as it arrives, and its eyes catch the light as they open.
        if (!wave.blinked) {
          wave.blinked = true;
          this.nextBlink = clock;
          this.glintAt = clock + 150;
        }
      }
    }
    if (clock >= this.nextBlink + 150) this.nextBlink = clock + 5200 + Math.random() * 2600;
    const blinking = !this.resting && clock >= this.nextBlink;
    const tick = Math.floor(clock / 60);
    const markSize = Math.min(cellW, cellH) * 1.25;
    const reach = 4 * cellW;
    const pushing = this.pointer.active || this.trail.length > 0;
    let current = '';
    for (let y = 0; y < h; y++) {
      const cellY = offsetY + (y + 0.5) * cellH;
      for (let x = 0; x < w; x++) {
        const dst = x + y * w;
        if (arriving && radius[dst] > arrive) continue;
        // Eyes are drawn last, at fixed cells.
        if (eye[dst]) continue;
        const cellX = offsetX + (x + 0.5) * cellW;
        const influence = pushing ? this.pushAt(cellX, cellY) : 0;
        // The pointer speeds up a cell's re-rolls (up to 6x) by adding turns as the virtual clock runs, never by
        // scaling the clock itself, so a glyph changes only when its own count does: at rest it keeps still.
        if (influence > 0.01) boost[dst] += step * 5 * influence / period[dst];
        let src = dst;
        if (influence > 0.01) {
          const dx = cellX - this.pushX;
          const dy = cellY - this.pushY;
          const distance = Math.hypot(dx, dy);
          if (distance > 0) {
            // Soft inverse sampling moves glyphs aside without cutting a hole.
            const sx = clamp(Math.round(x - (dx / distance) * 18 * influence / cellW), 0, w - 1);
            const sy = clamp(Math.round(y - (dy / distance) * 18 * influence / cellH), 0, h - 1);
            src = sx + sy * w;
          }
        }
        const shape = tones[src];
        if (shape < 0.06) continue;
        const f = src * 4;
        const gray = field ? (0.3 * field[f] + 0.6 * field[f + 1] + 0.1 * field[f + 2]) / 255 : 0.5;
        const tone = clamp(shape * (0.86 + 0.14 * gray) + 0.08 * Math.sin(clock * 0.0008 + cellX * 0.011 - cellY * 0.0072) + dither[dst] - 0.29 * influence, 0, 1);
        if (tone < 0.1) continue;
        const arrivalHeat = arriving && radius[dst] > arrive - 0.14;
        const along = front === null ? 0 : Math.hypot(cellX - originX, cellY - originY);
        const heat = arrivalHeat ? 1 : front === null ? 0 : clamp(1 - Math.abs(along - front) / reach, 0, 1);
        if (heat > 0) {
          // Arrival garble and the answer's front: warm glyphs from the same plain marks.
          const style = bucketHot[bucket[src] * 3 + (heat > 0.66 ? 2 : heat > 0.33 ? 1 : 0)];
          if (style !== current) {
            out.fillStyle = style;
            out.strokeStyle = style;
            current = style;
          }
          out.globalAlpha = Math.min(1, (floor[dst] + 0.62 * Math.max(tone + 0.25 * heat, 0.45) + 0.2 * heat) * ink * calm[dst]);
          out.fillText(WAVE_GLYPHS[Math.floor(cellNoise(dst, tick, 17) * WAVE_GLYPHS.length)], cellX, cellY);
          continue;
        }
        // Each cell re-rolls on its own period, faster under the pointer; waves move every glyph they pass on.
        const slot = Math.floor((clock + phase[dst]) / period[dst] + boost[dst]) + this.rewrites + (front !== null && along < front ? 1 : 0);
        let band = 1;
        while (band < 6 && tone >= MOTIF_EDGES[band]) band++;
        const set = MOTIF_BANDS[band];
        const glyph = set[Math.floor(cellNoise(dst, slot, band) * set.length)];
        const style = bucketColors[bucket[src]];
        if (style !== current) {
          out.fillStyle = style;
          out.strokeStyle = style;
          current = style;
        }
        out.globalAlpha = Math.min(1, (floor[dst] + 0.62 * tone) * ink * calm[dst]);
        const mark = ART_MARKS[glyph];
        if (mark) drawArtworkGlyph(out, mark, cellX, cellY, markSize);
        else out.fillText(glyph, cellX, cellY);
      }
    }
    if (this.eyeIndex.length) {
      const side = Math.max(2, Math.round(Math.min(cellW, cellH) * 0.85));
      const bar = Math.max(1, Math.round(cellH * 0.14));
      const tall = blinking ? bar : side;
      // The glint swells and fades over 0.8 s.
      const since = this.glintAt === null ? -1 : clock - this.glintAt;
      const glint = since < 0 || since > GLINT_MS ? 0 : Math.sin((since / GLINT_MS) * Math.PI) ** 2;
      for (const e of this.eyeIndex) {
        if (arriving && radius[e] > arrive) continue;
        const ex = offsetX + (e % w + 0.5) * cellW;
        const ey = offsetY + (Math.floor(e / w) + 0.5) * cellH;
        if (glint > 0.02) {
          const haloSize = side * 3.2;
          const halo = out.createRadialGradient(ex, ey, 0, ex, ey, haloSize);
          halo.addColorStop(0, `rgba(${EYE_GLINT},${(0.8 * glint).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${EYE_GLINT},0)`);
          out.globalAlpha = 1;
          out.fillStyle = halo;
          out.fillRect(ex - haloSize, ey - haloSize, haloSize * 2, haloSize * 2);
        }
        // The eyes sit in the gap between the headline and the description, so they keep their light there.
        out.globalAlpha = Math.max(0.9, calm[e]);
        out.fillStyle = EYE_COLOR;
        out.fillRect(Math.round(ex - side / 2), Math.round(ey - tall / 2), side, tall);
      }
    }
    out.globalAlpha = 1;
    this.dirty = false;
    this.pointerMoved = false;
  }

  /** The octopus's answer to the summit's light: one spreads at a time and at most one more waits. */
  addWave() {
    if (!this.waves.length) this.waves.push({ at: this.clock, blinked: false });
    else this.waves[1] = { at: 0, blinked: false };
  }

  /** The hero asks the octopus to rest while the visitor works with the form, and to wake after. */
  setRest(rest) {
    this.restRequested = rest;
  }

  /** Nothing on screen would change: resting, drawn, and the pointer still with its trail faded. */
  idle() {
    return this.resting && !this.dirty && !this.pointerMoved && !this.trail.length && Math.abs((this.pointer.active ? 1 : 0) - this.repel) < 0.01;
  }

  /** Finish the arrival and any wave and come to rest with the eyes open, so a stop never keeps a half-drawn
   * octopus. False before the first frame, when there is nothing to finish. */
  settle() {
    if (this.arrivalAt === null) return false;
    this.arrivalAt = Math.min(this.arrivalAt, this.clock - ARRIVAL_MS);
    this.waves = [];
    this.nextBlink = Infinity;
    this.glintAt = null;
    this.restRequested = true;
    // The kept frame never shows the pointer's push, which could no longer follow the pointer away.
    this.pointer = { x: -1000, y: -1000, active: false };
    this.trail = [];
    this.repel = 0;
    return true;
  }

  setPointer(x, y, active) {
    const now = performance.now();
    if (active) this.lastPointer = { x, y };
    if (active && (!this.pointer.active || now - this.lastTrailAt > 55 || Math.hypot(x - this.pointer.x, y - this.pointer.y) > 22)) {
      this.trail.push({ x, y, at: now, fade: 1 });
      if (this.trail.length > 12) this.trail.shift();
      this.lastTrailAt = now;
    }
    this.pointerMoved = true;
    this.pointer = { x, y, active };
  }

  dispose() {
    this.disposed = true;
    this.fieldTarget?.dispose();
    mountainImage.removeEventListener('load', this.onMountainLoad);
    mountainImage.removeEventListener('error', this.onMountainLoad);
  }

}

class CanvasTxt {
  constructor(txt, { fontSize = 200, fontFamily = 'Arial', color = '#fdf9f3' } = {}) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.txt = txt;
    this.fontSize = fontSize;
    this.fontFamily = fontFamily;
    this.color = color;

    this.font = `600 ${this.fontSize}px ${this.fontFamily}`;
  }

  resize() {
    this.context.font = this.font;
    const metrics = this.context.measureText(this.txt);

    const textWidth = Math.ceil(metrics.width) + 20;
    const textHeight = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + 20;

    this.canvas.width = textWidth;
    this.canvas.height = textHeight;
  }

  render() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.fillStyle = this.color;
    this.context.font = this.font;

    const metrics = this.context.measureText(this.txt);
    const yPos = 10 + metrics.actualBoundingBoxAscent;

    this.context.fillText(this.txt, 10, yPos);
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  get texture() {
    return this.canvas;
  }
}

// W2L field mode preserves React Bits' WebGL-to-ASCII pipeline while replacing
// the word-shaped source image with a filled, softly varying luminance field.
class CanvasField {
  constructor(text, variant) {
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');
    this.seed = [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 997, variant + 1);
    this.variant = variant;
  }

  resize(width, height) {
    const scale = 0.48;
    this.canvas.width = Math.max(128, Math.round(width * scale));
    this.canvas.height = Math.max(128, Math.round(height * scale));
  }

  render() {
    const { width, height } = this.canvas;
    const image = this.context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        const broad = Math.sin(nx * 10.2 + ny * 5.4 + this.seed) * 0.13;
        const folds = Math.sin(ny * 18.5 - nx * 7.1 + this.variant * 1.7) * 0.1;
        const ripples = Math.cos(nx * 27.3 + Math.sin(ny * 9.8) * 2.1) * 0.06;
        const grain = Math.sin((x + this.seed) * 12.9898 + y * 78.233) * 43758.5453;
        const value = Math.max(0.19, Math.min(0.82, 0.4 + broad + folds + ripples + (grain - Math.floor(grain) - 0.5) * 0.18));
        const color = Math.round(value * 255);
        const offset = (x + y * width) * 4;
        image.data[offset] = color;
        image.data[offset + 1] = color;
        image.data[offset + 2] = color;
        image.data[offset + 3] = 255;
      }
    }
    this.context.putImageData(image, 0, 0);
  }

  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
  get texture() { return this.canvas; }
}

class CanvAscii {
  constructor(
    { text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, fieldMode, fieldVariant, motifMode },
    containerElem,
    width,
    height
  ) {
    this.textString = text;
    this.asciiFontSize = asciiFontSize;
    this.textFontSize = textFontSize;
    this.textColor = textColor;
    this.planeBaseHeight = planeBaseHeight;
    this.container = containerElem;
    this.width = width;
    this.height = height;
    this.enableWaves = enableWaves;
    this.fieldMode = fieldMode;
    this.fieldVariant = fieldVariant;
    this.motifMode = motifMode;

    this.camera = new PerspectiveCamera(45, this.width / this.height, 1, 1000);
    this.camera.position.z = 30;

    this.scene = new Scene();
    this.mouse = { x: this.width / 2, y: this.height / 2 };

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.running = false;
    this.visible = false;
    this.stalled = false;
    this.lastFrame = 0;
    this.slowFrames = 0;
    this.firstFrame = 0;
    this.layoutChanged = false;
    this.resizeTimer = 0;
  }

  init() {
    this.setMesh();
    this.setRenderer();
  }

  setMesh() {
    this.textCanvas = this.fieldMode ? new CanvasField(this.textString, this.fieldVariant) : new CanvasTxt(this.textString, {
      fontSize: this.textFontSize,
      fontFamily: 'Courier New',
      color: this.textColor
    });
    this.textCanvas.resize(this.width, this.height);
    this.textCanvas.render();

    this.texture = new CanvasTexture(this.textCanvas.texture);
    this.texture.minFilter = NearestFilter;

    const textAspect = this.textCanvas.width / this.textCanvas.height;
    const baseH = this.fieldMode ? 2 * this.camera.position.z * Math.tan(Math.PI / 8) * 1.28 : this.planeBaseHeight;
    const planeW = baseH * textAspect;
    const planeH = baseH;
    this.fieldAspect = textAspect;

    this.geometry = new PlaneGeometry(planeW, planeH, 36, 36);
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        mouse: { value: 1.0 },
        uTexture: { value: this.texture },
        uEnableWaves: { value: this.enableWaves ? 1.0 : 0.0 }
      }
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);
  }

  setRenderer() {
    this.renderer = new WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);

    this.filter = new AsciiFilter(this.renderer, {
      fontFamily: 'Courier New',
      fontSize: this.asciiFontSize,
      charset: this.fieldMode ? GLYPHS : undefined,
      invert: true,
      container: this.container,
      variant: this.fieldVariant,
      fieldMode: this.fieldMode,
      motifMode: this.motifMode
    });

    this.container.appendChild(this.filter.domElement);
    this.pointerTarget = this.container.closest('.hero') ?? this.container;
    this.setSize(this.width, this.height);

    if (this.motifMode) {
      // The hero's glyphs start once the octopus really draws; the octopus answers when their light reaches the
      // summit, and rests while the hero yields to the form.
      this.filter.onFirstFrame = () => this.pointerTarget.dispatchEvent(new CustomEvent('w2l:octopus', { detail: { state: 'running' } }));
      // A late artwork re-grids the octopus, which clears its canvas: a resting loop must wake to redraw it.
      this.filter.onRegrid = () => this.redraw();
      this.filter.onAnalysisFailed = () => this.halt();
      this.onSummit = () => {
        this.filter.addWave();
        this.load();
      };
      this.onRest = event => {
        this.filter.setRest(Boolean(event.detail?.rest));
        this.load();
      };
      this.pointerTarget.addEventListener('w2l:summit', this.onSummit);
      this.pointerTarget.addEventListener('w2l:rest', this.onRest);
    }
    this.pointerTarget.addEventListener('pointermove', this.onMouseMove, { passive: true });
    this.pointerTarget.addEventListener('pointerleave', this.onMouseLeave);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  setSize(w, h) {
    this.width = w;
    this.height = h;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.fieldMode && this.mesh) this.mesh.scale.x = (w / h) / this.fieldAspect;

    this.filter.setSize(w, h);
    this.measure();
    this.layoutChanged = true;

    this.center = { x: w / 2, y: h / 2 };
    this.redraw();
  }

  /** A new grid clears the canvas. A resting octopus wakes for a frame to redraw it; a stopped one draws its
   * finished frame again, once, so a resize never leaves an empty veil where the octopus was. */
  redraw() {
    if (!this.stalled) this.load();
    else if (this.motifMode && this.filter.arrivalAt !== null) this.render();
  }

  /** Layout changed. The canvas stretches with its layer meanwhile; the glyph grid is rebuilt once the layer
   * has kept its size for a moment, and layout work never counts as a slow frame. */
  resize(width, height) {
    this.layoutChanged = true;
    this.measure();
    if (!width || !height) return;
    clearTimeout(this.resizeTimer);
    if (width === this.width && height === this.height) return;
    this.resizeTimer = setTimeout(() => this.setSize(width, height), RESIZE_MS);
  }

  /** Page-space boxes of the hero and the octopus layer, taken when layout changes: pointer moves only read them. */
  measure() {
    const hero = this.pointerTarget.getBoundingClientRect();
    const layer = this.container.getBoundingClientRect();
    const { scrollX, scrollY } = window;
    this.heroBox = { x: hero.left + scrollX, y: hero.top + scrollY, width: hero.width, height: hero.height };
    this.layerBox = { x: layer.left + scrollX, y: layer.top + scrollY, width: layer.width, height: layer.height };
  }

  /** Start (or wake) the frame loop. At rest the loop sleeps once nothing would change, and pointer
   * movement, a wave or the end of the rest wakes it. */
  load() {
    if (this.running || this.stalled || document.hidden || !this.visible) return;
    this.running = true;
    this.lastFrame = 0;
    this.slowFrames = 0;
    this.animate();
  }

  onMouseMove(evt) {
    const hero = this.heroBox;
    const layer = this.layerBox;
    // A stopped octopus keeps its finished frame; a later redraw (a resize) must not show a push.
    if (this.stalled || !hero?.width || !hero.height) return;
    this.mouse = { x: clamp((evt.pageX - hero.x) / hero.width, 0, 1) * this.width, y: clamp((evt.pageY - hero.y) / hero.height, 0, 1) * this.height };
    const x = evt.pageX - layer.x;
    const y = evt.pageY - layer.y;
    // Only a pointer within reach of the octopus's glyphs pushes them, or wakes a resting octopus: the push
    // reaches PUSH_REACH and borrows glyphs from up to 18 px (and a cell) further in.
    const f = this.filter;
    const drawn = f.motifTones && f.motifMaxX >= f.motifMinX;
    const dx = drawn ? Math.max(0, f.motifMinX - x, x - f.motifMaxX) : Math.max(0, -x, x - layer.width);
    const dy = drawn ? Math.max(0, f.motifMinY - y, y - f.motifMaxY) : Math.max(0, -y, y - layer.height);
    const reach = PUSH_REACH + 18 + (f.cellH ?? 0);
    if (dx * dx + dy * dy < reach * reach) {
      this.filter.setPointer(x, y, true);
      this.load();
    } else if (this.filter.pointer.active) {
      this.filter.setPointer(-1000, -1000, false);
      this.load();
    }
  }

  onMouseLeave() {
    this.mouse = { x: this.width / 2, y: this.height / 2 };
    this.filter.setPointer(-1000, -1000, false);
    this.load();
  }

  onVisibilityChange() {
    if (document.hidden) this.stop();
    else this.load();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
  }

  animate() {
    const animateFrame = (now) => {
      if (!this.running) return;
      this.animationFrameId = requestAnimationFrame(animateFrame);
      if (now - this.lastFrame < 33) return;
      if (this.lastFrame && now - this.lastFrame > 80 && !this.layoutChanged) this.slowFrames += 1;
      else this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.layoutChanged = false;
      // A device too slow from the start stops at once. Later only a sustained slowdown does (90 net frames more
      // than 80 ms apart, 7 s or more), so a passing burst of jank never ends the looping hero for the visit.
      this.firstFrame ||= now;
      if (this.slowFrames >= (now - this.firstFrame < 6000 ? 8 : 90)) {
        this.halt();
        return;
      }
      this.lastFrame = now;
      this.render();
      // At rest with nothing changing, sleep until something wakes the loop.
      if (this.motifMode && this.filter.idle()) this.stop();
    };
    this.animationFrameId = requestAnimationFrame(animateFrame);
  }

  /** Stop for good: too slow to animate, or no octopus to draw. The hero's glyphs stop with it, and the octopus
   * keeps one finished frame (arrival and answers complete), never a half-drawn one. */
  halt() {
    if (this.stalled) return;
    this.stop();
    this.stalled = true;
    if (!this.motifMode) return;
    if (this.filter.settle()) this.render();
    this.pointerTarget?.dispatchEvent(new CustomEvent('w2l:octopus', { detail: { state: 'stalled' } }));
  }

  render() {
    const time = new Date().getTime() * 0.001;

    this.mesh.material.uniforms.uTime.value = Math.sin(time);

    this.updateRotation();
    this.filter.render(this.scene, this.camera);
  }

  updateRotation() {
    const x = mapRange(this.mouse.y, 0, this.height, 0.18, -0.18);
    const y = mapRange(this.mouse.x, 0, this.width, -0.18, 0.18);

    this.mesh.rotation.x += (x - this.mesh.rotation.x) * 0.05;
    this.mesh.rotation.y += (y - this.mesh.rotation.y) * 0.05;
  }

  clear() {
    this.scene.traverse(obj => {
      if (obj.isMesh && typeof obj.material === 'object' && obj.material !== null) {
        Object.keys(obj.material).forEach(key => {
          const matProp = obj.material[key];
          if (matProp !== null && typeof matProp === 'object' && typeof matProp.dispose === 'function') {
            matProp.dispose();
          }
        });
        obj.material.dispose();
        obj.geometry.dispose();
      }
    });
    this.scene.clear();
  }

  dispose() {
    this.stop();
    clearTimeout(this.resizeTimer);
    if (this.filter) {
      this.filter.dispose();
      if (this.filter.domElement.parentNode) {
        this.container.removeChild(this.filter.domElement);
      }
    }
    this.pointerTarget?.removeEventListener('pointermove', this.onMouseMove);
    this.pointerTarget?.removeEventListener('pointerleave', this.onMouseLeave);
    if (this.onSummit) this.pointerTarget?.removeEventListener('w2l:summit', this.onSummit);
    if (this.onRest) this.pointerTarget?.removeEventListener('w2l:rest', this.onRest);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.clear();
    this.texture?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
}

export default function ASCIIText({
  text = 'David!',
  asciiFontSize = 8,
  textFontSize = 200,
  textColor = '#fdf9f3',
  planeBaseHeight = 8,
  enableWaves = true,
  fieldMode = false,
  fieldVariant = 0,
  motifMode = false
}) {
  const containerRef = useRef(null);
  const asciiRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    let instance;
    try {
      instance = new CanvAscii(
        { text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, fieldMode, fieldVariant, motifMode },
        container, width, height
      );
      instance.init();
      asciiRef.current = instance;
    } catch {
      // Decorative WebGL failure must never block the page or its form. The hero keeps its static octopus,
      // and the report tells it that no motion will start here.
      instance?.dispose();
      container.closest('.hero')?.dispatchEvent(new CustomEvent('w2l:octopus', { detail: { state: 'stalled' } }));
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      instance.visible = Boolean(entry?.isIntersecting);
      if (instance.visible) instance.load();
      else instance.stop();
    }, { threshold: 0.05 });
    observer.observe(container);
    // The hero too: it can move the layer without resizing it, and the pointer mapping needs both boxes.
    const hero = container.closest('.hero');
    const ro = new ResizeObserver(entries => {
      const box = entries.find(entry => entry.target === container)?.contentRect;
      instance.resize(box?.width, box?.height);
    });
    ro.observe(container);
    if (hero) ro.observe(hero);
    return () => {
      observer.disconnect();
      ro.disconnect();
      instance.dispose();
      asciiRef.current = null;
    };
  }, [text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, fieldMode, fieldVariant, motifMode]);

  return <div ref={containerRef} className="ascii-text-container" aria-hidden="true" />;
}
