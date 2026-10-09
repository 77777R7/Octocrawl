/** The Earth artwork's geometry and glyph kinds, shared by the free-tiers window's lights (earthLights.ts) and the
 * worker that finds the artwork's painted glyphs (earthGlyphsWorker.ts). Coordinates are the artwork's natural
 * pixels. */

export const EARTH_ART = '/assets/scene-earth.webp'
export const EARTH_SIZE = { width: 1672, height: 941 }
// The artwork's glyph cell (natural px): its painted marks sit 11 to 12 px apart.
export const EARTH_CELL = 11.5

export const SKY = 0
export const SEA = 1
export const LAND = 2
export const FLARE = 3

// The planet's limb, fitted to the painted arc: points inside it are on the Earth.
export const DISK = { x: 1564, y: 2000, r: 1681 }
// The sunrise on the limb: bright marks within SUN.r of it are its glare (FLARE), never lit; bright marks elsewhere
// are land.
export const SUN = { x: 1290, y: 300, r: 260 }
// Where the lights start: on the land, in eastern North America.
export const ORIGIN = { x: 1160, y: 500 }
// The first lights are cities, spread apart, each with a halo: enough for the 5 and 20 a day tiers.
export const BEACONS = 20

export type EarthAnalysis = {
  /** [x, y, kind] per glyph. */
  glyphs: Float32Array
  /** Indices into glyphs, in the order they light: BEACONS city lights, then the rest of the land, then the sea,
   * each nearest the origin first. */
  lights: Uint16Array
}
