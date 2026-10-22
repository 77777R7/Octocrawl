# Terms of use

These terms cover the public Octocrawl page at this address and its preview service (“the preview”). They do not cover the Octocrawl software: its code is licensed under the [GNU AGPL-3.0](https://github.com/77777R7/Octocrawl/blob/main/LICENSE), and nothing here limits your rights under that licence. When you run Octocrawl on your own computer, these terms do not apply.

Last updated 23 October 2026.

## Who runs the preview

The preview is run by Howard Lun, an individual in British Columbia, Canada. You can reach him at [hello@octocrawl.dev](mailto:hello@octocrawl.dev).

## What the preview is

- A limited, free public trial. There is no payment, and an account is optional (below).
- Each visitor gets five previews per UTC day, and the whole site 150. These limits may change.
- The preview may be changed, slowed down, paused or stopped at any time, without notice.
- It reads one public `http://` or `https://` address per request. It refuses private and reserved network addresses, pages whose robots.txt does not allow it or cannot be reached, and pages that ask for a login or show a verification challenge. Size and time limits are listed in [Limits and result states](/docs/limits/).

## The hosted API and MCP

- `api.octocrawl.dev` and `mcp.octocrawl.dev` are a free, limited service: a daily allowance without a key, and with a key its account's monthly credits or the allowance the key was issued with. There is no payment yet. An account makes its own keys in its dashboard, and keys can be revoked.
- It serves scrape and map, and to an account crawl jobs of up to 500 pages and batch jobs of up to 1,000 URLs. It obeys robots.txt for every page, refuses private addresses, and does not offer proxies, CAPTCHA solving or stealth. It may be changed, slowed down, paused or stopped at any time, without notice.
- The same responsibilities below apply to what you fetch through it.

## Accounts and credits

- Signing in gives an account free credits each month (1,000 today), spent by its API keys on the hosted API and MCP. What a call costs is on [Limits](/docs/limits/#hosted-api-and-mcp).
- Credits have no cash value and cannot be transferred. A month's free credits do not roll over. The amount and the costs may change, and this site says what applies.
- One person, one account. Making accounts to collect more free credits, or sharing a key to get around a limit, may get the accounts suspended and their keys revoked.
- Keep your keys secret. A key's calls spend its account's credits, whoever makes them.
- We may suspend an account or revoke a key that breaks these terms or the [acceptable use policy](/docs/acceptable-use/). You can delete your account at any time, in your dashboard's Settings or by email. Deleting it ends its keys and its credits, bought ones included.

## Results

- Results are provided as they are. A preview can come back blocked, incomplete or timed out, and a successful one does not guarantee that every field is correct. Amazon.sg product records are in Beta.
- Check a result's status, final address and any field issues before you rely on it.
- A call's result is kept for ten minutes. The pages a crawl or batch job reads are kept for 7 days after the job ends, so that you can read and export them, and are then deleted. What the service records is described in [Privacy](/docs/privacy/).
- If you give a job a webhook, the service sends the job's end to the address you gave. You are responsible for that address.

## Your responsibilities

- You are responsible for the addresses you submit and for what you do with the results.
- The content of a page belongs to its owners. Your use of it must respect the site's own terms, copyright, and the law that applies to you.
- Follow the [Acceptable use policy](/docs/acceptable-use/).

## No warranty

The preview is free and provided “as is”, without warranties of any kind, to the extent the law allows. To the extent the law allows, the operator is not liable for any loss that comes from using the preview or relying on its results.

## Changes

When these terms change, the date above changes with them. Using the preview after a change means you accept the new terms.

## Governing law

These terms are governed by the laws of the Province of British Columbia and the federal laws of Canada that apply there, and disputes about them are heard in the courts of British Columbia.

If you use the preview as a consumer, nothing in these terms takes away the protection that the mandatory consumer laws of the place where you live give you, or a right those laws give you to bring a claim in your local courts.

## Contact

See [Contact](/docs/contact/).
