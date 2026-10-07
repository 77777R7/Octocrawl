import { readFileSync } from 'node:fs'

/**
 * The hosts the browser-compatible transport is used for by default (research/access/benefit-hosts.v1.json, decided by
 * the G1 acceptance run it names): read from the repository at run time; a published bundle carries the list inline.
 */
export const COMPAT_BENEFIT_HOSTS: readonly string[] = (JSON.parse(readFileSync(new URL('../../../research/access/benefit-hosts.v1.json', import.meta.url), 'utf8')) as { hosts: string[] }).hosts
