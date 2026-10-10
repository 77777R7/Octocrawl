import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { versionPublicAssets } from './publicAssetVersions.mjs'
import { HOME_UPDATED, pages } from './docsPages.mjs'
import { BLOG_AUTHOR, BLOG_CATEGORIES, BLOG_UPDATED, blogPath, categoryPath, posts } from './blogPosts.mjs'
import { siteActionsMarkup, siteNavMarkup } from './siteNav.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist', 'docs')
const assetRoot = join(root, 'public', 'docs-assets')
const assetVersions = Object.fromEntries(await Promise.all(['docs.css', 'docs-mobile.css', 'docs.js', 'blog.css'].map(async name => [
  name,
  createHash('sha256').update(await readFile(join(assetRoot, name))).digest('hex').slice(0, 12),
])))

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
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="description" content="${escape(page.description)}" />${shareHead(pathFor(page), `${page.title} | Octocrawl Docs`, page.description)}<link rel="alternate" type="text/markdown" href="${pathFor(page)}index.md" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><link rel="stylesheet" href="/docs-assets/nav.css" />${articleData(page)}<title>${escape(page.title)} | Octocrawl Docs</title></head>
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
// Each docs guide that became an article answers with a 301 to it (packages/public-preview reads this file).
await writeFile(join(root, 'dist', 'redirects.json'), `${JSON.stringify(Object.fromEntries(posts.flatMap(post => [[post.from, blogPath(post)], [`${post.from}index.md`, `${blogPath(post)}index.md`]])), null, 2)}\n`)

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

// Crawlers may read every page; the API is not for them. The sitemap lists the home page, each docs page, the blog and
// its articles, and the changelog.
await writeFile(join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
// The changelog changes with almost every merge, so it carries no lastmod rather than a day that is soon wrong.
const locations = [['/', HOME_UPDATED], ...pages.map(page => [pathFor(page), page.updated]), [BLOG_PATH, BLOG_UPDATED], ...posts.map(post => [blogPath(post), post.updatedDate ?? post.pubDate]), [CHANGELOG_PATH, null]]
await writeFile(join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(([path, updated]) => `  <url><loc>${ORIGIN}${path}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`)
console.log(`Built ${pages.length} Octocrawl documentation pages in ${output} and ${posts.length} blog articles, with Markdown copies, the changelog, llms.txt, 404.html, robots.txt, sitemap.xml and redirects.json`)
