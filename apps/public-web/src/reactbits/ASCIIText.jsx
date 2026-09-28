// Adapted from the React Bits ASCIIText JS-CSS registry source:
// https://reactbits.dev/r/ASCIIText-JS-CSS.json
// The W2L version keeps the text-to-ASCII renderer while limiting motion,
// removing external fonts and inline styles, and tracking only its Hero.

import { useEffect, useRef } from 'react';
import { CanvasTexture, Mesh, NearestFilter, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderer } from 'three';
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
const mountainImage = new Image();
mountainImage.src = '/assets/mountain-hero.webp';
const octopusImage = new Image();
octopusImage.src = '/assets/octopus-original.webp';
let octopusCrop = null;
const getOctopusCrop = () => {
  if (octopusCrop) return octopusCrop;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(octopusImage, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const background = [pixels[0], pixels[1], pixels[2]];
  let left = size, top = size, right = 0, bottom = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const distance = Math.hypot(pixels[i] - background[0], pixels[i + 1] - background[1], pixels[i + 2] - background[2]) / 441.67;
      if (distance < 0.095) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (left > right) return null;
  const padding = 4;
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(size, right + padding + 1);
  bottom = Math.min(size, bottom + padding + 1);
  octopusCrop = {
    x: left / size * octopusImage.naturalWidth,
    y: top / size * octopusImage.naturalHeight,
    width: (right - left) / size * octopusImage.naturalWidth,
    height: (bottom - top) / size * octopusImage.naturalHeight,
    background
  };
  return octopusCrop;
};
const GLYPHS = '.,:;+=*/\\<>x#%@';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const smoothstep = value => value * value * (3 - 2 * value);
const cellNoise = (x, y, seed) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return value - Math.floor(value);
};

// Glyph cell of the Hero artwork, in natural pixels of mountain-hero.webp. The artwork is
// hand-drawn, so its spacing drifts between ~12 and ~13 px; the octopus matches its scale and
// glyph family instead of trying to sit on an exact lattice.
const ARTWORK_CELL_X = 12.5;
const ARTWORK_CELL_Y = 12.9;
// The Hero shade darkens the artwork by roughly this much where the octopus sits.
const ARTWORK_SHADE = 0.8;
const mix = (from, to, amount) => from + (to - from) * amount;

/** The artwork's own glyph ramp: dot, colon, four-dot cross, cross, starred cross. */
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
  if (level >= 5) {
    ctx.moveTo(cx, cy - a * 1.1);
    ctx.lineTo(cx, cy + a * 1.1);
  }
  ctx.stroke();
};

/** The octopus keeps its own palette (blue dots, warm rim light); brighter cells lift toward
 * the rim highlight and the scene behind tints every glyph slightly so it sits in the same light. */
const motifGlyphColor = (source, scene, tone) => {
  // Warm rim cells lift toward a warm white, blue body cells toward a cool one.
  const warm = clamp((source[0] - source[2]) / 90, 0, 1);
  const lift = 0.06 + 0.24 * tone;
  let r = mix(source[0], mix(232, 255, warm), lift);
  let g = mix(source[1], mix(240, 222, warm), lift);
  let b = mix(source[2], mix(255, 188, warm), lift);
  if (scene) {
    r = mix(r, scene[0] * ARTWORK_SHADE, 0.14);
    g = mix(g, scene[1] * ARTWORK_SHADE, 0.14);
    b = mix(b, scene[2] * ARTWORK_SHADE, 0.14);
  }
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(0.5 + 0.5 * tone).toFixed(2)})`;
};

class AsciiFilter {
  constructor(renderer, { fontSize, fontFamily, charset, invert, container, variant, fieldMode, motifMode } = {}) {
    this.renderer = renderer;
    this.domElement = document.createElement('div');
    this.domElement.className = 'w2l-ascii-filter';

    this.pre = document.createElement('pre');
    if (motifMode) {
      // The octopus is drawn as artwork glyphs on a canvas. A veil softens the artwork's own
      // glyphs under its silhouette so the two textures never clash.
      this.veil = document.createElement('div');
      this.veil.className = 'w2l-ascii-veil';
      this.domElement.appendChild(this.veil);
      this.output = document.createElement('canvas');
      this.output.className = 'w2l-ascii-motif';
      this.output.setAttribute('aria-hidden', 'true');
      this.outputContext = this.output.getContext('2d');
      this.domElement.appendChild(this.output);
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
    this.mountainTones = null;
    this.motifTones = null;
    // In motif mode the artwork sets the glyph scale and colours, so its arrival resets the grid.
    this.onMountainLoad = () => {
      if (!this.motifMode) this.updateMountainSample();
      else if (this.width) this.reset();
    };
    this.onOctopusLoad = () => this.updateMotifSample();
    if (this.fieldMode || this.motifMode) mountainImage.addEventListener('load', this.onMountainLoad);
    if (this.motifMode) octopusImage.addEventListener('load', this.onOctopusLoad);

    this.context.webkitImageSmoothingEnabled = false;
    this.context.mozImageSmoothingEnabled = false;
    this.context.msImageSmoothingEnabled = false;
    this.context.imageSmoothingEnabled = false;

  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height);
    this.reset();

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
    this.cellW = ARTWORK_CELL_X * scale;
    this.cellH = ARTWORK_CELL_Y * scale;
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
    if (!art) return;
    // One averaged artwork colour per glyph cell, used to tint the octopus glyph drawn there.
    const sample = document.createElement('canvas');
    sample.width = this.cols;
    sample.height = this.rows;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      mountainImage,
      (art.layerX + this.offsetX - art.imageX) / art.scale,
      (art.layerY + this.offsetY - art.imageY) / art.scale,
      this.cols * this.cellW / art.scale,
      this.rows * this.cellH / art.scale,
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

  updateMotifSample() {
    if (!this.motifMode || !octopusImage.naturalWidth || !this.cols || !this.rows || !this.container) return;
    const crop = getOctopusCrop();
    if (!crop) return;
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sample = document.createElement('canvas');
    sample.width = this.cols;
    sample.height = this.rows;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    // Average each glyph cell over the source (it is itself a dot texture); a plain
    // resample would pick stray dots and leave only the bright rims.
    context.imageSmoothingQuality = 'high';
    // Character cells are taller than they are wide. Fit in physical pixels
    // before mapping into cells so the octopus keeps its original proportions.
    const scale = Math.min(rect.width / crop.width, rect.height / crop.height) * 0.98;
    const width = crop.width * scale / this.cellW;
    const height = crop.height * scale / this.cellH;
    context.drawImage(octopusImage, crop.x, crop.y, crop.width, crop.height,
      (this.cols - width) / 2, (this.rows - height) / 2, width, height);
    const pixels = context.getImageData(0, 0, this.cols, this.rows).data;
    const tones = new Float32Array(this.cols * this.rows);
    const colors = new Uint8ClampedArray(this.cols * this.rows * 3);
    for (let i = 0; i < tones.length; i++) {
      const p = i * 4;
      if (pixels[p + 3] < 16) continue;
      const dr = pixels[p] - crop.background[0];
      const dg = pixels[p + 1] - crop.background[1];
      const db = pixels[p + 2] - crop.background[2];
      const distance = Math.hypot(dr, dg, db) / 441.67;
      tones[i] = Math.pow(clamp((distance - 0.03) / 0.3, 0, 1), 0.8);
      // Undo the averaging with the navy ground to recover the colour of the dots themselves.
      const recover = 1 / clamp(distance * 2.4, 0.35, 1);
      colors[i * 3] = crop.background[0] + dr * recover;
      colors[i * 3 + 1] = crop.background[1] + dg * recover;
      colors[i * 3 + 2] = crop.background[2] + db * recover;
    }
    this.fillMotifBody(tones, colors);
    this.motifTones = tones;
    this.motifColors = colors;
    this.updateVeil();
  }

  /** The source octopus is rim-lit, so its body is nearly as dark as its ground. Every cell inside
   * the silhouette that is dimmer than the body level becomes a body glyph in the body's own blue;
   * the lit rim and the eyes keep their own tone and colour. */
  fillMotifBody(tones, colors) {
    const { cols, rows } = this;
    const count = cols * rows;
    const wall = new Uint8Array(count);
    for (let i = 0; i < count; i++) if (tones[i] >= 0.12) wall[i] = 1;
    // Grow the rim by one cell so small gaps in it do not let the outside flood in.
    const grown = wall.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!wall[x + y * cols]) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < cols && ny < rows) grown[nx + ny * cols] = 1;
          }
        }
      }
    }
    const outside = new Uint8Array(count);
    const queue = [];
    const visit = (x, y) => {
      const i = x + y * cols;
      if (grown[i] || outside[i]) return;
      outside[i] = 1;
      queue.push(i);
    };
    for (let x = 0; x < cols; x++) { visit(x, 0); visit(x, rows - 1); }
    for (let y = 0; y < rows; y++) { visit(0, y); visit(cols - 1, y); }
    while (queue.length) {
      const i = queue.pop();
      const x = i % cols;
      const y = (i - x) / cols;
      if (x > 0) visit(x - 1, y);
      if (x < cols - 1) visit(x + 1, y);
      if (y > 0) visit(x, y - 1);
      if (y < rows - 1) visit(x, y + 1);
    }
    // The body's own blue: the average colour of its mid-tone (dotted) cells.
    const body = [0, 0, 0];
    let samples = 0;
    for (let i = 0; i < count; i++) {
      if (tones[i] < 0.2 || tones[i] > 0.6) continue;
      body[0] += colors[i * 3];
      body[1] += colors[i * 3 + 1];
      body[2] += colors[i * 3 + 2];
      samples++;
    }
    if (!samples) return;
    const isOutsideEdge = (x, y) => (x > 0 && outside[x - 1 + y * cols]) || (x < cols - 1 && outside[x + 1 + y * cols])
      || (y > 0 && outside[x + (y - 1) * cols]) || (y < rows - 1 && outside[x + (y + 1) * cols]);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = x + y * cols;
        if (outside[i] || isOutsideEdge(x, y) || tones[i] >= 0.62) continue;
        // Lift the averaged body blue so it reads over the hero sky, which is the same navy.
        tones[i] = 0.62;
        colors[i * 3] = mix(body[0] / samples, 108, 0.62);
        colors[i * 3 + 1] = mix(body[1] / samples, 156, 0.62);
        colors[i * 3 + 2] = mix(body[2] / samples, 250, 0.62);
      }
    }
  }

  /** Soften the artwork's glyphs under the octopus silhouette only (feathered, never a box). */
  updateVeil() {
    if (!this.veil || !this.motifTones) return;
    const mask = document.createElement('canvas');
    mask.width = this.cols;
    mask.height = this.rows;
    const context = mask.getContext('2d');
    if (!context) return;
    const image = context.createImageData(this.cols, this.rows);
    for (let i = 0; i < this.motifTones.length; i++) {
      image.data[i * 4 + 3] = Math.round(smoothstep(clamp((this.motifTones[i] - 0.04) / 0.3, 0, 1)) * 235);
    }
    context.putImageData(image, 0, 0);
    const url = `url(${mask.toDataURL()})`;
    this.veil.style.maskImage = url;
    this.veil.style.webkitMaskImage = url;
  }

  render(scene, camera) {
    this.renderer.render(scene, camera);

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.context.clearRect(0, 0, w, h);
    if (this.context && w && h) {
      this.context.drawImage(this.renderer.domElement, 0, 0, w, h);
    }

    this.asciify(this.context, w, h);
  }

  asciify(ctx, w, h) {
    if (w && h) {
      const imgData = ctx.getImageData(0, 0, w, h).data;
      this.repel += ((this.pointer.active ? 1 : 0) - this.repel) * 0.16;
      const now = performance.now();
      this.trail = this.trail.filter(stamp => now - stamp.at < 1050);
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
      const out = this.outputContext;
      if (out) {
        out.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
        out.clearRect(0, 0, this.width, this.height);
        out.lineCap = 'round';
      }
      const glyphSize = Math.min(this.cellW, this.cellH);
      let str = '';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const cellX = this.offsetX + (x + .5) * this.cellW;
          const cellY = this.offsetY + (y + .5) * this.cellH;
          let influence = 0;
          let sourceX = this.pointer.x;
          let sourceY = this.pointer.y;
          for (const stamp of this.trail) {
            const distance = Math.hypot(cellX - stamp.x, cellY - stamp.y);
            if (distance >= 152) continue;
            const fade = Math.pow(1 - (now - stamp.at) / 1050, 2);
            const strength = smoothstep(1 - distance / 152) * fade;
            if (strength > influence) {
              influence = strength;
              sourceX = stamp.x;
              sourceY = stamp.y;
            }
          }
          if (this.pointer.active) {
            const distance = Math.hypot(cellX - this.pointer.x, cellY - this.pointer.y);
            const strength = distance < 152 ? smoothstep(1 - distance / 152) * this.repel : 0;
            if (strength > influence) {
              influence = strength;
              sourceX = this.pointer.x;
              sourceY = this.pointer.y;
            }
          }

          let sampleX = x;
          let sampleY = y;
          if (influence > 0.01) {
            const dx = cellX - sourceX;
            const dy = cellY - sourceY;
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
          const [r, g, b, a] = [imgData[i], imgData[i + 1], imgData[i + 2], imgData[i + 3]];

          if (this.motifMode) {
            const shape = this.motifTones?.[sx + sy * w] ?? 0;
            if (shape < 0.08 || !out) continue;
            const gray = (0.3 * r + 0.6 * g + 0.1 * b) / 255;
            const shimmer = Math.sin(now * 0.0008 + x * 0.12 - y * 0.08) * 0.08;
            const dither = (cellNoise(x, y, this.variant) - 0.5) * 0.24;
            // Shape sets the glyph (body four-dots, rim crosses); waves and dither only shimmer it.
            const tone = clamp(shape * (0.86 + gray * 0.14) + shimmer + dither * 0.6 - influence * 0.29, 0, 1);
            if (tone < 0.1) continue;
            const m = (sx + sy * w) * 3;
            const c = (x + y * w) * 4;
            const source = this.motifColors ? [this.motifColors[m], this.motifColors[m + 1], this.motifColors[m + 2]] : [150, 190, 255];
            const scene = this.sceneColors ? [this.sceneColors[c], this.sceneColors[c + 1], this.sceneColors[c + 2]] : null;
            const color = motifGlyphColor(source, scene, tone);
            out.fillStyle = color;
            out.strokeStyle = color;
            drawArtworkGlyph(out, clamp(Math.ceil(tone * 5), 1, 5), cellX, cellY, glyphSize);
            continue;
          }

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
      if (!this.motifMode) this.pre.textContent = str;
    }
  }

  setPointer(x, y, active) {
    const now = performance.now();
    if (active) this.lastPointer = { x, y };
    if (active && (!this.pointer.active || now - this.lastTrailAt > 55 || Math.hypot(x - this.pointer.x, y - this.pointer.y) > 22)) {
      this.trail.push({ x, y, at: now });
      if (this.trail.length > 12) this.trail.shift();
      this.lastTrailAt = now;
    }
    this.pointer = { x, y, active };
  }

  dispose() {
    if (this.fieldMode || this.motifMode) mountainImage.removeEventListener('load', this.onMountainLoad);
    if (this.motifMode) octopusImage.removeEventListener('load', this.onOctopusLoad);
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
    this.lastFrame = 0;
    this.slowFrames = 0;
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
    this.setSize(this.width, this.height);

    this.pointerTarget = this.container.closest('.hero') ?? this.container;
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

    this.center = { x: w / 2, y: h / 2 };
  }

  load() {
    if (this.running || document.hidden || !this.visible) return;
    this.running = true;
    this.lastFrame = 0;
    this.slowFrames = 0;
    this.animate();
  }

  onMouseMove(evt) {
    const bounds = this.pointerTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (evt.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (evt.clientY - bounds.top) / bounds.height));
    this.mouse = { x: x * this.width, y: y * this.height };
    const local = this.container.getBoundingClientRect();
    this.filter.setPointer(evt.clientX - local.left, evt.clientY - local.top, true);
  }

  onMouseLeave() {
    this.mouse = { x: this.width / 2, y: this.height / 2 };
    this.filter.setPointer(-1000, -1000, false);
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
      if (this.lastFrame && now - this.lastFrame > 80) this.slowFrames += 1;
      else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (this.slowFrames >= 8) { this.stop(); return; }
      this.lastFrame = now;
      this.render();
    };
    this.animationFrameId = requestAnimationFrame(animateFrame);
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
    if (this.filter) {
      this.filter.dispose();
      if (this.filter.domElement.parentNode) {
        this.container.removeChild(this.filter.domElement);
      }
    }
    this.pointerTarget?.removeEventListener('pointermove', this.onMouseMove);
    this.pointerTarget?.removeEventListener('pointerleave', this.onMouseLeave);
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
      // Decorative WebGL failure must never block the page or its form.
      instance?.dispose();
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      instance.visible = Boolean(entry?.isIntersecting);
      if (instance.visible) instance.load();
      else instance.stop();
    }, { threshold: 0.05 });
    observer.observe(container);
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        instance.setSize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    ro.observe(container);
    return () => {
      observer.disconnect();
      ro.disconnect();
      instance.dispose();
      asciiRef.current = null;
    };
  }, [text, asciiFontSize, textFontSize, textColor, planeBaseHeight, enableWaves, fieldMode, fieldVariant, motifMode]);

  return <div ref={containerRef} className="ascii-text-container" aria-hidden="true" />;
}
