/**
 * Ad-serving hosts the local browser lane does not load when `blockAds` is
 * true (the default): the request is aborted in the browser before any
 * connection, and the trace says so (`ads_blocked`).
 *
 * Scope, stated plainly: about fifty reviewed ad-serving domains, matched by
 * hostname equality or as a dot-suffix (`ad.doubleclick.net` matches
 * `doubleclick.net`). It is not EasyList and is not downloaded or updated at
 * run time; it holds no tracker-only or analytics hosts, since those change
 * no content. Ads served from a host outside the list are loaded: false
 * negatives are expected, and the extraction-side pruning of ad containers
 * (ExtractorOptions.blockAds) is what removes them from the Markdown.
 */
export const AD_HOSTS: readonly string[] = [
  // Google
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'adsense.com',
  'admob.com',
  'adservice.google.com',
  // Exchanges and SSPs
  'adnxs.com',
  'adsrvr.org',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'openx.com',
  'casalemedia.com',
  'indexww.com',
  '3lift.com',
  'triplelift.com',
  'smartadserver.com',
  'sharethrough.com',
  'yieldmo.com',
  'sovrn.com',
  'lijit.com',
  'gumgum.com',
  'bidswitch.net',
  'improvedigital.com',
  '360yield.com',
  'adform.net',
  'spotxchange.com',
  'spotx.tv',
  'undertone.com',
  'conversantmedia.com',
  'rhythmone.com',
  'onetag-sys.com',
  'criteo.com',
  'criteo.net',
  // Native and content recommendation ads
  'taboola.com',
  'outbrain.com',
  'revcontent.com',
  'mgid.com',
  'zergnet.com',
  // Retail and video ads
  'amazon-adsystem.com',
  'teads.tv',
  'media.net',
  'adtelligent.com',
  'innovid.com',
  'tremorhub.com',
  // Ad verification and measurement that only ad slots load
  'moatads.com',
  'adsafeprotected.com',
  'doubleverify.com',
  'serving-sys.com',
  'sizmek.com',
  'flashtalking.com',
  'adroll.com',
]

/** Whether `hostname` is on the list: equal to an entry, or a subdomain of one. */
export function isAdHost(hostname: string, hosts: readonly string[] = AD_HOSTS): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '')
  return hosts.some((host) => name === host || name.endsWith(`.${host}`))
}
