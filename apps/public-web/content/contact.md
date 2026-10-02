# Contact

Octocrawl and this site are run by Howard Lun. There are two ways to get in touch: GitHub issues, which are public, and email, which is private.

## Questions, bugs and ideas

Open an issue on [GitHub](https://github.com/77777R7/w2l/issues). For a question, add the `question` label. Issues are public: never post passwords, keys or personal data in one.

## Privacy

For a question or request about your data, email [hello@octocrawl.dev](mailto:hello@octocrawl.dev). What the site records is described in [Privacy](/docs/privacy/).

## Security

To report a security problem, email [hello@octocrawl.dev](mailto:hello@octocrawl.dev) with "Security" in the subject. Please do not open a public issue about it until it is fixed.

## Site owners

The preview names itself in its user agent: each request it makes carries the token `OctoCrawl-Preview/1.0 (+https://octocrawl.dev)` after a standard browser string.

It reads your robots.txt before it fetches a page and obeys the rules for `octocrawl-preview`, or for `User-agent: *` when no group names it. To keep the preview off your site:

```text
User-agent: octocrawl-preview
Disallow: /
```

A group that names the preview replaces the `*` group for it; the details are in [How the preview identifies itself](/docs/limits/#how-the-preview-identifies-itself). If robots.txt cannot be reached (a server error, no answer or a timeout), the page is not fetched; a robots.txt that answers with a 4xx status counts as no rules, as RFC 9309 provides. The preview never signs in, solves a CAPTCHA or gets past a verification page.

To report a problem with how the preview treated your site, email [hello@octocrawl.dev](mailto:hello@octocrawl.dev) or open an issue on GitHub.

## Misuse

To report misuse of the preview, see the [Acceptable use policy](/docs/acceptable-use/) and email [hello@octocrawl.dev](mailto:hello@octocrawl.dev).
