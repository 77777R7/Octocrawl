/**
 * The engine's routing history on disk (PA G2b): `<taskRoot>/routing-history.sqlite`, so what the vendors did survives a
 * restart. Statistics only — the host, the path or task family, counts, times, codes and version strings; never a URL,
 * a cookie or a credential.
 *
 * A route is (host, path or task family, the formats asked for, the run's egress class and region, the vendor's browser
 * version, the extractor and verifier versions, the routing policy version), within one scope of rungs (the mode, and
 * whether access enhanced added the provider ones), the same scope the engine keeps one set of channels for.
 *
 * A route's statistics are read when enough attempts back them: a vendor with fewer than `minSamples` live attempts on
 * the route is read from its attempts on the host within the same scope and egress class instead, and with fewer there
 * too it has no history, so the declared ladder decides for it. A row expires, with its reason written beside it, when
 * it outlives its TTL (`ttl`), when the vendor's browser major version (`browser_version`), the vendor's egress
 * configuration or the run's own exit (`egress_config`) changes, when the site's template changes (`site_template`,
 * once something identifies templates: nothing sets `RouteContext.siteTemplate` yet), or when the extractor, verifier
 * (`extractor_version`) or policy (`policy_version`) moves on. A vendor's browser version is known only from its
 * attempts, so its rows expire on its next attempt under the new version, not before.
 */

import Database from 'better-sqlite3'
import { createHmac, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  applyOutcome,
  freshEntry,
  mergeEntries,
  normalizeEntry,
  type DomainHistory,
  type RouteContext,
  type RoutingHistory,
  type VendorHistoryEntry,
  type VendorOutcome,
} from './vendorRouter.js'

export const ROUTING_HISTORY_FILENAME = 'routing-history.sqlite'
/** Bumped when what a route's statistics mean changes (G3's ranking): older rows then expire as `policy_version`. */
export const ROUTE_POLICY_VERSION = 'route/1'
export const ROUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const ROUTE_MIN_SAMPLES = 3

export type RouteExpiryReason = 'ttl' | 'browser_version' | 'egress_config' | 'site_template' | 'extractor_version' | 'policy_version'

/** Which statistics a read used: the route's own, the host's on the same egress class, or none (the declared ladder). */
export type RouteReadBasis = 'route' | 'host_egress' | 'fixed'

/** The rungs and the egress one history instance records for; the engine keeps one per set of channels. */
export interface RouteScope {
  /** The mode, with `|enhanced` when access enhanced added the provider rungs. */
  lanes: string
  /** `pool`, `environment` or `direct`: how the run's requests leave, never the proxy's address. */
  egressClass: string
  /** Where the egress leaves from; null when not known. */
  region: string | null
  /**
   * The exit itself, as `RoutingHistoryDatabase.exitId` names it (never its address); null when direct. Each exit keeps
   * rows of its own. Outside a pool there is one exit at a time, and a change of it expires the old one's rows.
   */
  egressConfig?: string | null
}

export interface SqliteRoutingHistoryOptions {
  now?: () => number
  ttlMs?: number
  minSamples?: number
  policyVersion?: string
}

interface RouteRow {
  id: number
  family: string
  formats: string
  versions: string
  policy: string
  vendor: string
  browser: string | null
  egress_config: string | null
  exit_config: string | null
  lanes: string
  region: string
  site_template: string | null
  entry_json: string
  created_at: number
  updated_at: number
}

const DEFAULT_ROUTE: RouteContext = { family: '*', formats: '*', versions: '*' }

/**
 * One database per task root, opened once; each scope is a view on it (`scoped`). The engine closes it when it closes.
 */
export class RoutingHistoryDatabase {
  readonly db: Database.Database

  static open(taskRoot: string): RoutingHistoryDatabase {
    return new RoutingHistoryDatabase(join(taskRoot, ROUTING_HISTORY_FILENAME))
  }

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        lanes TEXT NOT NULL, egress_class TEXT NOT NULL, region TEXT NOT NULL,
        host TEXT NOT NULL, family TEXT NOT NULL, formats TEXT NOT NULL, versions TEXT NOT NULL, policy TEXT NOT NULL,
        vendor TEXT NOT NULL, browser TEXT, egress_config TEXT, exit_config TEXT, site_template TEXT,
        entry_json TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        expired_at INTEGER, expired_reason TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS routes_live ON routes (lanes, egress_class, region, ifnull(exit_config, ''), host, family, formats, versions, policy, vendor, ifnull(browser, '')) WHERE expired_at IS NULL;
      CREATE INDEX IF NOT EXISTS routes_host ON routes (host, egress_class) WHERE expired_at IS NULL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS route_expiries (
        id INTEGER PRIMARY KEY, route_id INTEGER NOT NULL, at INTEGER NOT NULL, reason TEXT NOT NULL, detail_json TEXT NOT NULL
      );
    `)
    chmodSync(path, 0o600)
    this.db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run('exit_salt', randomBytes(32).toString('hex'))
    this.salt = (this.db.prepare('SELECT value FROM meta WHERE key = ?').get('exit_salt') as { value: string }).value
  }

  private readonly salt: string

  /** A short id for an exit (a proxy's endpoint), keyed by this file's own random salt: the address cannot be read back from it. */
  exitId(endpoint: string): string {
    return createHmac('sha256', this.salt).update(endpoint).digest('hex').slice(0, 12)
  }

  scoped(scope: RouteScope, options: SqliteRoutingHistoryOptions = {}): SqliteRoutingHistory {
    return new SqliteRoutingHistory(this, scope, options)
  }

  close(): void {
    if (this.db.open) this.db.close()
  }
}

export class SqliteRoutingHistory implements RoutingHistory {
  private readonly now: () => number
  private readonly ttlMs: number
  private readonly minSamples: number
  private readonly policy: string
  /** The basis of the last read: the route's if any vendor was read from it, else the host's if any, else fixed. */
  lastBasis: RouteReadBasis = 'fixed'
  /** Each vendor's basis in the last read. */
  lastBases: Record<string, RouteReadBasis> = {}

  constructor(private readonly store: RoutingHistoryDatabase, private readonly scope: RouteScope, options: SqliteRoutingHistoryOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.ttlMs = options.ttlMs ?? ROUTE_TTL_MS
    this.minSamples = Math.max(1, options.minSamples ?? ROUTE_MIN_SAMPLES)
    this.policy = options.policyVersion ?? ROUTE_POLICY_VERSION
  }

  private get db(): Database.Database {
    return this.store.db
  }

  private expire(row: Pick<RouteRow, 'id'>, reason: RouteExpiryReason, detail: Record<string, unknown>, at: number): void {
    this.db.prepare('UPDATE routes SET expired_at = ?, expired_reason = ? WHERE id = ? AND expired_at IS NULL').run(at, reason, row.id)
    this.db.prepare('INSERT INTO route_expiries (route_id, at, reason, detail_json) VALUES (?, ?, ?, ?)').run(row.id, at, reason, JSON.stringify(detail))
  }

  /**
   * Every live row of this host within this scope (rungs, egress class, region), after expiring those past their TTL,
   * those of another extractor, verifier or policy version, and those of another exit.
   */
  private liveRows(host: string, route: RouteContext, at: number): RouteRow[] {
    const rows = this.db.prepare('SELECT * FROM routes WHERE host = ? AND lanes = ? AND egress_class = ? AND region = ? AND expired_at IS NULL ORDER BY updated_at')
      .all(host, this.scope.lanes, this.scope.egressClass, this.scope.region ?? '') as RouteRow[]
    const exit = this.scope.egressConfig ?? null
    const live: RouteRow[] = []
    for (const row of rows) {
      // Past its TTL first, any exit's: a pool exit no longer configured does not keep its rows for good.
      if (row.created_at + this.ttlMs <= at) this.expire(row, 'ttl', { ageMs: at - row.created_at, ttlMs: this.ttlMs }, at)
      else if (row.exit_config !== exit) {
        // A pool's exits are used side by side, each with its own rows; one exit outside a pool replaces the last.
        if (this.scope.egressClass !== 'pool') this.expire(row, 'egress_config', { from: row.exit_config, to: exit, of: 'exit' }, at)
      } else if (route.versions !== '*' && row.versions !== route.versions) this.expire(row, 'extractor_version', { from: row.versions, to: route.versions }, at)
      else if (row.policy !== this.policy) this.expire(row, 'policy_version', { from: row.policy, to: this.policy }, at)
      else live.push(row)
    }
    return live
  }

  async read(domain: string, route: RouteContext = DEFAULT_ROUTE): Promise<DomainHistory> {
    const at = this.now()
    return this.db.transaction((): DomainHistory => {
      const rows = this.liveRows(domain, route, at)
      const onRoute = this.byVendor(rows.filter((row) => row.family === route.family && row.formats === route.formats))
      const onHost = this.byVendor(rows)
      const vendors: Record<string, VendorHistoryEntry> = {}
      const bases: Record<string, RouteReadBasis> = {}
      // Each vendor on its own: the route's attempts when there are enough, else the host's, else none.
      for (const [vendor, entry] of onHost) {
        const own = onRoute.get(vendor)
        if (own !== undefined && own.attempts >= this.minSamples) { vendors[vendor] = own; bases[vendor] = 'route' }
        else if (entry.attempts >= this.minSamples) { vendors[vendor] = entry; bases[vendor] = 'host_egress' }
      }
      const used = Object.values(bases)
      this.lastBases = bases
      this.lastBasis = used.includes('route') ? 'route' : used.includes('host_egress') ? 'host_egress' : 'fixed'
      const last = [...rows].reverse().find((row) => vendors[row.vendor] !== undefined)
      return { vendors, lastVendor: last?.vendor ?? null }
    })()
  }

  /** Each vendor's rows merged into one entry, oldest first. */
  private byVendor(rows: readonly RouteRow[]): Map<string, VendorHistoryEntry> {
    const entries = new Map<string, VendorHistoryEntry[]>()
    for (const row of rows) {
      const entry = normalizeEntry(JSON.parse(row.entry_json) as Partial<VendorHistoryEntry>)
      if (entry !== undefined) entries.set(row.vendor, [...(entries.get(row.vendor) ?? []), entry])
    }
    return new Map([...entries].map(([vendor, list]) => [vendor, mergeEntries(list)]))
  }

  async record(domain: string, vendorId: string, outcome: VendorOutcome, route: RouteContext = DEFAULT_ROUTE): Promise<void> {
    const at = this.now()
    const env = outcome.observation?.environment
    const browser = env?.browserMajor == null ? null : String(env.browserMajor)
    const egressConfig = env?.egressConfigVersion ?? null
    const template = route.siteTemplate ?? null
    const exit = this.scope.egressConfig ?? null
    this.db.transaction(() => {
      for (const row of this.liveRows(domain, route, at)) {
        if (row.vendor === vendorId && browser !== null && row.browser !== null && row.browser !== browser) {
          this.expire(row, 'browser_version', { from: row.browser, to: browser }, at)
        } else if (row.vendor === vendorId && egressConfig !== null && row.egress_config !== null && row.egress_config !== egressConfig) {
          this.expire(row, 'egress_config', { from: row.egress_config, to: egressConfig }, at)
        } else if (row.family === route.family && template !== null && row.site_template !== null && row.site_template !== template) {
          this.expire(row, 'site_template', { from: row.site_template, to: template }, at)
        }
      }
      const existing = this.db.prepare('SELECT * FROM routes WHERE lanes = ? AND egress_class = ? AND region = ? AND ifnull(exit_config, \'\') = ? AND host = ? AND family = ? AND formats = ? AND versions = ? AND policy = ? AND vendor = ? AND ifnull(browser, \'\') = ? AND expired_at IS NULL')
        .get(this.scope.lanes, this.scope.egressClass, this.scope.region ?? '', exit ?? '', domain, route.family, route.formats, route.versions, this.policy, vendorId, browser ?? '') as RouteRow | undefined
      const entry = existing === undefined ? freshEntry() : normalizeEntry(JSON.parse(existing.entry_json) as Partial<VendorHistoryEntry>) ?? freshEntry()
      applyOutcome(entry, outcome)
      if (existing === undefined) {
        this.db.prepare('INSERT INTO routes (lanes, egress_class, region, host, family, formats, versions, policy, vendor, browser, egress_config, exit_config, site_template, entry_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(this.scope.lanes, this.scope.egressClass, this.scope.region ?? '', domain, route.family, route.formats, route.versions, this.policy, vendorId, browser, egressConfig, exit, template, JSON.stringify(entry), at, at)
      } else {
        this.db.prepare('UPDATE routes SET entry_json = ?, updated_at = ?, egress_config = ifnull(?, egress_config), site_template = ifnull(?, site_template) WHERE id = ?')
          .run(JSON.stringify(entry), at, egressConfig, template, existing.id)
      }
    })()
  }

  /** The reasons rows of this host expired, oldest first: codes and the values that changed, for a run's record. */
  expiries(domain: string): { reason: RouteExpiryReason; detail: Record<string, unknown> }[] {
    return (this.db.prepare('SELECT e.reason, e.detail_json FROM route_expiries e JOIN routes r ON r.id = e.route_id WHERE r.host = ? ORDER BY e.id').all(domain) as { reason: RouteExpiryReason; detail_json: string }[])
      .map((row) => ({ reason: row.reason, detail: JSON.parse(row.detail_json) as Record<string, unknown> }))
  }
}
