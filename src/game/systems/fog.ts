import type { World } from "../World.ts";
import { MAP_W, MAP_H } from "../constants.ts";

// Visibility levels per tile, from the human player's perspective.
export const FOG_HIDDEN = 0; // never seen
export const FOG_EXPLORED = 1; // seen before, not currently visible
export const FOG_VISIBLE = 2; // currently in vision

export class Fog {
  readonly w = MAP_W;
  readonly h = MAP_H;
  /** Current frame visibility. */
  vis: Uint8Array;
  /** Whether a tile has ever been explored. */
  private explored: Uint8Array;
  private playerId: number;

  constructor(playerId: number) {
    this.playerId = playerId;
    this.vis = new Uint8Array(this.w * this.h);
    this.explored = new Uint8Array(this.w * this.h);
  }

  level(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return FOG_HIDDEN;
    return this.vis[y * this.w + x];
  }

  isExplored(x: number, y: number): boolean {
    return this.explored[y * this.w + x] === 1;
  }

  /** Recompute visibility from all friendly units and buildings. */
  update(world: World): void {
    // Demote everything currently-visible to explored.
    for (let i = 0; i < this.vis.length; i++) {
      this.vis[i] = this.explored[i] ? FOG_EXPLORED : FOG_HIDDEN;
    }

    const reveal = (cx: number, cy: number, r: number) => {
      const r2 = r * r;
      for (let y = cy - r; y <= cy + r; y++) {
        if (y < 0 || y >= this.h) continue;
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || x >= this.w) continue;
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r2) {
            const i = y * this.w + x;
            this.vis[i] = FOG_VISIBLE;
            this.explored[i] = 1;
          }
        }
      }
    };

    for (const u of world.units) {
      if (u.dead || u.playerId !== this.playerId) continue;
      const t = u.tile();
      reveal(t.x, t.y, u.def.visionRadius);
    }
    for (const b of world.buildings) {
      if (b.dead || b.playerId !== this.playerId) continue;
      const cx = b.tile.x + Math.floor(b.footprint / 2);
      const cy = b.tile.y + Math.floor(b.footprint / 2);
      reveal(cx, cy, b.def.visionRadius);
    }
  }

  /** Is an entity at world tile currently visible to this player? */
  visibleTile(x: number, y: number): boolean {
    return this.level(x, y) === FOG_VISIBLE;
  }
}
