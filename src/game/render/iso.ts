import type { Vec2 } from "../types.ts";
import { TILE } from "../constants.ts";

// Isometric projection. The game simulation stays on a square world-pixel grid;
// only rendering and picking project to/from the 2:1 isometric screen plane.
// One world tile (TILE px) maps to a diamond ISO_TILE_W × ISO_TILE_H on screen.

export const ISO_TILE_W = 256;
export const ISO_TILE_H = 128;
export const ISO_HALF_W = ISO_TILE_W / 2; // 128
export const ISO_HALF_H = ISO_TILE_H / 2; // 64

// Scale factors from world pixels to iso-plane pixels.
export const SX = ISO_TILE_W / (2 * TILE); // 4
export const SY = ISO_TILE_H / (2 * TILE); // 2

/** Project a world-pixel point onto the iso plane (pre-camera). */
export function project(wx: number, wy: number): Vec2 {
  return { x: (wx - wy) * SX, y: (wx + wy) * SY };
}

/** Inverse of {@link project}: iso-plane point back to world pixels. */
export function unproject(ix: number, iy: number): Vec2 {
  const a = ix / SX; // wx - wy
  const b = iy / SY; // wx + wy
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
