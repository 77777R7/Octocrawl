import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { versionPublicAssets } from './publicAssetVersions.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist', 'docs')
const assetRoot = join(root, 'public', 'docs-assets')
const assetVersions = Object.fromEntries(await Promise.all(['docs.css', 'docs-mobile.css', 'docs.js'].map(async name => [
  name,
  createHash('sha256').update(await readFile(join(assetRoot, name))).digest('hex').slice(0, 12),
])))
const pages = [
  { slug: '', file: 'introduction.md', title: 'Introduction', description: 'Try Octocrawl with one public URL and learn what a verified result looks like.', group: 'Get started' },
  { slug: 'connect-mcp', file: 'connect-mcp.md', title: 'Connect MCP', description: 'Connect Claude Code, Cursor, OpenCode or Codex to hosted Octocrawl with one URL, no key to start; or run it on your computer with npx.', group: 'Get started' },
  { slug: 'guides/extract-page', file: 'extract-page.md', title: 'Extract a public page', description: 'Get readable Markdown, a final URL, status, and elapsed time from a public web page.', group: 'Guides' },
  { slug: 'guides/amazon-product', file: 'amazon-product.md', title: 'Amazon.sg product JSON', description: 'Check a product ASIN, Singapore delivery region, currency, and missing fields.', group: 'Guides' },
  { slug: 'guides/monitor-webhook', file: 'monitor-webhook.md', title: 'Monitor to HTTPS Webhook', description: 'Create a document Monitor and verify durable delivery by eventId.', group: 'Guides' },
  { slug: 'guides/batch-results', file: 'batch-results.md', title: 'Page through batch results', description: 'Queue a durable URL batch and inspect every result through pagination.', group: 'Guides' },
  { slug: 'limits', file: 'limits.md', title: 'Limits and result states', description: 'Understand preview quotas, supported sites, incomplete fields, blocks, and timeouts.', group: 'Reference' },
  { slug: 'reference', file: 'reference.md', title: 'Advanced reference', description: 'Find REST, SDK, and self-hosted entry points after your first Octocrawl result.', group: 'Reference' },
  { slug: 'privacy', file: 'privacy.md', title: 'Privacy', description: 'What the public Octocrawl page records about a visit and a preview, what it never records, and how long it keeps it.', group: 'Project' },
  { slug: 'terms', file: 'terms.md', title: 'Terms of use', description: 'The terms for the free public Octocrawl preview: what it is, its limits, results as they are, and who runs it.', group: 'Project' },
  { slug: 'acceptable-use', file: 'acceptable-use.md', title: 'Acceptable use', description: 'What the public Octocrawl preview may not be used for, and how to report misuse.', group: 'Project' },
  { slug: 'contact', file: 'contact.md', title: 'Contact', description: 'How to reach the Octocrawl operator about questions, privacy, security, site owners and misuse.', group: 'Project' },
]

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
      source: 'https://cursor.com/docs/context/mcp',
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
      source: 'https://developers.openai.com/codex/extend/mcp',
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
      source: 'https://cursor.com/docs/context/mcp',
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
      source: 'https://developers.openai.com/codex/extend/mcp',
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
function shareHead(path, title, description) {
  return `<link rel="canonical" href="${ORIGIN}${path}" /><meta property="og:type" content="article" /><meta property="og:site_name" content="Octocrawl" /><meta property="og:url" content="${ORIGIN}${path}" /><meta property="og:title" content="${escape(title)}" /><meta property="og:description" content="${escape(description)}" /><meta property="og:image" content="${OG_IMAGE}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="${OG_IMAGE_ALT}" /><meta name="twitter:card" content="summary_large_image" /><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />`
}

function header(inDocs = true) {
  return `<header class="doc-header"><div class="doc-header-inner"><a class="doc-brand" href="/" aria-label="Octocrawl home"><img class="doc-mark" src="/assets/octopus-160.webp" width="34" height="34" alt="" /><img class="doc-wordmark" src="/assets/octocrawl-wordmark.svg" width="122" height="20" alt="" /></a><nav aria-label="Top navigation"><a href="/docs/"${inDocs ? ' aria-current="page"' : ''}>Docs</a><a class="try-link" href="/">Try it <span aria-hidden="true">↗</span></a></nav></div></header>`
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
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="description" content="${escape(page.description)}" />${shareHead(pathFor(page), `${page.title} | Octocrawl Docs`, page.description)}<link rel="alternate" type="text/markdown" href="${pathFor(page)}index.md" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" />${articleData(page)}<title>${escape(page.title)} | Octocrawl Docs</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header()}
<div class="doc-layout${toc.length >= 2 ? ' has-toc' : ''}"><aside class="doc-sidebar"><nav aria-label="Documentation pages">${nav(page)}</nav></aside><details class="doc-mobile-pages"><summary>Browse docs: ${escape(page.title)}</summary><nav aria-label="Documentation pages on mobile">${nav(page)}</nav></details><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / ${escape(page.group)}</p><article class="doc-article">${content}</article>${adjacent}<footer class="doc-footer"><span>Try a page in the browser here, connect your agent to mcp.octocrawl.dev, or run Octocrawl on your computer with npx.</span><a href="/">Try a page ↗</a></footer></main>${tocHtml(toc)}</div><div id="copy-announcement" class="sr-only" role="status" aria-live="polite"></div><script defer src="/docs-assets/docs.js?v=${assetVersions['docs.js']}"></script></body></html>`
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

// llms.txt (https://llmstxt.org): what Octocrawl is, and a link to the Markdown copy of every page. llms-full.txt carries
// all of them in one file.
const summary = 'Octocrawl turns a public web page into readable Markdown and, on supported pages, fields you can check against the source. It reports blocks, timeouts and missing fields with a reason instead of inventing content. It is open source (AGPL-3.0). Hosted Octocrawl serves scrape and map at https://api.octocrawl.dev and https://mcp.octocrawl.dev/mcp, keyless within a daily allowance; the published packages (npx octocrawl) run everything on your own computer through REST, a TypeScript SDK, a Python client or MCP.'
const groups = [...new Set(pages.map(page => page.group))]
const llms = [
  '# Octocrawl', '', `> ${summary}`, '',
  `Try one public page in the browser at ${ORIGIN}/ (five previews a day). The source code is at https://github.com/77777R7/Octocrawl.`, '',
  ...groups.flatMap(group => [`## ${group}`, '', ...pages.filter(page => page.group === group).map(page => `- [${page.title}](${ORIGIN}${pathFor(page)}index.md): ${page.description}`), '']),
  '## Optional', '', `- [All documentation in one file](${ORIGIN}/llms-full.txt)`, '',
].join('\n')
await writeFile(join(root, 'dist', 'llms.txt'), llms)
await writeFile(join(root, 'dist', 'llms-full.txt'), [`# Octocrawl documentation\n\n> ${summary}\n`, ...markdown.map(({ page, text }) => `<!-- ${ORIGIN}${pathFor(page)} -->\n\n${text.trim()}\n`)].join('\n'))

// The page the server answers with, status 404, for any path without a file: in the docs' reading layout, with the
// docs pages beside it and the two ways back. It is never indexed.
const notFound = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="theme-color" content="#071b4f" /><meta name="robots" content="noindex" /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" /><link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png" /><link rel="stylesheet" href="/docs-assets/docs.css?v=${assetVersions['docs.css']}" /><link rel="stylesheet" href="/docs-assets/docs-mobile.css?v=${assetVersions['docs-mobile.css']}" /><title>Page not found | Octocrawl</title></head>
<body><a class="skip-link" href="#main-content">Skip to content</a>${header(false)}
<div class="doc-layout"><aside class="doc-sidebar"><nav aria-label="Documentation pages">${nav({ slug: null })}</nav></aside><details class="doc-mobile-pages"><summary>Browse docs</summary><nav aria-label="Documentation pages on mobile">${nav({ slug: null })}</nav></details><main id="main-content" class="doc-main"><p class="doc-eyebrow"><span class="kicker-square" aria-hidden="true"></span>Octocrawl / 404</p><article class="doc-article"><h1>Page not found</h1><p>There is no page at this address. It may have moved, or the link may be mistyped.</p><ul><li><a href="/">Try Octocrawl with a public URL</a></li><li><a href="/docs/">Read the documentation</a></li></ul></article></main></div></body></html>`
await writeFile(join(root, 'dist', '404.html'), versionPublicAssets(notFound, join(root, 'public')))

// Crawlers may read every page; the API is not for them. The sitemap lists the home page and each docs page.
await writeFile(join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`)
const locations = ['/', ...pages.map(pathFor)]
await writeFile(join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations.map(path => `  <url><loc>${ORIGIN}${path}</loc></url>`).join('\n')}\n</urlset>\n`)
console.log(`Built ${pages.length} Octocrawl documentation pages in ${output}, with Markdown copies, llms.txt, 404.html, robots.txt and sitemap.xml`)
