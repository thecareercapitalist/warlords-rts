// Dev-only test harness. Imported solely under import.meta.env.DEV so it never
// ships in production. Exposes engine internals on window.__debug so the game's
// systems can be exercised headlessly (the preview tab is hidden, which pauses
// requestAnimationFrame, so we drive Game.frame() manually and poke state here).

import type { Game } from "./game/Game.ts";
import type { World } from "./game/World.ts";
import type { BuildingKind, UnitKind, Vec2 } from "./game/types.ts";
import { Building } from "./game/entities/Building.ts";
import { Unit } from "./game/entities/Unit.ts";
import { tileCenter } from "./game/util/math.ts";
import { placeBuilding, cancelBuilding } from "./game/systems/placement.ts";
import { enqueueUnit } from "./game/systems/production.ts";
import { orderBuild, orderGather } from "./game/systems/orders.ts";

export function attachDebug(game: Game, getWorld: () => World): void {
  const api = {
    game,
    get world() {
      return getWorld();
    },
    spawnBuilding(playerId: number, kind: BuildingKind, tx: number, ty: number): Building {
      const w = getWorld();
      const b = w.addBuilding(new Building(kind, playerId, { x: tx, y: ty }, true));
      w.recomputeSupply();
      return b;
    },
    spawnUnit(playerId: number, kind: UnitKind, tx: number, ty: number): Unit {
      const w = getWorld();
      const u = w.addUnit(new Unit(kind, playerId, tileCenter(tx, ty)));
      w.recomputeSupply();
      return u;
    },
    placeBuilding,
    cancelBuilding,
    enqueueUnit,
    orderBuild,
    orderGather,
    findTerrain(terrain: string, maxR = 30, near: Vec2 = { x: 5, y: 5 }): Vec2 | null {
      const w = getWorld();
      for (let r = 0; r <= maxR; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = near.x + dx;
            const y = near.y + dy;
            const t = w.map.at(x, y);
            if (t && t.terrain === terrain) return { x, y };
          }
        }
      }
      return null;
    },
  };
  (window as unknown as { __debug: typeof api }).__debug = api;
}
