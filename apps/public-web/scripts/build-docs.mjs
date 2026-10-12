import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { versionAssetReferences, versionPublicAssets } from './publicAssetVersions.mjs'
import { HOME_UPDATED, pages } from './docsPages.mjs'
import { BLOG_AUTHOR, BLOG_CATEGORIES, BLOG_UPDATED, blogPath, categoryPath, posts } from './blogPosts.mjs'
import { siteActionsMarkup, siteNavMarkup } from './siteNav.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist', 'docs')
const assetRoot = join(root, 'public', 'docs-assets')
// The docs' own stylesheets and script, each versioned by its content. A stylesheet's references to versioned public
// files (the header's mountain artwork) get their ?v= first and go to dist in that form, so its own version changes
// when the artwork does.
const assetVersions = Object.fromEntries(await Promise.all(['docs.css', 'docs-mobile.css', 'docs.js', 'blog.css', 'account.css', 'account.js', 'dashboard.css', 'dashboard.js', 'dashboard-charts.js', 'dashboard-octopus.js', 'playground-request.js'].map(async name => {
  const source = await readFile(join(assetRoot, name), 'utf8')
  const shipped = name.endsWith('.css') ? versionAssetReferences(source, join(root, 'public')) : source
  if (shipped !== source) await writeFile(join(root, 'dist', 'docs-assets', name), shipped)
  return [name, createHash('sha256').update(shipped).digest('hex').slice(0, 12)]
})))

// The preview server replaces this token with the site's public origin when it serves a page, the sitemap or
// robots.txt (packages/public-preview/src/site.ts), so absolute URLs follow the domain without a rebuild.
const ORIGIN = '__W2L_ORIGIN__'
const OG_IMAGE = `${ORIGIN}/assets/og-card.jpg`
const OG_IMAGE_ALT = 'Octocrawl: One link. Web data, ready. A URL box over a glyph-painted mountain at sunset.'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
const escape = md.utils.escapeHtml
const pathFor = page => page.slug ? `/docs/${page.slug}/` : '/docs/'
const slug = value => value.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-') || 'section'

// A code block is a session sheet: its language as the kicker, a Copy button, and numbered lines. Each line is its own
// span, with the newlines kept between them, so copying the code (its text) never takes the numbers.
md.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || 'text'
  const lines = token.content.replace(/\n$/, '').split('\n').map(line => `<span class="line">${escape(line)}</span>`).join('\n')
  return `<div class="doc-code"><div class="doc-code-head"><span class="doc-code-lang">${escape(language)}</span><button type="button" class="copy-code" aria-label="Copy ${escape(language)} example">Copy</button></div><pre><code>${lines}</code></pre></div>`
}
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const href = token.attrGet('href') ?? ''
  if (/^https?:\/\//i.test(href)) token.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, index, options)
}

/** A file under public/ with its content version, so it can be cached for a year and still change. */
const publicVersions = new Map()
function versioned(path) {
  if (!publicVersions.has(path)) publicVersions.set(path, createHash('sha256').update(readFileSync(join(root, 'public', path))).digest('hex').slice(0, 12))
  return `${path}?v=${publicVersions.get(path)}`
}

/** An image's width and height from its own header (WebP or PNG), so the page reserves its box before it loads. */
function imageSize(path) {
  const bytes = readFileSync(join(root, 'public', path))
  if (bytes.toString('ascii', 1, 4) === 'PNG') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16)
    if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) }
    if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
    if (chunk === 'VP8L') { const b = bytes.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) } }
  }
  throw new Error(`${path}: not a PNG or WebP image this build can measure`)
}

// An image alone in its paragraph is a figure: the image with its size, and its title as the caption. Images are
// files under public/ (an absolute path); one elsewhere is refused, since the site's policy only loads its own.
md.core.ruler.after('inline', 'figure', state => {
  for (let index = 0; index + 2 < state.tokens.length; index++) {
    const [open, inline, close] = state.tokens.slice(index, index + 3)
    if (open.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close') continue
    const children = inline.children.filter(child => !(child.type === 'text' && !child.content.trim()))
    if (children.length !== 1 || children[0].type !== 'image') continue
    open.tag = close.tag = 'figure'
    open.attrSet('class', 'doc-figure')
    children[0].meta = { figure: true }
  }
})
md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index]
  const src = token.attrGet('src') ?? ''
  if (!src.startsWith('/') || src.startsWith('//')) throw new Error(`image ${src}: use a file under public/, by its absolute path`)
  const { width, height } = imageSize(src)
  const alt = token.children?.map(child => child.content).join('') ?? token.content
  const caption = token.attrGet('title')
  const image = `<img src="${escape(versioned(src))}" alt="${escape(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async" />`
  return token.meta?.figure && caption ? `${image}<figcaption>${md.renderInline(caption)}</figcaption>` : image
}

/** The page's HTML, with an id on every heading and a number on every section (h2); the sections also go to the
 * page's table of contents. */
function renderMarkdown(source, toc = []) {
  const tokens = md.parse(source, {})
  const used = new Set()
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index].type !== 'heading_open') continue
    const value = tokens[index + 1]?.children?.map(child => child.content).join('') ?? ''
    const base = slug(value)
    let id = base
    for (let suffix = 2; used.has(id); suffix++) id = `${base}-${suffix}`
    used.add(id)
    tokens[index].attrSet('id', id)
    if (tokens[index].tag !== 'h2') continue
    const number = String(toc.length + 1).padStart(2, '0')
    toc.push({ id, title: value, number })
    tokens[index].attrSet('data-n', number)
  }
  return md.renderer.render(tokens, md.options, {})
}

const REMOTE_MCP_URL = 'https://mcp.octocrawl.dev/mcp'
/** Two client lists: the hosted URL (verified 2026-10-06 from Claude Code, Cursor and OpenCode against mcp.octocrawl.dev) and the stdio server on the reader's computer. */
const mcpClients = {
  remote: [
    {
      id: 'claude', name: 'Claude Code', mode: 'Run in terminal', status: 'Verified 2026-10-06',
      icon: 'claude-code.svg',
      intro: 'Add hosted Octocrawl to Claude Code over HTTP. Run this in the project where you use Claude Code; --scope user adds it everywhere.',
      code: `claude mcp add --transport http octocrawl ${REMOTE_MCP_URL}`, language: 'bash',
      verify: 'Run claude mcp list: octocrawl shows as Connected. In Claude Code, /mcp lists scrape, map and scrape_product; then send the first task below.',
      source: 'https://code.claude.com/docs/en/mcp',
    },
    {
      id: 'cursor', name: 'Cursor', mode: 'Copy config', status: 'Verified 2026-10-06',
      icon: 'cursor.svg',
      intro: 'Merge this server into your project .cursor/mcp.json (or your user-level ~/.cursor/mcp.json). Keep existing servers.',
      code: `{\n  "mcpServers": {\n    "octocrawl": {\n      "url": "${REMOTE_MCP_URL}"\n    }\n  }\n}`, language: 'json',
      verify: 'Approve the server when Cursor asks, then check its tools in Cursor Settings → MCP. In Cursor CLI, cursor-agent mcp enable octocrawl approves it and cursor-agent mcp list-tools octocrawl lists the three tools.',
      source: 'https://cursor.com/docs/mcp',
    },
    {
      id: 'opencode', name: 'OpenCode', mode: 'Copy config', status: 'Verified 2026-10-06',
      icon: 'opencode.svg',
      intro: 'For OpenCode 1.x, merge this entry into the mcp object in opencode.json. Keep your existing settings and servers.',
      code: `{\n  "mcp": {\n    "octocrawl": {\n      "type": "remote",\n      "url": "${REMOTE_MCP_URL}",\n      "enabled": true\n    }\n  }\n}`, language: 'json',
      verify: 'Run opencode mcp list: octocrawl shows as connected. Then ask for the first task below.',
      source: 'https://opencode.ai/docs/mcp-servers',
    },
    {
      id: 'codex', name: 'Codex', mode: 'Run in terminal', status: 'Follows the Codex docs; not run here yet',
      icon: 'codex.svg',
      intro: 'Add hosted Octocrawl to Codex as a Streamable HTTP server.',
      code: `codex mcp add octocrawl --url ${REMOTE_MCP_URL}`, language: 'bash',
      verify: 'Run codex mcp list, open a new Codex task, then use /mcp to check that the scrape tool is available.',
      source: 'https://learn.chatgpt.com/docs/extend/mcp',
    },
  ],
  local: [
    {
      id: 'claude', name: 'Claude Code', mode: 'Run in terminal', status: 'Verified 2026-10-06',
      icon: 'claude-code.svg',
      intro: 'Add the stdio server to Claude Code. Run this in the project where you use Claude Code; --scope user adds it everywhere.',
      code: 'claude mcp add octocrawl -- npx -y @octocrawl/mcp', language: 'bash',
      verify: 'Run claude mcp list: octocrawl shows as Connected. In Claude Code, /mcp lists its tools; then send the first task.',
      source: 'https://code.claude.com/docs/en/mcp',
    },
    {
      id: 'cursor', name: 'Cursor', mode: 'Copy config', status: 'Verified 2026-10-06',
      icon: 'cursor.svg',
      intro: 'Merge this server into your project .cursor/mcp.json (or your user-level ~/.cursor/mcp.json). Keep existing servers.',
      code: '{\n  "mcpServers": {\n    "octocrawl": {\n      "command": "npx",\n      "args": ["-y", "@octocrawl/mcp"]\n    }\n  }\n}', language: 'json',
      verify: 'Approve the server when Cursor asks, then check its tools in Cursor Settings → MCP. In Cursor CLI, cursor-agent mcp enable octocrawl approves it and cursor-agent mcp list-tools octocrawl lists the tools.',
      source: 'https://cursor.com/docs/mcp',
    },
    {
      id: 'opencode', name: 'OpenCode', mode: 'Copy config', status: 'Verified 2026-10-06',
      icon: 'opencode.svg',
      intro: 'For OpenCode 1.x, merge this entry into the mcp object in opencode.json. Keep your existing settings and servers.',
      code: '{\n  "mcp": {\n    "octocrawl": {\n      "type": "local",\n      "command": ["npx", "-y", "@octocrawl/mcp"],\n      "enabled": true\n    }\n  }\n}', language: 'json',
      verify: 'Run opencode mcp list: octocrawl shows as connected. Then ask for the first task.',
      source: 'https://opencode.ai/docs/mcp-servers',
    },
    {
      id: 'codex', name: 'Codex', mode: 'Run in terminal', status: 'Follows the Codex docs; not run here yet',
      icon: 'codex.svg',
      intro: 'Add the stdio server to Codex.',
      code: 'codex mcp add octocrawl -- npx -y @octocrawl/mcp', language: 'bash',
      verify: 'Run codex mcp list, open a new Codex task, then use /mcp to check that the scrape tool is available.',
      source: 'https://learn.chatgpt.com/docs/extend/mcp',
    },
  ],
}

const PICKER_HEAD = {
  remote: { title: 'Connect to hosted Octocrawl', lead: `One URL, no account: <code>${REMOTE_MCP_URL}</code>. Scrape and map over HTTP, a daily allowance per address; <a href="#add-a-key-for-more">a key</a> for more.`, foot: `Using another MCP client? Its Streamable HTTP URL is ${REMOTE_MCP_URL}; a key goes in an Authorization: Bearer header, never in the URL.`, link: { href: '#send-your-first-task', text: 'Then send a first task' } },
  local: { title: 'Add the server to your client', lead: 'The server runs on this computer as <code>npx -y @octocrawl/mcp</code> and talks to the API from the step above.', foot: 'Using another MCP client? Register the stdio command npx -y @octocrawl/mcp. It calls the API at http://127.0.0.1:8787; pass --base-url to use another.', link: { href: '#run-it-on-your-computer', text: 'Start the API first' } },
}

function mcpClientPicker(variant) {
  const clients = mcpClients[variant]
  const head = PICKER_HEAD[variant]
  const tabs = clients.map((client, index) => `<button type="button" class="mcp-client-tab" role="tab" id="mcp-tab-${variant}-${client.id}" aria-controls="mcp-panel-${variant}-${client.id}" aria-selected="${index === 0}" tabindex="${index === 0 ? '0' : '-1'}"><img src="/docs-assets/agent-clients/${escape(client.icon)}" width="48" height="48" alt="" /><strong>${escape(client.name)}</strong><small>${escape(client.mode)}</small></button>`).join('')
  const panels = clients.map((client, index) => `<section class="mcp-client-panel" role="tabpanel" id="mcp-panel-${variant}-${client.id}" aria-labelledby="mcp-tab-${variant}-${client.id}"${index === 0 ? '' : ' hidden'}><p class="mcp-client-intro">${escape(client.intro)}</p><div class="doc-code mcp-command-row${client.language === 'json' ? ' is-json' : ''}"><span class="mcp-command-prefix" aria-hidden="true">${client.language === 'bash' ? '$' : '{}'}</span><pre><code>${escape(client.code)}</code></pre><button type="button" class="copy-code" aria-label="Copy ${escape(client.name)} setup">Copy</button></div><p class="mcp-client-verify">${escape(client.verify)}</p><div class="mcp-client-panel-meta"><span class="mcp-client-status${client.status.startsWith('Verified') ? ' is-verified' : ''}">${escape(client.status)}</span><a href="${escape(client.source)}" rel="noopener noreferrer" target="_blank">${escape(client.name)} setup docs ↗</a></div></section>`).join('')
  const footCode = variant === 'remote' ? REMOTE_MCP_URL : 'npx -y @octocrawl/mcp'
  return `<div class="mcp-picker"><div class="mcp-picker-head"><div><h2>${head.title}</h2><p>${head.lead}</p></div><a href="${head.link.href}">${head.link.text} <span aria-hidden="true">→</span></a></div><div class="mcp-client-tabs" role="tablist" aria-label="Choose an MCP client">${tabs}</div>${panels}<div class="mcp-picker-foot"><p>Using another MCP client?</p><div class="doc-code mcp-command-row"><pre><code>${escape(footCode)}</code></pre><button type="button" class="copy-code" aria-label="Copy">Copy</button></div><small>${escape(head.foot.replace(/^Using another MCP client\? /, ''))}</small></div></div>`
}

/** The client picker as plain Markdown, for the page's .md copy and llms-full.txt. */
function mcpClientMarkdown(variant) {
  const head = PICKER_HEAD[variant]
  return [`## ${head.title}`, '', head.lead.replace(/<[^>]+>/g, ''), '',
    ...mcpClients[variant].flatMap(client => [`### ${client.name}`, '', `${client.intro} (${client.mode}; ${client.status}.)`, '', `\`\`\`${client.language}`, client.code, '```', '', client.verify, '', `Setup docs: ${client.source}`, '']),
    head.foot, ''].join('\n')
}

/** The page's Markdown as published beside it (index.md) and in llms-full.txt. */
function pageMarkdown(page, source) {
  return page.slug === 'connect-mcp' ? source.replace(/\{\{MCP_CLIENT_PICKER:(remote|local)\}\}/g, (_, variant) => mcpClientMarkdown(variant)) : source
}

function renderPageContent(page, source, toc) {
  if (page.slug !== 'connect-mcp') return renderMarkdown(source, toc)
  // The page holds two pickers, the hosted URL and the local stdio server, each rendered where its marker stands.
  const parts = source.split(/\{\{MCP_CLIENT_PICKER:(remote|local)\}\}/)
  if (parts.length !== 5) throw new Error('Connect MCP page must include the remote and the local client picker markers once each')
  return renderMarkdown(parts[0], toc) + mcpClientPicker(parts[1]) + renderMarkdown(parts[2], toc) + mcpClientPicker(parts[3]) + renderMarkdown(parts[4], toc)
}

/** On this page: the sections, numbered as in the article; docs.js marks the one being read. */
function tocHtml(toc) {
  if (toc.length < 2) return ''
  return `<aside class="doc-toc"><nav aria-label="On this page"><p class="doc-toc-title"><span class="kicker-square" aria-hidden="true"></span>On this page</p><ol>${toc.map(item => `<li><a href="#${escape(item.id)}"><span class="doc-toc-n" aria-hidden="true">${item.number}</span>${escape(item.title)}</a></li>`).join('')}</ol></nav></aside>`
}

function nav(active) {
  let group = ''
  return pages.map(page => {
    const heading = group === page.group ? '' : `<p class="doc-nav-heading">${escape(page.group)}</p>`
    group = page.group
    return `${heading}<a href="${pathFor(page)}"${page.slug === active.slug ? ' aria-current="page"' : ''}><span class="doc-nav-mark" aria-hidden="true"></span>${escape(page.title)}</a>`
  }).join('')
}

/** Canonical address and link-preview card; every page shares the home page's card image. */
/** A docs page's <title>: its seoTitle, else its name with the docs suffix. */
const docTitle = page => page.seoTitle ?? `${page.title} | Octocrawl Docs`

function shareHead(path, title, description, image = { url: OG_IMAGE, alt: OG_IMAGE_ALT }) {
  return `<link rel="canonical" href="${ORIGIN}${path}" /><meta property="og:type" content="article" /><meta property="og:site_name" content="Octocrawl" /><meta property="og:url" content="${ORIGIN}${path}" /><meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" /><meta property="og:image" content="${image.url}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="${escape(image.alt)}" /><meta name="twitter:card" content="summary_large_image" /><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />`
}

/** The site's header: the same navigation as the home page (siteNav.mjs), with the page's own top-level item marked. */
function header(current = 'docs') {
  return `<header class="doc-header"><div class="doc-header-inner"><a class="doc-brand" href="/" aria-label="Octocrawl home"><img class="doc-mark" src="/assets/octopus-160.webp" width="34" height="34" alt="" /><img class="doc-wordmark" src="/assets/octocrawl-wordmark.svg" width="122" height="20" alt="" /></a>${siteNavMarkup(current)}${siteActionsMarkup()}</div></header>`
}

/** Structured data for a docs page: a technical article that is part of the Octocrawl site, and its place under Home
 * and Docs. JSON escaping keeps a title or description from closing the script element. */
function articleData(page) {
  const article = { '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description,
    url: `${ORIGIN}${pathFor(page)}`, inLanguage: 'en', isPartOf: { '@type': 'WebSite', name: 'Octocrawl', url: `${ORIGIN}/` } }
  const trail = [['Octocrawl', '/'], ['Docs', '/docs/'], ...(page.slug ? [[page.title, pathFor(page)]] : [])]
  const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${ORIGIN}${path}` })) }
  const data = [article, breadcrumbs]
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
}

function documentHtml(page, content, index, toc) {
  const previous = pages[index - 1]
  const next = pages[index + 1]
  const adjacent = `<nav class="doc-adjacent" aria-label="Next and previous pages">${previous ? `<a href="${pathFor(previous)}"><small>← Previous</small>${escape(previous.title)}</a>` : '<span></span>'}${next ? `<a href="${pathFor(next)}"><small>Next →</small>${escape(next.title)}</a>` : '<span></span>'}</nav>`
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="description" content="${escape(page.description)}" />${shareHead(pathFor(page), docTitle(page), page.description)}<link rel="alternate" type="text/markdown" href="${pathFor(page)}index.md" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" />${articleData(page)}<title>${escape(docTitle(page))}</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header()}
<div class="doc-layout${toc.length >= 2 ? ' has-toc' : ''}"><aside class="doc-sidebar"><nav aria-label="Documentation pages">${nav(page)}</nav></aside><details class="doc-mobile-pages"><summary>Browse docs: ${escape(page.title)}</summary><nav aria-label="Documentation pages on mobile">${nav(page)}</nav></details><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / ${escape(page.group)}</p><article class="doc-article">${content}</article>${adjacent}<footer class="doc-footer"><span>Try a page in the browser here, connect your agent to mcp.octocrawl.dev, or run Octocrawl on your computer with npx.</span><a href="/">Try a page ↗</a></footer></main>${tocHtml(toc)}</div><div id="copy-announcement" class="sr-only" role="status" aria-live="polite"></div><script defer src="/docs-assets/docs.js?v=${assetVersions['docs.js']}"></script><script defer src="/docs-assets/nav.js"></script></body></html>`
}

await mkdir(output, { recursive: true })
const markdown = []
for (const [index, page] of pages.entries()) {
  const source = await readFile(join(root, 'content', page.file), 'utf8')
  const target = join(output, page.slug, 'index.html')
  await mkdir(dirname(target), { recursive: true })
  const toc = []
  const content = renderPageContent(page, source, toc)
  await writeFile(target, versionPublicAssets(documentHtml(page, content, index, toc), join(root, 'public')))
  // Every page is also published as its Markdown source, for LLM readers and llms.txt.
  const text = pageMarkdown(page, source)
  await writeFile(join(output, page.slug, 'index.md'), text)
  markdown.push({ page, text })
}

// The changelog, from the repository's CHANGELOG.md: what changed, newest first, each version a section. Links to
// files in the repository go to them on GitHub, since the site does not serve them. Unreleased is what is on main and
// not yet in a published package.
const CHANGELOG_PATH = '/changelog/'
const changelogSource = (await readFile(join(root, '..', '..', 'CHANGELOG.md'), 'utf8'))
  .replace(/\]\(((?:docs|research|packages|apps|scripts|examples|python|cloudflare)\/[^)\s]+)\)/g, '](https://github.com/77777R7/Octocrawl/blob/main/$1)')
  .replace(/^# Changelog\n/, '# Changelog\n\nWhat changed in Octocrawl, newest first. **Unreleased** is on main and on this site, and not yet in a published package; each numbered version is on npm and PyPI.\n')
{
  const toc = []
  const content = renderMarkdown(changelogSource, toc)
  const description = 'What changed in Octocrawl, version by version: the CLI, SDKs, MCP server, hosted API and this site.'
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Octocrawl', '/'], ['Changelog', CHANGELOG_PATH]].map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${ORIGIN}${path}` })) }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="description" content="${escape(description)}" />${shareHead(CHANGELOG_PATH, 'Changelog | Octocrawl', description)}<link rel="alternate" type="text/markdown" href="${CHANGELOG_PATH}index.md" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" /><script type="application/ld+json">${JSON.stringify(crumbs).replace(/</g, '\\u003c')}</script><title>Changelog | Octocrawl</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header('changelog')}
<div class="doc-layout${toc.length >= 2 ? ' has-toc' : ''}"><aside class="doc-sidebar"><nav aria-label="Documentation pages">${nav({ slug: null })}</nav></aside><details class="doc-mobile-pages"><summary>Browse docs</summary><nav aria-label="Documentation pages on mobile">${nav({ slug: null })}</nav></details><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / Changelog</p><article class="doc-article">${content}</article></main>${tocHtml(toc)}</div><div id="copy-announcement" class="sr-only" role="status" aria-live="polite"></div><script defer src="/docs-assets/docs.js?v=${assetVersions['docs.js']}"></script><script defer src="/docs-assets/nav.js"></script></body></html>`
  await mkdir(join(root, 'dist', 'changelog'), { recursive: true })
  await writeFile(join(root, 'dist', 'changelog', 'index.html'), versionPublicAssets(html, join(root, 'public')))
  await writeFile(join(root, 'dist', 'changelog', 'index.md'), changelogSource)
}

// The blog: an index of the articles, newest first, each with its cover, and one page per article. An article's
// Markdown starts with its h1; the byline and the cover go under it, Keep reading after it. Each also has its own
// Markdown copy, its own link-preview image and its BlogPosting data.
const BLOG_PATH = '/blog/'
const blogHead = (title, description, path, image) => `<meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="description" content="${escape(description)}" />${shareHead(path, title, description, image)}<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" /><link rel="stylesheet" href="/docs-assets/blog.css?v=${assetVersions['blog.css']}" />`
const longDate = day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
const coverPath = (post, name) => `/blog-assets/${post.slug}/${name}`
// A cover in three widths, so a phone downloads one near its screen's width: the card (836), cover-1254 and the cover (1672).
const coverSrcset = post => `${versioned(coverPath(post, 'card.webp'))} 836w, ${versioned(coverPath(post, 'cover-1254.webp'))} 1254w, ${versioned(coverPath(post, 'cover.webp'))} 1672w`
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
const blogCrumbs = trail => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: trail.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${ORIGIN}${path}` })) })
const PUBLISHER = { '@type': 'Organization', name: 'Octocrawl', url: `${ORIGIN}/`, logo: { '@type': 'ImageObject', url: `${ORIGIN}/assets/favicon-192.png` } }
const bySlug = Object.fromEntries(posts.map(post => [post.slug, post]))
const blogCard = (post, heading = 'h2') => `<a class="blog-card" href="${blogPath(post)}"><img src="${versioned(coverPath(post, 'card.webp'))}" alt="" width="836" height="470" loading="lazy" decoding="async" /><span class="blog-card-body"><span class="blog-card-meta"><span>${escape(BLOG_CATEGORIES.find(category => category.slug === post.category)?.name ?? '')}</span><time datetime="${post.pubDate}">${longDate(post.pubDate)}</time></span><${heading}>${escape(post.title)}</${heading}><p>${escape(post.description)}</p></span></a>`
const blogFooter = '<footer class="doc-footer"><span>Try a page in the browser here, connect your agent to mcp.octocrawl.dev, or run Octocrawl on your computer with npx.</span><a href="/">Try a page ↗</a></footer>'

const blogMarkdown = []
for (const post of posts) {
  const source = await readFile(join(root, 'content', post.file), 'utf8')
  const [, h1, body] = source.match(/^# (.+)\n([\s\S]*)$/) ?? []
  if (!h1) throw new Error(`${post.file}: the article must start with its h1`)
  const toc = []
  const content = renderMarkdown(body, toc)
  const words = body.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length
  const updated = post.updatedDate ? ` · Updated <time datetime="${post.updatedDate}">${longDate(post.updatedDate)}</time>` : ''
  const cover = `<figure class="blog-cover"><img src="${versioned(coverPath(post, 'cover.webp'))}" srcset="${coverSrcset(post)}" sizes="(max-width: 820px) calc(100vw - 32px), 760px" alt="${escape(post.coverAlt)}" width="1672" height="941" fetchpriority="high" decoding="async" /></figure>`
  const related = post.related.map(slug => { const other = bySlug[slug]; if (!other) throw new Error(`${post.slug}: related article ${slug} is not published`); return blogCard(other, 'h3') }).join('')
  const ogImage = { url: `${ORIGIN}${versioned(coverPath(post, 'og.jpg'))}`, alt: post.coverAlt }
  const article = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description,
    image: [`${ORIGIN}${coverPath(post, 'og.jpg')}`, `${ORIGIN}${coverPath(post, 'cover.webp')}`], datePublished: post.pubDate, ...(post.updatedDate ? { dateModified: post.updatedDate } : {}),
    author: { '@type': 'Organization', name: BLOG_AUTHOR, url: `${ORIGIN}/` }, publisher: PUBLISHER, mainEntityOfPage: `${ORIGIN}${blogPath(post)}`,
    url: `${ORIGIN}${blogPath(post)}`, inLanguage: 'en', wordCount: words, isPartOf: { '@type': 'Blog', name: 'Octocrawl Blog', url: `${ORIGIN}${BLOG_PATH}` } }
  const html = `<!doctype html>
<html lang="en"><head>${blogHead(post.title, post.description, blogPath(post), ogImage)}<meta property="article:published_time" content="${post.pubDate}" />${post.updatedDate ? `<meta property="article:modified_time" content="${post.updatedDate}" />` : ''}<link rel="alternate" type="text/markdown" href="${blogPath(post)}index.md" />${jsonLd([article, blogCrumbs([['Octocrawl', '/'], ['Blog', BLOG_PATH], [post.title, blogPath(post)]])])}<title>${escape(post.title)}</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header('blog')}
<div class="doc-layout blog-layout${toc.length >= 2 ? ' has-toc' : ''}"><main id="main-content" class="doc-main blog-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span><a href="${BLOG_PATH}">Octocrawl / Blog</a></p><article class="doc-article blog-article"><h1>${md.renderInline(h1)}</h1><p class="blog-byline">By ${escape(BLOG_AUTHOR)} · <time datetime="${post.pubDate}">${longDate(post.pubDate)}</time>${updated}</p>${cover}${content}</article><section class="blog-related" aria-labelledby="keep-reading"><h2 id="keep-reading">Keep reading</h2><div class="blog-grid">${related}</div></section>${blogFooter}</main>${tocHtml(toc)}</div><div id="copy-announcement" class="sr-only" role="status" aria-live="polite"></div><script defer src="/docs-assets/docs.js?v=${assetVersions['docs.js']}"></script><script defer src="/docs-assets/nav.js"></script></body></html>`
  const target = join(root, 'dist', 'blog', post.slug)
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'index.html'), versionPublicAssets(html, join(root, 'public')))
  const text = `# ${h1}\n\nBy ${BLOG_AUTHOR}, ${longDate(post.pubDate)}.\n${body}`
  await writeFile(join(target, 'index.md'), text)
  blogMarkdown.push({ post, text })
}
// The index and one page per category: the title, a tab per category with articles, the newest article large, the rest
// as cards. The tabs are links, so they work without a script; a category page is noindex, since the index lists all.
{
  const title = 'Octocrawl Blog: Web Scraping for Agents and Pipelines'
  const description = 'How to read the web for AI agents and data pipelines with Octocrawl, each article built on commands we ran and the output they returned.'
  const categoryOf = Object.fromEntries(BLOG_CATEGORIES.map(category => [category.slug, category]))
  for (const post of posts) if (!categoryOf[post.category]) throw new Error(`${post.slug}: category ${post.category} is not in BLOG_CATEGORIES`)
  const tabs = [{ name: 'All Posts', path: BLOG_PATH }, ...BLOG_CATEGORIES.filter(category => posts.some(post => post.category === category.slug)).map(category => ({ name: category.name, path: categoryPath(category) }))]
  const byline = post => `<span class="blog-author"><img src="/assets/favicon-192.png" alt="" width="28" height="28" loading="lazy" decoding="async" />${escape(BLOG_AUTHOR)}</span><time datetime="${post.pubDate}">${longDate(post.pubDate)}</time>`
  const feature = post => `<a class="blog-feature" href="${blogPath(post)}"><img src="${versioned(coverPath(post, 'cover.webp'))}" srcset="${coverSrcset(post)}" sizes="(max-width: 820px) calc(100vw - 32px), 800px" alt="" width="1672" height="941" fetchpriority="high" decoding="async" /><span class="blog-feature-body"><span class="blog-feature-category">${escape(categoryOf[post.category].name)}</span><h2>${escape(post.title)}</h2><p>${escape(post.description)}</p><span class="blog-feature-meta">${byline(post)}</span></span></a>`
  const listing = (path, list) => `<div class="doc-layout blog-layout blog-index"><main id="main-content" class="doc-main blog-main"><h1 class="blog-index-title">Blog</h1><nav class="blog-tabs" aria-label="Blog categories">${tabs.map(tab => `<a href="${tab.path}"${tab.path === path ? ' aria-current="page"' : ''}>${escape(tab.name)}</a>`).join('')}</nav>${feature(list[0])}${list.length > 1 ? `<div class="blog-grid">${list.slice(1).map(post => blogCard(post)).join('')}</div>` : ''}${blogFooter}</main></div><script defer src="/docs-assets/nav.js"></script>`
  const collection = { '@context': 'https://schema.org', '@type': 'Blog', name: 'Octocrawl Blog', description, url: `${ORIGIN}${BLOG_PATH}`, publisher: PUBLISHER,
    blogPost: posts.map(post => ({ '@type': 'BlogPosting', headline: post.title, url: `${ORIGIN}${blogPath(post)}`, datePublished: post.pubDate, image: `${ORIGIN}${coverPath(post, 'og.jpg')}`, author: { '@type': 'Organization', name: BLOG_AUTHOR } })) }
  const page = (head, body) => `<!doctype html>
<html lang="en"><head>${head}</head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header('blog')}
${body}</body></html>`
  await mkdir(join(root, 'dist', 'blog'), { recursive: true })
  await writeFile(join(root, 'dist', 'blog', 'index.html'), versionPublicAssets(page(`${blogHead(title, description, BLOG_PATH)}${jsonLd([collection, blogCrumbs([['Octocrawl', '/'], ['Blog', BLOG_PATH]])])}<title>${escape(title)}</title>`, listing(BLOG_PATH, posts)), join(root, 'public')))
  for (const tab of tabs.slice(1)) {
    const category = BLOG_CATEGORIES.find(item => categoryPath(item) === tab.path)
    const list = posts.filter(post => post.category === category.slug)
    const pageTitle = `${category.name} | Octocrawl Blog`
    const pageDescription = `${category.name} articles on the Octocrawl Blog: ${list.map(post => post.title).join('; ')}.`
    await mkdir(join(root, 'dist', 'blog', 'category', category.slug), { recursive: true })
    await writeFile(join(root, 'dist', 'blog', 'category', category.slug, 'index.html'), versionPublicAssets(page(`${blogHead(pageTitle, pageDescription, tab.path)}<meta name="robots" content="noindex, follow" /><title>${escape(pageTitle)}</title>`, listing(tab.path, list)), join(root, 'public')))
  }
}
// Each docs guide that became an article answers with a 301 to it (packages/public-preview reads this file), and so
// does the account page, which became the dashboard on 2026-10-12.
await writeFile(join(root, 'dist', 'redirects.json'), `${JSON.stringify({ ...Object.fromEntries(posts.flatMap(post => [[post.from, blogPath(post)], [`${post.from}index.md`, `${blogPath(post)}index.md`]])), '/account/': '/dashboard/' }, null, 2)}\n`)

// llms.txt (https://llmstxt.org): what Octocrawl is, and a link to the Markdown copy of every page. llms-full.txt carries
// all of them in one file.
const summary = 'Octocrawl turns a public web page into readable Markdown and, on supported pages, fields you can check against the source. It reports blocks, timeouts and missing fields with a reason instead of inventing content. It is open source (AGPL-3.0). Hosted Octocrawl serves scrape and map at https://api.octocrawl.dev and https://mcp.octocrawl.dev/mcp, keyless within a daily allowance; the published packages (npx octocrawl) run everything on your own computer through REST, a TypeScript SDK, a Python client or MCP.'
const groups = [...new Set(pages.map(page => page.group))]
const llms = [
  '# Octocrawl', '', `> ${summary}`, '',
  `Try one public page in the browser at ${ORIGIN}/ (five previews a day). The source code is at https://github.com/77777R7/Octocrawl.`, '',
  ...groups.flatMap(group => [`## ${group}`, '', ...pages.filter(page => page.group === group).map(page => `- [${page.title}](${ORIGIN}${pathFor(page)}index.md): ${page.description}`), '']),
  '## Blog', '', ...posts.map(post => `- [${post.title}](${ORIGIN}${blogPath(post)}index.md): ${post.description}`), '',
  '## Optional', '', `- [All documentation in one file](${ORIGIN}/llms-full.txt)`, `- [Changelog](${ORIGIN}${CHANGELOG_PATH}index.md): what changed, version by version`, '',
].join('\n')
await writeFile(join(root, 'dist', 'llms.txt'), llms)
await writeFile(join(root, 'dist', 'llms-full.txt'), [`# Octocrawl documentation\n\n> ${summary}\n`, ...markdown.map(({ page, text }) => `<!-- ${ORIGIN}${pathFor(page)} -->\n\n${text.trim()}\n`), ...blogMarkdown.map(({ post, text }) => `<!-- ${ORIGIN}${blogPath(post)} -->\n\n${text.trim()}\n`)].join('\n'))

// The page the server answers with, status 404, for any path without a file: in the docs' reading layout, with the
// docs pages beside it and the two ways back. It is never indexed.
const notFound = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="robots" content="noindex" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" /><title>Page not found | Octocrawl</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header('')}
<div class="doc-layout"><aside class="doc-sidebar"><nav aria-label="Documentation pages">${nav({ slug: null })}</nav></aside><details class="doc-mobile-pages"><summary>Browse docs</summary><nav aria-label="Documentation pages on mobile">${nav({ slug: null })}</nav></details><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / 404</p><article class="doc-article"><h1>Page not found</h1><p>There is no page at this address. It may have moved, or the link may be mistyped.</p><ul><li><a href="/">Try Octocrawl with a public URL</a></li><li><a href="/docs/">Read the documentation</a></li></ul></article></main></div><script defer src="/docs-assets/nav.js"></script></body></html>`
await writeFile(join(root, 'dist', '404.html'), versionPublicAssets(notFound, join(root, 'public')))

// Sign-in and the dashboard (packages/public-preview auth.ts and account.ts serve their data). Not for search engines:
// noindex, and left out of the sitemap. account.js runs the sign-in pages, dashboard.js the dashboard; without a session
// the dashboard sends the visitor to sign in.
const GITHUB_ICON = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>'
const GOOGLE_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>'
function accountPageHtml(path, title, description, body, layout = '') {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="robots" content="noindex" /><meta name="description" content="${escape(description)}" /><link rel="canonical" href="${ORIGIN}${path}" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" /><link rel="stylesheet" href="/docs-assets/account.css?v=${assetVersions['account.css']}" /><title>${escape(title)} | Octocrawl</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header('account')}
<div class="doc-layout account-layout${layout}"><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / Account</p>${body}</main></div><script defer src="/docs-assets/account.js?v=${assetVersions['account.js']}"></script><script defer src="/docs-assets/nav.js"></script></body></html>`
}
const signinBody = `<article class="doc-article" id="signin"><h1>Sign in to Octocrawl</h1><p class="account-lead">An account gets 1,000 credits a month for hosted Octocrawl's API and MCP, and API keys for your agents. No card is needed.</p>
<div class="account-panel"><div class="signin-options"><a class="signin-button" data-provider="github" href="/auth/github">${GITHUB_ICON}Continue with GitHub</a><a class="signin-button" data-provider="google" href="/auth/google">${GOOGLE_ICON}Continue with Google</a><p class="signin-or">or</p>
<form class="account-form" id="email-form"><label for="signin-email">Email<input id="signin-email" name="email" type="email" required autocomplete="email" maxlength="254" /></label><button class="account-button" type="submit">Email me a sign-in link</button></form></div>
<p class="account-message" id="signin-message" role="status" aria-live="polite"></p></div>
<p class="account-small">Signing in records your email address and how you signed in, as the <a href="/docs/privacy/">privacy page</a> says. The <a href="/docs/terms/">terms</a> cover credits and keys. You can use Octocrawl without an account: hosted Octocrawl gives 20 pages a day without a key, and Octocrawl on your own computer has no limit.</p></article>`
// Where an email sign-in link lands. auth.ts serves this page at /auth/email/finish with the confirmation form put
// between the markers; opened here, it only says where the link is.
const emailFinishBody = `<article class="doc-article" id="signin-finish"><h1>Finish signing in</h1><p class="account-lead">One more click to sign in with the link from your email.</p>
<div class="account-panel"><!--w2l:email-finish--><p class="account-small">Open the sign-in link from your email to finish here, or <a href="/signin/">start again</a>.</p><!--/w2l:email-finish--></div>
<p class="account-small">The link works once, for an hour. Signing in takes this click so that a mail scanner opening the link cannot use it up.</p></article>`
for (const [path, title, description, body, layout] of [
  ['/signin/', 'Sign in', 'Sign in to Octocrawl with GitHub, Google or an email link to get 1,000 hosted credits a month and API keys.', signinBody, ' signin-layout'],
  ['/signin/email/', 'Finish signing in', 'Finish signing in to Octocrawl with the link from your email.', emailFinishBody, ' signin-layout'],
]) {
  await mkdir(join(root, 'dist', path.slice(1)), { recursive: true })
  await writeFile(join(root, 'dist', path.slice(1), 'index.html'), versionPublicAssets(accountPageHtml(path, title, description, body, layout), join(root, 'public')))
}

// The dashboard: one sidebar, eight pages, all filled by dashboard.js from GET /api/account; the Playground's two run
// through POST /api/account/run. A dark page of its own, with
// no site header: the logo goes back to the site.
const DASHBOARD_PAGES = [
  ['/dashboard/', 'Overview', 'Workspace'],
  ['/dashboard/activity/', 'Activity', 'Workspace'],
  ['/dashboard/usage/', 'Usage', 'Workspace'],
  ['/dashboard/scrape/', 'Scrape', 'Playground'],
  ['/dashboard/map/', 'Map', 'Playground'],
  ['/dashboard/keys/', 'API keys', 'Build'],
  ['/dashboard/connect/', 'Connect', 'Build'],
  ['/dashboard/account/', 'Account', 'Account'],
]
const dashCode = (id, text) => `<div class="code"><pre id="${id}">${escape(text)}</pre><button class="copy" type="button" data-copy="${id}">Copy</button></div>`
/** The request table the Activity page and the Overview share: dashboard.js fills its body from /api/account/activity. */
const requestTable = (id, rows, empty = 'No requests yet. Each call made with one of your keys or in the Playground shows here, with what it cost.') => `<div class="table-scroll"><table class="dash-table requests" data-rows="${rows}"><thead><tr><th>Time (UTC)</th><th>Endpoint</th><th>URL</th><th>Lane</th><th>Result</th><th>robots.txt</th><th class="num">Credits</th><th>Evidence</th></tr></thead><tbody id="${id}-body"></tbody></table></div><p class="dash-small" id="${id}-empty" hidden>${empty}</p>`
function dashboardPageHtml(path, title, lead, body) {
  // The Playground's pages keep their header to a line, as Firecrawl's does: the selector and the URL card come first.
  const playground = path === '/dashboard/scrape/' || path === '/dashboard/map/'
  let group = ''
  const links = DASHBOARD_PAGES.map(([href, name, section]) => {
    const heading = section === group ? '' : `<p class="dash-group">${escape(section)}</p>`
    group = section
    return `${heading}<a href="${href}"${href === path ? ' aria-current="page"' : ''}>${escape(name)}</a>`
  }).join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#04123a" /><meta name="robots" content="noindex" /><meta name="description" content="Your Octocrawl dashboard: credits, usage, API keys and how to connect." /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/dashboard.css?v=${assetVersions['dashboard.css']}" /><title>${escape(title)} | Octocrawl Dashboard</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>
<div class="dash"><aside class="dash-side"><a class="dash-brand" href="/" aria-label="Octocrawl home"><img src="/assets/octopus-160.webp" width="30" height="30" alt="" /><img src="/assets/octocrawl-wordmark.svg" width="116" height="19" alt="" /></a>
<nav class="dash-nav" aria-label="Dashboard">${links}</nav>
<div class="dash-credits"><p><strong id="side-credits">…</strong> credits left</p><progress class="credit-bar" id="side-meter" max="1" value="0" aria-label="Credits left of this month's grant"></progress><p class="dash-small" id="side-renews">&nbsp;</p></div>
<div class="dash-who"><span id="side-email">…</span><a href="/docs/">Docs ↗</a></div></aside>
<main id="main-content" class="dash-main"><header class="dash-head${playground ? ' compact' : ''}"><pre class="dash-noise" id="dash-noise" aria-hidden="true"></pre><p class="dash-kicker">Octocrawl / Dashboard</p><h1>${escape(title)}</h1>${playground ? '' : `<p class="dash-lead">${lead}</p>`}</header>
<p class="dash-message" id="dash-message" role="status" aria-live="polite"></p>
${body}</main></div><script defer src="/docs-assets/dashboard-charts.js?v=${assetVersions['dashboard-charts.js']}"></script>${playground ? `<script defer src="/docs-assets/dashboard-octopus.js?v=${assetVersions['dashboard-octopus.js']}"></script><script defer src="/docs-assets/playground-request.js?v=${assetVersions['playground-request.js']}"></script>` : ''}<script defer src="/docs-assets/dashboard.js?v=${assetVersions['dashboard.js']}"></script></body></html>`
}
// The Overview's banner: the Evidence Record, the thing that sets Octocrawl apart, centred between the octopus's arms,
// which dashboard.js draws in glyphs rising from both bottom corners and keeps swaying.
/** Clients the Overview links to, each to its setup on the Connect page. Icons are the docs' own; the rest are glyphs. */
const INTEGRATIONS = [
  ['Claude Code', 'claude', 'claude-code.svg'], ['Codex', 'codex', 'codex.svg'], ['Cursor', 'cursor', 'cursor.svg'], ['OpenCode', 'opencode', 'opencode.svg'],
  ['Cline', 'cline', 'CL'], ['Vercel AI SDK', 'sdk', '▲'], ['REST API', 'rest', '{ }'], ['On your computer', 'local', '>_'],
]
const integrationTiles = INTEGRATIONS.map(([name, id, icon]) => `<a class="int-tile" href="/dashboard/connect/#c-${id}"><span class="int-icon">${icon.endsWith('.svg') ? `<img src="/docs-assets/agent-clients/${icon}" width="22" height="22" alt="" />` : escape(icon)}</span><span class="int-name">${escape(name)}</span><span class="int-arrow" aria-hidden="true">↗</span></a>`).join('')
const overviewBody = `<section class="ev-hero" aria-labelledby="ev-title"><pre class="ev-field" id="ev-field" aria-hidden="true"></pre>
<div class="ev-copy"><p class="ev-badge">[ Evidence Record ]</p><h2 id="ev-title">Every page comes with its receipt.</h2><p>Each answer carries an Evidence Record: the address read, when, what robots.txt allowed and the SHA-256 of what came back.</p><div class="ev-actions"><a class="ev-btn primary" href="/dashboard/connect/">Connect your agent <span aria-hidden="true">→</span></a><a class="ev-btn" href="/docs/reference/#evidence-record">What a record holds</a></div></div></section>
<section class="kpis" aria-label="This month">
<div class="kpi"><p class="kpi-label">Credits left</p><p class="kpi-value" id="kpi-left">…</p><progress class="credit-bar" id="kpi-meter" max="1" value="0" aria-label="Credits left of this month's grant"></progress></div>
<div class="kpi"><p class="kpi-label">Used this month</p><p class="kpi-value" id="kpi-used">…</p><p class="kpi-sub" id="kpi-used-sub">&nbsp;</p></div>
<div class="kpi"><p class="kpi-label">Pages read · 30 days</p><p class="kpi-value" id="kpi-pages">…</p><p class="kpi-sub" id="kpi-pages-sub">&nbsp;</p></div>
<div class="kpi"><p class="kpi-label">Not charged · 30 days</p><p class="kpi-value" id="kpi-free">…</p><p class="kpi-sub">blocked, robots.txt or no answer</p></div>
</section>
<div class="dash-grid pair">
<section class="panel" aria-labelledby="used-title"><div class="panel-head"><div><h2 id="used-title">Credits used</h2><p class="dash-small" id="used-range">Last 7 days (UTC)</p></div><div class="panel-tools"><span class="big-figure" id="used-total">…</span><div class="tabs" role="group" aria-label="Range"><button type="button" aria-pressed="true" data-range="7">7 days</button><button type="button" aria-pressed="false" data-range="30">30 days</button></div></div></div>
<div class="chart-wrap"><pre class="chart-ascii" id="used-ascii" aria-hidden="true"></pre><div id="used-chart"></div></div><a class="panel-link" href="/dashboard/usage/">Usage →</a></section>
<section class="panel" aria-labelledby="key-title"><div class="panel-head"><h2 id="key-title">API key</h2><a class="button small" href="/dashboard/keys/">Create key</a></div>
<div class="panel-body"><div><ul class="key-list" id="keys-mini"></ul><p class="dash-small" id="keys-mini-empty" hidden>No keys yet. A key spends this account's credits and opens the browser lane.</p></div>
<div><h3>MCP server</h3>${dashCode('ov-mcp', 'https://mcp.octocrawl.dev/mcp')}</div><div><h3>On your computer, free</h3>${dashCode('ov-cli', 'npx octocrawl serve')}</div></div><a class="panel-link" href="/dashboard/connect/">Set up an agent →</a></section>
</div>
<section class="panel" aria-labelledby="int-title"><div class="panel-head"><h2 id="int-title">Integrations</h2><a href="/dashboard/connect/">All setups →</a></div><div class="integrations">${integrationTiles}</div></section>
<section class="panel" aria-labelledby="recent-title"><div class="panel-head"><h2 id="recent-title">Recent requests</h2><a href="/dashboard/activity/">Activity →</a></div>${requestTable('recent', 5)}</section>`
const activityBody = `<section class="panel" aria-labelledby="activity-title"><div class="panel-head"><h2 id="activity-title">Requests</h2><span class="dash-small" id="activity-count">&nbsp;</span></div>
<form class="filters" id="activity-filters"><label for="f-search">URL contains<input id="f-search" name="search" type="search" autocomplete="off" placeholder="example.com" /></label><label for="f-endpoint">Endpoint<select id="f-endpoint" name="endpoint"><option value="">All</option><option value="scrape">/scrape</option><option value="map">/map</option></select></label><label for="f-key">Key<select id="f-key" name="key"><option value="">All keys</option></select></label><label for="f-result">Result<select id="f-result" name="result"><option value="">All</option><option value="read">Read</option><option value="free">Not charged</option></select></label><button class="button quiet" type="button" id="export-csv">Export CSV</button></form>
${requestTable('activity', 0)}
<p class="dash-small">Lines are kept 30 days and only you see them: the URL asked for, what came back and what it cost, with the body's SHA-256 from the Evidence Record. Never the page's content. The page shows the latest 1,000. Runs in the Playground show under the key Playground.</p></section>`
const usageBody = `<section class="summary" aria-label="Summary">
<div class="summary-main"><p class="kpi-label">Credits remaining</p><p class="summary-figure" id="sum-left">…</p><p class="dash-small" id="sum-renews">&nbsp;</p><progress class="credit-bar" id="sum-meter" max="1" value="0" aria-label="Credits left of this month's grant"></progress></div>
<div class="summary-cell"><p class="kpi-label">Credits used · 30 days</p><p class="kpi-value" id="sum-used">…</p></div>
<div class="summary-cell"><p class="kpi-label">Pages read · 30 days</p><p class="kpi-value" id="sum-pages">…</p></div>
<div class="summary-cell"><p class="kpi-label">Read · calls with a result</p><p class="kpi-value" id="sum-rate">—</p><p class="dash-small" id="sum-rate-sub">from request lines</p></div>
</section>
<section class="panel" aria-labelledby="over-time-title"><div class="panel-head"><div><h2 id="over-time-title">Usage over time</h2><p class="dash-small">Per UTC day, last 30 days</p></div><div class="panel-tools"><div class="tabs" role="group" aria-label="Group by"><button type="button" aria-pressed="true" data-group="kind">By kind</button><button type="button" aria-pressed="false" data-group="endpoint">By endpoint</button></div><div class="tabs" role="group" aria-label="Measure"><button type="button" aria-pressed="true" data-measure="credits">Credits</button><button type="button" aria-pressed="false" data-measure="calls">Calls</button></div></div></div>
<div id="usage-bars"></div><p class="chart-legend" id="usage-legend"></p></section>
<div class="dash-grid even">
<section class="panel" aria-labelledby="by-site-title"><div class="panel-head"><h2 id="by-site-title">By site</h2><span class="dash-small">credits, from request lines</span></div><div id="site-map"></div><p class="dash-small" id="by-site-empty" hidden>No request lines yet. Each call made with one of your keys adds to this.</p></section>
<section class="panel" aria-labelledby="by-key-title"><div class="panel-head"><h2 id="by-key-title">By key</h2><span class="dash-small">credits, from request lines</span></div><ul class="sources" id="by-key-list"></ul><p class="dash-small" id="by-key-empty" hidden>No request lines yet.</p></section>
</div>
<section class="panel" aria-labelledby="usage-table-title"><div class="panel-head"><h2 id="usage-table-title">Day by day</h2><span class="dash-small" id="usage-total">&nbsp;</span></div><div class="table-scroll"><table class="dash-table"><thead><tr><th>Day (UTC)</th><th class="num">HTTP</th><th class="num">Browser</th><th class="num">Not found</th><th class="num">Map</th><th class="num">Not charged</th><th class="num">Credits</th></tr></thead><tbody id="usage-body"></tbody><tfoot id="usage-foot"></tfoot></table></div><p class="dash-small" id="usage-empty" hidden>No calls in the last 30 days.</p>
<p class="dash-small">A page read over HTTP costs 1 credit, a page read in a browser 5, a page that does not exist 1, and a map 1. A page that was blocked, or a call that read nothing, costs nothing. Days are UTC. Totals by site and key come from request lines, kept 30 days. <a href="/docs/limits/#hosted-api-and-mcp">Limits</a> has the details.</p></section>`
const keysBody = `<section class="panel" aria-labelledby="keys-title"><div class="panel-head"><h2 id="keys-title">API keys</h2><span class="dash-small">At most five active keys</span></div>
<p>Send a key as <code>Authorization: Bearer &lt;key&gt;</code> to <code>https://api.octocrawl.dev</code> or <code>https://mcp.octocrawl.dev/mcp</code>. Its calls spend this account's credits and may use the browser.</p>
<form class="dash-form" id="key-form"><label for="key-label">Name (optional)<input id="key-label" name="label" maxlength="60" placeholder="laptop agent" autocomplete="off" /></label><button class="button" type="submit">Create key</button></form>
<div class="key-reveal" id="key-reveal" hidden><p>Your new key. Copy it now: it is shown only once.</p>${dashCode('new-key', '')}<p class="dash-small">Claude Code:</p>${dashCode('new-key-mcp', '')}</div>
<div class="table-scroll"><table class="dash-table"><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Status</th><th><span class="sr-only">Action</span></th></tr></thead><tbody id="keys-body"></tbody></table></div><p class="dash-small" id="keys-empty" hidden>No keys yet.</p></section>`
/** One client's setup on the Connect page: a row that opens to its command or config. */
const installRow = (id, name, icon, note, code) => `<details class="install-row" id="c-${id}"><summary><span class="int-icon">${icon.endsWith('.svg') ? `<img src="/docs-assets/agent-clients/${icon}" width="22" height="22" alt="" />` : escape(icon)}</span><strong>${escape(name)}</strong><span class="install-btn">Show setup</span></summary><div class="install-body"><p class="dash-small">${note}</p>${dashCode(`code-${id}`, code)}</div></details>`
const connectBody = `<div class="dash-grid even">
<section class="panel" aria-labelledby="agents-title"><div class="panel-head"><div><h2 id="agents-title">Coding agents</h2><p class="dash-small">Add hosted Octocrawl with one command or one config entry. Put your key where it says <code>oc_YOUR_KEY</code>.</p></div></div>
${installRow('claude', 'Claude Code', 'claude-code.svg', 'Run in a terminal; add <code>--scope user</code> to have it in every project.', 'claude mcp add --transport http octocrawl https://mcp.octocrawl.dev/mcp --header "Authorization: Bearer oc_YOUR_KEY"')}
${installRow('codex', 'Codex', 'codex.svg', 'Codex reads the key from an environment variable.', 'export OCTOCRAWL_API_KEY=oc_YOUR_KEY\ncodex mcp add octocrawl --url https://mcp.octocrawl.dev/mcp --bearer-token-env-var OCTOCRAWL_API_KEY')}
${installRow('cursor', 'Cursor', 'cursor.svg', 'Merge into <code>.cursor/mcp.json</code>; <code>"Bearer ${env:OCTOCRAWL_API_KEY}"</code> reads the key from the environment.', '{ "mcpServers": { "octocrawl": { "url": "https://mcp.octocrawl.dev/mcp", "headers": { "Authorization": "Bearer oc_YOUR_KEY" } } } }')}
${installRow('opencode', 'OpenCode', 'opencode.svg', 'Merge into the <code>mcp</code> object of <code>opencode.json</code>.', '{ "mcp": { "octocrawl": { "type": "remote", "url": "https://mcp.octocrawl.dev/mcp", "enabled": true, "headers": { "Authorization": "Bearer oc_YOUR_KEY" } } } }')}
${installRow('cline', 'Cline', 'CL', 'Merge into <code>cline_mcp_settings.json</code> (MCP Servers → Configure), keeping your other servers.', '{ "mcpServers": { "octocrawl": { "type": "streamableHttp", "url": "https://mcp.octocrawl.dev/mcp", "headers": { "Authorization": "Bearer oc_YOUR_KEY" }, "disabled": false } } }')}
</section>
<div class="stack">
<section class="panel" aria-labelledby="mcp-title"><div class="panel-head"><h2 id="mcp-title">MCP</h2><a href="/docs/connect-mcp/">Docs →</a></div><p>Point any MCP client at the hosted server and send your key in the <code>Authorization: Bearer</code> header, never in the URL.</p>
<h3>URL</h3>${dashCode('mcp-url', 'https://mcp.octocrawl.dev/mcp')}
<h3>OCTOCRAWL_API_KEY</h3><div class="kv"><code id="conn-key">oc_…</code><a class="panel-link" href="/dashboard/keys/">Create a key →</a></div><p class="dash-small">A key is shown once, when you create it. This page shows the start of your newest key so you can tell them apart.</p></section>
<section class="panel" aria-labelledby="api-title"><div class="panel-head"><h2 id="api-title">From code</h2><a href="/docs/reference/">API reference →</a></div>
<h3 id="c-rest">REST</h3>${dashCode('c-rest-code', `curl https://api.octocrawl.dev/v1/scrape \\\n  -H 'authorization: Bearer oc_YOUR_KEY' \\\n  -H 'content-type: application/json' \\\n  -d '{"url":"https://example.com","formats":["markdown"]}'`)}
<h3 id="c-sdk">Vercel AI SDK</h3>${dashCode('c-sdk-code', `npm install @octocrawl/ai-sdk ai zod\n\nimport { octocrawlTools } from '@octocrawl/ai-sdk'\nconst tools = octocrawlTools() // reads OCTOCRAWL_API_KEY`)}</section>
<section class="panel" aria-labelledby="c-local"><div class="panel-head"><h2 id="c-local">On your own computer</h2></div><p>Free and without limit, with every tool: crawl, batch and Monitor too. No key and no credits.</p>${dashCode('c-local-code', 'npx octocrawl serve')}</section>
</div></div>`
/**
 * A Playground page, laid out as Firecrawl's: a selector on top, the URL card in a band below it, then the result and
 * the account's recent runs. The selector is Octocrawl's own: one button naming the endpoint, which opens a panel of
 * tiles printed in the site's style (scrape, map, and crawl on your own computer). Behind the card the home page's
 * octopus, drawn in glyphs, peeks over its top edge and reaches out on both sides; the recent runs are receipts over a
 * slow current of glyphs. Both pages are one layout: dashboard.js switches between them in place and sends the card to
 * POST /api/account/run, which the hosted API charges like a key's call; dashboard-octopus.js draws the glyphs.
 */
const PLAYGROUND_MODES = {
  scrape: ['Extract', 'Scrape', '▤', 'One page as Markdown, links, page info or fields, with its Evidence Record.', '1–5 credits'],
  map: ['Discover', 'Map', '⌗', 'Every URL of a site, from its sitemap and its links.', '0–1 credit'],
}
/** The home page's format tiles (src/page.ts), word for word; dashboard.js draws each icon on the same glyph grid. */
const formatTiles = [['markdown', 'Markdown', 'readable text', '.md'], ['links', 'Links', 'every link on the page', '.links.txt'], ['info', 'Page info', 'title, language; a file\'s pages', '.info.json'], ['fields', 'Fields', 'the fields set in Options', '.fields.json'], ['json', 'JSON', 'the whole result', '.json']]
  .map(([view, name, note, ext], i) => `<label class="format-tile"><input type="radio" name="view" value="${view}"${i === 0 ? ' checked' : ''} /><span class="tile-icon" data-icon="${view}" aria-hidden="true"></span><span class="tile-name">${name}</span><span class="tile-note">${note}</span><span class="tile-ext">${ext}</span></label>`).join('')
const playgroundBody = (endpoint) => {
  const only = (which) => `data-only="${which}"${which === endpoint ? '' : ' hidden'}`
  const [kicker, name, glyph] = PLAYGROUND_MODES[endpoint]
  const tile = (which) => { const [k, n, g, about, cost] = PLAYGROUND_MODES[which]; return `<button class="pg-tile" type="button" data-endpoint="${which}" aria-pressed="${which === endpoint}"><span class="pg-tile-glyph" aria-hidden="true">${g}</span><span class="pg-kicker">${k}</span><strong>${n}</strong><span class="pg-tile-about">${about}</span><code>${cost}</code></button>` }
  // The home page's five views of one extraction (src/page.ts, format tiles), then the Evidence Record the API adds.
  const views = [['markdown', 'Markdown', 'scrape'], ['links', 'Links', ''], ['info', 'Page info', 'scrape'], ['fields', 'Fields', 'scrape'], ['json', 'JSON', ''], ['evidence', 'Evidence Record', 'scrape']]
    .map(([view, n, which]) => `<button type="button" role="tab" aria-selected="false" data-view="${view}"${which ? ` ${only(which)}` : ''}>${n}</button>`).join('')
  const cross = (where) => `<span class="pg-cross ${where}" aria-hidden="true">+</span>`
  return `<section class="pg" id="pg" data-endpoint="${endpoint}">
<div class="pg-frame">
<div class="pg-top">${cross('tl')}${cross('tr')}<button class="pg-picker" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="pg-modes" data-panel="pg-modes"><span class="pg-kicker" id="pg-picker-kicker">${kicker}</span><span class="pg-picker-name"><span class="pg-glyph" id="pg-picker-glyph" aria-hidden="true">${glyph}</span><span id="pg-picker-name">${name}</span></span><span class="pg-caret" aria-hidden="true">▾</span></button>
<div class="pg-panel pg-modes" id="pg-modes" role="dialog" aria-label="What to run" hidden><p class="pg-kicker">What to run</p><div class="pg-tiles">${tile('scrape')}${tile('map')}<a class="pg-tile is-local" href="/dashboard/connect/#c-local"><span class="pg-tile-glyph" aria-hidden="true">&gt;_</span><span class="pg-kicker">On your computer</span><strong>Crawl</strong><span class="pg-tile-about">Crawl, batch and Monitor run on your own machine, free and without limit.</span><code>npx octocrawl serve</code></a></div></div></div>
<div class="pg-band" id="pg-stage">${cross('bl')}${cross('br')}<div class="pg-depth" aria-hidden="true"><canvas class="pg-octopus" id="pg-octopus"></canvas></div>
<form class="pg-card" id="play-form" data-endpoint="${endpoint}" novalidate>
<div class="pg-entry"><label class="pg-chip" for="play-url">URL</label><input id="play-url" name="url" type="url" inputmode="url" required placeholder="Paste a public page URL…" autocomplete="off" spellcheck="false" /></div>
<div class="pg-toolbar"><div class="pg-tools">
<button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-format" data-panel="pg-format" ${only('scrape')}><span class="pg-glyph" aria-hidden="true">▤</span><span class="sr-only">Format: </span><span id="pg-format-label">Markdown</span></button>
<button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-options" data-panel="pg-options"><span class="pg-glyph" aria-hidden="true">≡</span>Options<span class="pg-badge" id="pg-options-badge" hidden></span></button></div>
<div class="pg-tools"><span class="pg-cost" id="play-cost"></span><button class="pg-tool" type="button" aria-expanded="false" aria-controls="pg-code" data-panel="pg-code"><span class="pg-glyph" aria-hidden="true">&lt;/&gt;</span>Get code</button><button class="pg-go" type="submit" id="play-submit"><span id="pg-go-label">${endpoint === 'scrape' ? 'Extract page' : 'Map site'}</span> <span aria-hidden="true">→</span></button></div></div>
<div class="pg-panel wide pg-formats" id="pg-format" hidden><p class="pg-kicker">Format</p><div class="format-tiles" role="radiogroup" aria-label="Format">${formatTiles}</div><p class="dash-small">All from one run, so switching never costs another credit.</p></div>
<div class="pg-panel wide" id="pg-options" hidden><p class="pg-kicker">Options</p>
<div class="pg-read" ${only('scrape')}><p class="pg-label" id="pg-read-title">Read</p><div class="pg-scope" role="radiogroup" aria-labelledby="pg-read-title"><label><input type="radio" name="scope" value="main" checked /> Main content</label><label><input type="radio" name="scope" value="whole" /> Whole page</label></div><p class="dash-small" id="pg-scope-note"></p></div>
<section class="pg-fields-editor" ${only('scrape')} aria-labelledby="pg-fields-title"><div class="pg-fields-head"><p class="pg-label" id="pg-fields-title">Fields</p><span class="pg-count" id="pg-fields-count"></span><button class="pg-link" id="pg-fields-preset" type="button" aria-label="Use the product fields: name, brand, price, currency, availability, SKU, rating and review count">+ product fields</button></div>
<div class="pg-field-list" id="pg-field-list" role="list" aria-labelledby="pg-fields-title"></div>
<div class="pg-field-new"><span aria-hidden="true">›</span><input id="pg-field-new" maxlength="64" autocomplete="off" spellcheck="false" aria-label="New field name" placeholder="add a field: type a name, then Enter" /><button class="pg-link" id="pg-field-add" type="button">add</button></div>
<p class="pg-error" id="pg-fields-error" role="alert"></p>
<p class="dash-small">Read from the page itself: JSON-LD, microdata, meta tags, tables and a PDF's "Label: value" lines. No AI: a field the page does not state comes back empty, with the reason. Amazon.sg product pages take no options.</p></section>
<div class="pg-fields" ${only('map')}><label>Search<input name="search" maxlength="200" placeholder="docs" autocomplete="off" /></label><label>Limit<input name="limit" type="number" min="1" max="5000" value="100" /></label></div></div>
<div class="pg-panel wide" id="pg-code" hidden><div class="panel-head"><p class="pg-kicker">Get code</p><div class="tabs" role="group" aria-label="Language"><button type="button" aria-pressed="true" data-lang="curl">cURL</button><button type="button" aria-pressed="false" data-lang="js">JavaScript</button></div></div>${dashCode('play-code', '')}<p class="dash-small">The same call from your code or agent: put a key from <a href="/dashboard/keys/">API keys</a> where it says <code>oc_YOUR_KEY</code>. It costs what a run here costs.</p></div>
</form>
<p class="pg-note" id="play-summary" role="status" aria-live="polite"></p></div>
</div>
<section class="panel pg-result" id="play-result" hidden aria-labelledby="result-title"><div class="panel-head"><div><h2 id="result-title">Result</h2><p class="dash-small" id="play-detail"></p></div><span class="status" id="play-status"></span></div>
<div class="tabs play-views" role="tablist" aria-label="Result view">${views}</div>
<dl class="facts play-evidence" id="play-evidence" hidden></dl>
<div class="code"><pre class="play-output" id="play-output" tabindex="0"></pre><button class="copy" type="button" data-copy="play-output">Copy</button></div></section>
<section class="pg-runs" aria-labelledby="runs-title"><pre class="pg-sea" id="pg-sea" aria-hidden="true"></pre><div class="pg-runs-head"><div><p class="pg-kicker">Receipts</p><h2 id="runs-title">Recent runs</h2></div><a href="/dashboard/activity/">Activity →</a></div><div class="receipts" id="run-cards"></div><p class="dash-small pg-runs-empty" id="runs-empty" hidden>No runs here yet. Each run leaves a receipt here and a line on Activity: what was read, what robots.txt allowed, what it cost and the SHA-256 of what came back.</p></section>
</section>`
}
const accountBody = `<section class="panel" aria-labelledby="who-title"><div class="panel-head"><h2 id="who-title">Signed in</h2></div><dl class="facts">
<dt>Email</dt><dd id="acct-email">…</dd>
<dt>Sign-in methods</dt><dd><span class="chips" id="acct-providers"></span></dd>
<dt>This month</dt><dd id="acct-month">…</dd>
<dt>Bought credits</dt><dd id="acct-bought">…</dd>
</dl></section>
<section class="panel" aria-labelledby="out-title"><div class="panel-head"><h2 id="out-title">Session and records</h2></div><p>What signing in records is on the <a href="/docs/privacy/">privacy page</a>; credits and keys are covered by the <a href="/docs/terms/">terms</a>.</p><form method="post" action="/auth/logout"><button class="button quiet" type="submit">Sign out</button></form></section>`
for (const [path, title, lead, body] of [
  ['/dashboard/', 'Overview', 'This month\'s credits, the last 30 days of use, and the lines to connect an agent.', overviewBody],
  ['/dashboard/activity/', 'Activity', 'Every call made with your keys in the last 30 days: what was asked for, what came back, and what it cost.', activityBody],
  ['/dashboard/usage/', 'Usage', 'What the hosted API and MCP read for this account, day by day, and what it cost.', usageBody],
  ['/dashboard/scrape/', 'Scrape', 'Read one page as Markdown, with its Evidence Record, on this account\'s credits at the API\'s price.', playgroundBody('scrape')],
  ['/dashboard/map/', 'Map', 'List the URLs of a site from its sitemap and links, on this account\'s credits at the API\'s price.', playgroundBody('map')],
  ['/dashboard/keys/', 'API keys', 'Keys for agents and code. Each one spends this account\'s credits.', keysBody],
  ['/dashboard/connect/', 'Connect', 'One line for each MCP client, the REST call, and the free local server.', connectBody],
  ['/dashboard/account/', 'Account', 'Who is signed in, how, and this month\'s credits.', accountBody],
]) {
  await mkdir(join(root, 'dist', path.slice(1)), { recursive: true })
  await writeFile(join(root, 'dist', path.slice(1), 'index.html'), versionPublicAssets(dashboardPageHtml(path, title, lead, body), join(root, 'public')))
}

// Crawlers may read every page; the API is not for them. The sitemap lists the home page, each docs page, the blog and
// its articles, and the changelog.
await writeFile(join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
// The changelog changes with almost every merge, so it carries no lastmod rather than a day that is soon wrong.
const locations = [['/', HOME_UPDATED], ...pages.map(page => [pathFor(page), page.updated]), [BLOG_PATH, BLOG_UPDATED], ...posts.map(post => [blogPath(post), post.updatedDate ?? post.pubDate]), [CHANGELOG_PATH, null]]
await writeFile(join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(([path, updated]) => `  <url><loc>${ORIGIN}${path}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`)
console.log(`Built ${pages.length} Octocrawl documentation pages in ${output} and ${posts.length} blog articles, with Markdown copies, the changelog, llms.txt, 404.html, robots.txt, sitemap.xml and redirects.json`)
