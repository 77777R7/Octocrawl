# Extract a public page

Use the W2L page when you want readable content, links, or a few fields from one public HTTP(S) URL without setting up a task. The browser submits the URL and, only when you change them, the two options below; capture settings and service secrets remain on the server.

## Input

Open [Try W2L](/), paste `https://docs.firecrawl.dev/introduction`, and press **Extract page**. This public documentation URL is the first-use example. When this site is served over public HTTPS, the page and extraction API use the same address; no local installation is needed for this single-page preview.

## Expected output

Each extraction appears as a card under **Recent runs** with its status and total client-visible time; select a card to see its title, final URL, and the chosen output. Runs are kept only for the current visit and are never saved.

## Choose a format

**Format**, at the left under the URL, chooses what the result panel shows. Every format comes from the same extraction, so switching (here or with **View** in the result panel) never spends another preview.

| Format | Shows | Download |
| --- | --- | --- |
| Markdown | The page's readable content. | `.md` |
| Links | The page's links, deduplicated, up to 500, with the total found. | `.links.txt` |
| Page info | Title, description, language, canonical URL, robots, keywords and icon; for a file, its type, size, pages and warnings. | `.info.json` |
| Fields | The fields set in **Options**: each value, or why it is empty, and where on the page it was read. | `.fields.json` |
| JSON | The whole result as the server sent it, including the requested URL. | `.json` |

Links and page metadata come with ordinary pages that were read, and fields with those pages and with files. Amazon.sg products, X and Reddit posts return their checked record instead, and a blocked or failed result has only its reason and JSON.

## Options

**Options** holds two settings. The button shows the number of fields, or a dot when only **Read** is changed.

- **Read**: **Main content** (the default) leaves out headers, menus and footers. **Whole page** keeps them; a page with no clear main content then returns everything instead of failing.
- **Fields**: up to 20 fields, each a name and a type (text, number, yes / no, or a list of text). Type a name on the add line and press Enter to add it, and set its type beside it. **+ product fields** fills in name, brand, price, currency, availability, SKU, rating and review count. Names use letters, digits, spaces, dots, dashes and underscores.

The **Fields** view lists each field in the order you set them, marked ✓ when the page states it, · when it does not, and : when the page states more than one value. Under each value it shows where on the page it was read, as the downloaded `.fields.json` records it.

Fields are read from the page itself: JSON-LD, microdata, meta tags, table rows, definition lists, and a PDF's `Label: value` lines. No AI model is used. A field the page does not state comes back empty with its reason, never guessed. Amazon.sg product pages take no options; they always return their checked product record.

## Run it on your computer

**Get code** shows the same extraction for the local API (a cURL command for `POST /v1/scrape`) and for the local MCP service (the `scrape` tool call, or `scrape_product` for an Amazon.sg product), with the URL, format and options you chose. Both need a checkout of the W2L repository and have no daily limit. A local run can also use a local browser, so its result may differ from this preview. See the [API reference](/docs/reference/) and [Connect MCP](/docs/connect-mcp/).

For the exact recorded success sample and its observation time, see [Introduction](/docs/). The result may differ when the source page changes.

## If extraction does not complete

- **Blocked:** the site denied automated access, required login, or returned a verification page. Try another permitted public page; W2L does not solve a challenge.
- **Timed out:** the source or local outbound path did not finish within the preview deadline. Check the final URL and reason. A timeout alone does not prove that the site's parser is wrong.
- **Incomplete:** content or identity could not be fully verified. Read what is available and its missing reason; do not treat it as a complete record.
- **Daily limit reached:** stop until the applicable quota resets. The local review server's counters reset on restart; the hosted preview uses durable counters.

See [limits and result states](/docs/limits/) before relying on an extracted field in another system.
