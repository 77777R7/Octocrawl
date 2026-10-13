import type { ToolPage } from './toolPage'
import { UNREAD } from './toolSections'

/** /tools/link-extractor/: every page of a site and where each was found (the preview server's /api/map: the site's
 * robots.txt sitemaps, else /sitemap.xml, and its start page's links), or one page's links (the preview). Linked from
 * the find-all-pages article, so its path stays. mapResults.ts runs the whole-site read. */
export const LINK_EXTRACTOR: ToolPage = {
  slug: 'link-extractor',
  name: 'Link Extractor',
  docTitle: 'Free Link Extractor: Find All Pages on a Website | Octocrawl',
  description: 'Find all pages on a website, free and without sign-up: every URL in its sitemap and on its start page, and where each was found. Or extract every link from one page. Copy or download a CSV.',
  hero: {
    title: 'Free <em>Link Extractor</em>: find all pages on a website',
    description: 'Paste a site and get its pages from its sitemap and its links, and where each was found. Or just one page’s links. Copy them or download a CSV. Free, no sign-up.',
    tool: { crumb: 'Link Extractor', view: 'links', example: 'https://www.djangoproject.com/', map: true },
  },
  afterHero: `
    <section class="map-section" id="map-section" aria-labelledby="map-title" hidden>
      <div class="band">
        <div class="frame map-frame">
          <p class="section-kicker"><span class="kicker-square"></span> THE SITE’S PAGES</p>
          <h2 id="map-title" tabindex="-1">Finding pages…</h2>
          <div class="map-body" id="map-body" aria-live="polite"></div>
        </div>
      </div>
    </section>`,
  steps: { title: 'From a site to its pages.', cards: [
    ['01', 'Paste a site', 'Any public site. Whole site is the default; This page lists one page’s links instead. Five a day, no account.'],
    ['02', 'Octocrawl looks where the site says', 'It reads robots.txt, follows its Sitemap lines (else <code>/sitemap.xml</code>, up to 50 files), and reads the start page’s links. Pages robots.txt disallows are left out and counted.'],
    ['03', 'Filter, copy, download', 'Each URL says where it was found: the sitemap, a link, or the start page. Filter the list, copy it, or download a <code>.txt</code> or a CSV.'],
  ] },
  uses: { title: 'A site’s pages, in one list.', lead: 'What the site itself says it has: its sitemap and the links it shows, with nothing invented.', cards: [
    ['◇', 'SEO and site audits', 'See every page a site lists in its sitemap, and which ones it only links to. See <a href="/blog/find-all-pages-on-a-website/">how to find all pages on a website</a>.'],
    ['▤', 'Crawl and RAG lists', 'Start a list of pages to read, for a RAG pipeline or an archive, then scrape them with the API or the CLI.'],
    ['⇢', 'Migrations and inventories', 'Take a site’s URLs to a spreadsheet before you move it, and check none go missing.'],
  ] },
  unread: { title: 'What it finds, and what it can’t.', lead: 'It lists what the site states: a page in neither the sitemap nor the start page’s links isn’t found, because it doesn’t crawl page after page.', cards: [
    ['⌗', 'No sitemap', 'Then only the start page’s links are listed. The result says the site has no readable sitemap.'],
    ...UNREAD.slice(0, 2),
    ['⟳', 'Links drawn by JavaScript', 'It reads the start page as the server sends it, so links a script adds aren’t found; the result says when the page looks drawn by JavaScript. The sitemap is read either way.'],
  ] },
  code: { title: 'The same map, from your own tools.', format: 'map' },
  faq: [
    ['Is it free? Do I need an account?', 'Yes, and no. You get five runs a day without signing up, whole site or one page (at most 150 a day for the whole site), reset at 00:00 UTC. Signed in, the Playground lists up to 5,000 URLs of a site for 1 credit, from 1,000 free credits a month.'],
    ['How does it find all pages on a website?', 'It reads the site’s robots.txt and the sitemaps it names (or <code>/sitemap.xml</code>), following a sitemap index one level and up to 50 files, and the links on the page you paste. Each URL says where it was found. It doesn’t crawl page after page; for that, run <code>npx octocrawl serve</code> and use crawl. More in <a href="/blog/find-all-pages-on-a-website/">how to find all pages on a website</a>.'],
    ['How many URLs does it list?', 'Up to 500 for a whole site, and up to 500 links for one page. When there are more, the result says how many more it saw. The hosted API’s <code>map</code> and the Playground list up to 5,000.'],
    ['Does it respect robots.txt?', 'Yes. Pages robots.txt disallows are left out, and the result counts them. It reads every sitemap file only if that file’s own robots.txt allows it, and it never signs in or gets past a verification page.'],
    ['Which URLs are left out?', 'The same URL twice, other sites’ URLs (subdomains included), files such as images, and pages robots.txt disallows. Each kind is counted in the result. Tracking parameters and #fragments are dropped.'],
    ['Can I get one page’s links instead?', 'Yes: choose This page above the box. It lists every link on that page, this site’s and the others, up to 500, with a CSV.'],
  ],
}
