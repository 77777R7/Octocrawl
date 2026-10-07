/**
 * The hosts the browser-compatible transport is used for by default: the list in
 * research/access/benefit-hosts.v1.json, decided by the G1 acceptance run it names. Kept here as a constant so every
 * build (the published bundles, the Docker images, which carry no research/ files) has it; a test holds the two equal.
 */
export const COMPAT_BENEFIT_HOSTS: readonly string[] = ['fred.stlouisfed.org', 'www.idealo.de', 'www.investing.com', 'www.ironmountain.com', 'www.wayfair.com']
