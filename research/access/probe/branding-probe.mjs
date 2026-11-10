#!/usr/bin/env node
// M3.4: what a site can see of one Chrome build, launched the way the installed_chrome rung
// launches it. Read-only: the build only talks to two servers this script starts on 127.0.0.1
// and to its own chrome:// pages. No site is read and no product code is changed.
//
//   W2L_CHROME_PATH=<chrome binary> node research/access/probe/branding-probe.mjs --label S157 --out <file.json>
//
// Compare two outputs with: node research/access/probe/branding-probe.mjs --diff <a.json> <b.json>
import http from 'node:http';
import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchInstalledChrome, DETECTION_FLAGS_ID } from '@w2l/bench';

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };

const HINTS = ['Sec-CH-UA', 'Sec-CH-UA-Mobile', 'Sec-CH-UA-Platform', 'Sec-CH-UA-Arch', 'Sec-CH-UA-Bitness',
  'Sec-CH-UA-Full-Version', 'Sec-CH-UA-Full-Version-List', 'Sec-CH-UA-Model', 'Sec-CH-UA-Platform-Version',
  'Sec-CH-UA-WoW64', 'Sec-CH-UA-Form-Factors', 'Sec-CH-Prefers-Color-Scheme', 'Sec-CH-Prefers-Reduced-Motion',
  'Sec-CH-Device-Memory', 'Sec-CH-DPR', 'Sec-CH-Viewport-Width', 'Sec-CH-Viewport-Height', 'Device-Memory', 'DPR',
  'Viewport-Width', 'Downlink', 'ECT', 'RTT', 'Save-Data'];

const isGrease = (v) => (v & 0x0f0f) === 0x0a0a && (v >> 8) === (v & 0xff);

/** Parses one TLS ClientHello into the fields a server can fingerprint. GREASE values are dropped and
 *  the extension list is sorted, because Chrome shuffles extension order on every connection. */
function parseClientHello(buf) {
  let p = 5 + 4 + 2 + 32;
  p += 1 + buf[p];
  const cipherLen = buf.readUInt16BE(p); p += 2;
  const ciphers = [];
  for (let i = 0; i < cipherLen; i += 2) ciphers.push(buf.readUInt16BE(p + i));
  p += cipherLen;
  p += 1 + buf[p];
  const extEnd = p + 2 + buf.readUInt16BE(p); p += 2;
  const out = { bytes: buf.length, ciphers: ciphers.filter((c) => !isGrease(c)), extensions: [], groups: [], keyShares: [],
    sigAlgs: [], alpn: [], versions: [], certCompression: [], alps: [], hasEch: false };
  const list16 = (b, o, n) => { const r = []; for (let i = 0; i < n; i += 2) r.push(b.readUInt16BE(o + i)); return r; };
  while (p + 4 <= extEnd) {
    const type = buf.readUInt16BE(p); const len = buf.readUInt16BE(p + 2); const d = p + 4; p = d + len;
    if (isGrease(type)) continue;
    out.extensions.push(type);
    if (type === 10) out.groups = list16(buf, d + 2, buf.readUInt16BE(d)).filter((g) => !isGrease(g));
    if (type === 13) out.sigAlgs = list16(buf, d + 2, buf.readUInt16BE(d)).filter((g) => !isGrease(g));
    if (type === 43) out.versions = list16(buf, d + 1, buf[d]).filter((g) => !isGrease(g));
    if (type === 27) out.certCompression = list16(buf, d + 1, buf[d]);
    if (type === 65037) out.hasEch = true;
    if (type === 51) { let q = d + 2; const end = d + 2 + buf.readUInt16BE(d);
      while (q + 4 <= end) { const g = buf.readUInt16BE(q); const l = buf.readUInt16BE(q + 2); if (!isGrease(g)) out.keyShares.push(`${g}:${l}`); q += 4 + l; } }
    if (type === 16 || type === 17513 || type === 17613) { const names = []; let q = d + 2; const end = d + 2 + buf.readUInt16BE(d);
      while (q < end) { names.push(buf.subarray(q + 1, q + 1 + buf[q]).toString('latin1')); q += 1 + buf[q]; }
      if (type === 16) out.alpn = names; else out.alps = [`${type}`, ...names]; }
  }
  out.extensions.sort((a, b) => a - b);
  return out;
}

function diff(a, b, path = '', rows = []) {
  const flat = (v) => v === null || typeof v !== 'object';
  if (flat(a) || flat(b) || Array.isArray(a) !== Array.isArray(b)) { if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ path, a, b }); return rows; }
  if (Array.isArray(a) && a.every(flat) && b.every(flat)) {
    const onlyA = a.filter((x) => !b.includes(x)); const onlyB = b.filter((x) => !a.includes(x));
    if (onlyA.length || onlyB.length) rows.push({ path, onlyA, onlyB });
    else if (JSON.stringify(a) !== JSON.stringify(b)) rows.push({ path, note: 'same members, different order' });
    return rows;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path ? `${path}.${k}` : k, rows);
  return rows;
}

if (argv[0] === '--diff') {
  const [a, b] = [argv[1], argv[2]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const rows = diff(a.seen, b.seen);
  console.log(JSON.stringify({ a: a.label, b: b.label, differing: rows.length, rows }, null, 1));
  process.exit(0);
}

const label = arg('--label'); const outFile = arg('--out');
if (!label || !outFile) { console.error('usage: --label <name> --out <file.json>  |  --diff <a.json> <b.json>'); process.exit(2); }

const requests = [];
const web = http.createServer((req, res) => {
  requests.push({ path: req.url, rawHeaders: req.rawHeaders });
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'accept-ch': HINTS.join(', '), 'cache-control': 'no-store' });
  res.end('<!doctype html><title>probe</title><p>probe</p>');
});
const hellos = [];
const tls = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (c) => { buf = Buffer.concat([buf, c]);
    if (buf.length >= 5 && buf.length >= 5 + buf.readUInt16BE(3)) { try { hellos.push(parseClientHello(buf)); } catch (e) { hellos.push({ error: String(e) }); } sock.destroy(); } });
  sock.on('error', () => {});
});
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const [webPort, tlsPort] = [await listen(web), await listen(tls)];
const origin = `http://127.0.0.1:${webPort}`;

const headerPairs = (raw) => { const o = []; for (let i = 0; i < raw.length; i += 2) o.push([raw[i], raw[i + 1].replaceAll(String(webPort), 'PORT')]); return o; };

// The same call the rung makes (browserLocal.ts), with the no-proxy launch options.
// The rung passes only egress flags through, so an extra Chrome flag for diagnosis goes in a wrapper script named by
// W2L_CHROME_PATH (exec "<binary>" <flag> "$@"); the command line Chrome reports is in the output (seen.version).
const browser = await launchInstalledChrome({ timeout: 30_000, args: ['--proxy-server=direct://'] });
const seen = {};
try {
  const page = browser.contexts()[0].pages()[0];
  await page.goto(`${origin}/first`);
  await page.goto(`${origin}/second`);
  await page.evaluate(() => fetch('/fetch').then((r) => r.text()));
  const nav = (p) => headerPairs(requests.find((r) => r.path === p)?.rawHeaders ?? []);
  seen.headers = { firstNavigation: Object.fromEntries(nav('/first')), firstNavigationOrder: nav('/first').map((h) => h[0]),
    afterAcceptCH: Object.fromEntries(nav('/second')), afterAcceptCHOrder: nav('/second').map((h) => h[0]),
    fetch: Object.fromEntries(nav('/fetch')), fetchOrder: nav('/fetch').map((h) => h[0]) };

  seen.page = await page.evaluate(async () => {
    const n = navigator; const out = {};
    const safe = async (f) => { try { return await f(); } catch (e) { return `error: ${e?.name ?? e}`; } };
    out.navigator = { userAgent: n.userAgent, appVersion: n.appVersion, platform: n.platform, vendor: n.vendor, productSub: n.productSub,
      language: n.language, languages: [...n.languages], hardwareConcurrency: n.hardwareConcurrency, deviceMemory: n.deviceMemory,
      webdriver: n.webdriver, pdfViewerEnabled: n.pdfViewerEnabled, maxTouchPoints: n.maxTouchPoints, cookieEnabled: n.cookieEnabled,
      doNotTrack: n.doNotTrack, globalPrivacyControl: n.globalPrivacyControl ?? null, onLine: n.onLine,
      plugins: [...n.plugins].map((p) => p.name), mimeTypes: [...n.mimeTypes].map((m) => m.type),
      connection: n.connection ? { effectiveType: n.connection.effectiveType, saveData: n.connection.saveData } : null };
    out.userAgentData = n.userAgentData ? { brands: n.userAgentData.brands.map((b) => `${b.brand};${b.version}`).sort(), mobile: n.userAgentData.mobile,
      platform: n.userAgentData.platform, highEntropy: await safe(async () => { const v = await n.userAgentData.getHighEntropyValues(['architecture', 'bitness',
        'formFactors', 'fullVersionList', 'model', 'platformVersion', 'uaFullVersion', 'wow64']);
        return { ...v, brands: undefined, fullVersionList: v.fullVersionList.map((b) => `${b.brand};${b.version}`).sort() }; }) } : null;
    out.chromeObject = typeof window.chrome === 'object' ? Object.keys(window.chrome).sort() : typeof window.chrome;
    out.windowProps = Object.getOwnPropertyNames(window).filter((k) => !/^\d+$/.test(k)).sort();
    out.navigatorProps = Object.getOwnPropertyNames(Navigator.prototype).sort();
    out.documentProps = Object.getOwnPropertyNames(Document.prototype).sort();
    out.screen = { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight,
      colorDepth: screen.colorDepth, dpr: devicePixelRatio, outer: [outerWidth, outerHeight], inner: [innerWidth, innerHeight] };
    out.intl = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, locale: Intl.DateTimeFormat().resolvedOptions().locale };
    out.webgl = await safe(() => { const gl = document.createElement('canvas').getContext('webgl'); const e = gl.getExtension('WEBGL_debug_renderer_info');
      return { vendor: gl.getParameter(e.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(e.UNMASKED_RENDERER_WEBGL), extensions: gl.getSupportedExtensions().sort() }; });
    out.webgpu = await safe(async () => { if (!n.gpu) return null; const a = await n.gpu.requestAdapter(); return a ? { vendor: a.info?.vendor, architecture: a.info?.architecture, features: [...a.features].sort() } : 'no adapter'; });
    const v = document.createElement('video');
    out.codecs = Object.fromEntries(['video/mp4; codecs="avc1.42E01E"', 'video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="av01.0.05M.08"',
      'video/webm; codecs="vp9"', 'audio/mp4; codecs="mp4a.40.2"', 'audio/mpeg', 'audio/ogg; codecs="opus"', 'audio/mp4; codecs="ac-3"'].map((c) => [c, v.canPlayType(c)]));
    const eme = async (ks) => safe(async () => { await n.requestMediaKeySystemAccess(ks, [{ initDataTypes: ['cenc'], videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }] }]); return 'available'; });
    out.drm = { widevine: await eme('com.widevine.alpha'), clearkey: await eme('org.w3.clearkey') };
    out.permissions = {};
    for (const name of ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read', 'persistent-storage'])
      out.permissions[name] = await safe(async () => (await n.permissions.query({ name })).state);
    out.notificationPermission = typeof Notification === 'function' ? Notification.permission : null;
    out.voices = await safe(() => new Promise((r) => { const got = () => r(speechSynthesis.getVoices().length); if (speechSynthesis.getVoices().length) got(); else { speechSynthesis.onvoiceschanged = got; setTimeout(got, 1500); } }));
    out.storage = await safe(async () => { const e = await n.storage.estimate(); return { quotaGb: Math.round(e.quota / 2 ** 30) }; });
    out.fonts = await safe(async () => ['Arial', 'Helvetica Neue', 'PingFang SC', 'Roboto', 'Segoe UI', 'Menlo', 'Apple Color Emoji'].filter((f) => document.fonts.check(`12px "${f}"`)));
    out.cssSupports = Object.fromEntries(['selector(:has(a))', 'anchor-name: --a', 'field-sizing: content', 'reading-flow: normal', 'interpolate-size: allow-keywords',
      'corner-shape: squircle', 'scroll-marker-group: after'].map((c) => [c, CSS.supports(c)]));
    return out;
  });

  const inner = await browser.contexts()[0].newPage();
  const internal = async (url, fn) => { try { await inner.goto(url, { timeout: 10_000 }); await inner.waitForTimeout(1500); return await inner.evaluate(fn); } catch (e) { return `error: ${String(e).slice(0, 160)}`; } };
  seen.version = await internal('chrome://version/', () => {
    const t = (id) => document.getElementById(id)?.textContent?.trim().replace(/\s+/g, ' ') ?? null;
    const variations = [...document.querySelectorAll('#variations-list div, #variations-list')].map((d) => d.textContent.trim()).filter((s) => s && !s.includes('\n'));
    return { version: t('version'), copyright: t('copyright'), osType: t('os_type'), userAgent: t('useragent'),
      commandLine: (t('command_line') ?? '').replace(/--user-data-dir=\S+/, '--user-data-dir=<tmp>').replace(/--remote-debugging-port=\d+/, '--remote-debugging-port=<port>').replace(/^.*?(?= --)/, '<binary>'),
      variations: [...new Set(variations.flatMap((v) => v.split('-')))].sort() };
  });
  seen.components = await internal('chrome://components/', () => {
    const rows = [...document.querySelectorAll('.component-name')].map((e) => [e.textContent.trim(), e.closest('.component')?.querySelector('[id^="version-"]')?.textContent.trim() ?? null]);
    return Object.fromEntries(rows.filter(([, v]) => v !== null));
  });
  await inner.close();
  // Last, because a failed navigation leaves an error page that interrupts the next one.
  await page.goto(`https://127.0.0.1:${tlsPort}/`, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
  seen.tlsClientHellos = hellos.length;
  // Chrome retries a failed handshake with other shapes, so the comparison is over the set of distinct ones.
  seen.tlsShapes = [...new Set(hellos.map((h) => JSON.stringify({ ...h, bytes: undefined })))].sort().map((j) => JSON.parse(j));
} finally {
  await browser.close().catch(() => {});
  web.close(); tls.close();
}

writeFileSync(outFile, JSON.stringify({ label, at: new Date().toISOString(), chromePath: (process.env.W2L_CHROME_PATH ?? '(default)').replace(process.env.HOME ?? '', '~'),
  browserVersion: browser.version(), detectionFlagsId: DETECTION_FLAGS_ID, seen }, null, 1));
console.log(`${label}: ${browser.version()} -> ${outFile}`);
process.exit(0);
