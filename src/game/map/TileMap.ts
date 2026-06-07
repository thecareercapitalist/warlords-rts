import type { TerrainType, Vec2 } from "../types.ts";
import { MAP_W, MAP_H, FOREST_TILE_WOOD, GOLDMINE_AMOUNT } from "../constants.ts";
import { Rng } from "../util/math.ts";

export interface Tile {
  terrain: TerrainType;
  /** Remaining wood for forest tiles; gold for goldmine tiles. */
  resource: number;
  /** True when a building footprint occupies this tile. */
  occupied: boolean;
}

export class TileMap {
  readonly w = MAP_W;
  readonly h = MAP_H;
  readonly tiles: Tile[];
  /** Goldmine locations (top-left of the 2x2 cluster center tile). */
  readonly goldmines: Vec2[] = [];

  constructor(seed = 1337) {
    this.tiles = new Array(this.w * this.h);
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = { terrain: "grass", resource: 0, occupied: false };
    }
    this.generate(new Rng(seed));
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): Tile | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.tiles[this.idx(x, y)];
  }

  set(x: number, y: number, terrain: TerrainType, resource = 0): void {
    const t = this.tiles[this.idx(x, y)];
    t.terrain = terrain;
    t.resource = resource;
  }

  /** Can a ground unit stand on / path through this tile? Only open grass. */
  isWalkable(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t) return false;
    return t.terrain === "grass" && !t.occupied;
  }

  /** Terrain blocks movement (water, forest, goldmine, rock all impassable). */
  isBlockingTerrain(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t) return true;
    return t.terrain !== "grass";
  }

  private generate(rng: Rng): void {
    // 1. Lakes — several blobs of water, a couple of them large.
    const lakeCount = rng.int(4, 7);
    for (let i = 0; i < lakeCount; i++) {
      const cx = rng.int(6, this.w - 6);
      const cy = rng.int(6, this.h - 6);
      const r = rng.int(3, 7);
      this.blob(cx, cy, r, rng, (x, y) => this.set(x, y, "water"));
    }

    // 2. Mountains — a few clustered rock ranges (impassable), edges of the map.
    const rockCount = rng.int(6, 10);
    for (let i = 0; i < rockCount; i++) {
      const cx = rng.int(2, this.w - 2);
      const cy = rng.int(2, this.h - 2);
      this.blob(cx, cy, rng.int(1, 4), rng, (x, y) => {
        if (this.at(x, y)?.terrain === "grass") this.set(x, y, "rock");
      });
    }

    // 3. Forests — this is a forest map: many large blobs of harvestable trees.
    const forestCount = rng.int(20, 30);
    for (let i = 0; i < forestCount; i++) {
      const cx = rng.int(3, this.w - 3);
      const cy = rng.int(3, this.h - 3);
      this.blob(cx, cy, rng.int(2, 6), rng, (x, y) => {
        if (this.at(x, y)?.terrain === "grass") this.set(x, y, "forest", FOREST_TILE_WOOD);
      });
    }

    // 4. Goldmines — one near each of the two start corners plus a couple neutral.
    const mineSpots: Vec2[] = [
      { x: 8, y: 8 },
      { x: this.w - 9, y: this.h - 9 },
      { x: this.w - 10, y: 10 },
      { x: 10, y: this.h - 10 },
    ];
    for (const spot of mineSpots) {
      // Clear a small grass apron and place the mine.
      this.blob(spot.x, spot.y, 2, rng, (x, y) => {
        if (this.at(x, y)?.terrain !== "water") this.set(x, y, "grass");
      });
      this.set(spot.x, spot.y, "goldmine", GOLDMINE_AMOUNT);
      this.goldmines.push({ x: spot.x, y: spot.y });
    }

    // 4b. Guarantee a forest near each start so neither side is wood-starved.
    const startForests: Vec2[] = [
      { x: 14, y: 7 },
      { x: this.w - 15, y: this.h - 8 },
    ];
    for (const f of startForests) {
      this.blob(f.x, f.y, 2, rng, (x, y) => {
        const ter = this.at(x, y)?.terrain;
        if (ter && ter !== "water" && ter !== "goldmine") this.set(x, y, "forest", FOREST_TILE_WOOD);
      });
    }

    // 5. Guarantee clear build space at the two player start corners.
    this.clearArea(4, 4, 8, 8);
    this.clearArea(this.w - 12, this.h - 12, 8, 8);
  }

  private clearArea(x0: number, y0: number, w: number, h: number): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (this.inBounds(x, y) && this.at(x, y)!.terrain !== "goldmine") {
          this.set(x, y, "grass");
        }
      }
    }
  }

  private blob(
    cx: number,
    cy: number,
    r: number,
    rng: Rng,
    apply: (x: number, y: number) => void,
  ): void {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r - rng.next() * 0.9) apply(x, y);
      }
    }
  }
}
