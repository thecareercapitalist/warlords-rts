import type { World } from "../World.ts";
import type { BuildingKind } from "../types.ts";
import { Building } from "../entities/Building.ts";
import { BUILDING_DEFS } from "../entities/defs.ts";
import type { Unit } from "../entities/Unit.ts";
import { orderBuild } from "./orders.ts";

/** Every footprint tile must be open grass and unoccupied. */
export function canPlace(world: World, kind: BuildingKind, tx: number, ty: number): boolean {
  const fp = BUILDING_DEFS[kind].footprint;
  for (let y = ty; y < ty + fp; y++) {
    for (let x = tx; x < tx + fp; x++) {
      const t = world.map.at(x, y);
      if (!t) return false;
      if (t.terrain !== "grass" || t.occupied) return false;
    }
  }
  return true;
}

/**
 * Place a building site at (tx,ty) for `playerId`. Deducts cost, creates the
 * site, and (optionally) sends `builder` to construct it. Returns the new
 * building or a failure reason string.
 */
export function placeBuilding(
  world: World,
  playerId: number,
  kind: BuildingKind,
  tx: number,
  ty: number,
  builder?: Unit,
): Building | string {
  const def = BUILDING_DEFS[kind];
  const p = world.player(playerId);
  if (p.gold < def.costGold) return "Not enough gold";
  if (p.wood < def.costWood) return "Not enough wood";
  if (!canPlace(world, kind, tx, ty)) return "Cannot build there";

  p.gold -= def.costGold;
  p.wood -= def.costWood;

  const b = world.addBuilding(new Building(kind, playerId, { x: tx, y: ty }, false));
  if (builder) orderBuild(world, builder, b);
  return b;
}

/**
 * Cancel an unfinished building: refund its full cost, free any workers
 * assigned to it, and remove it from the world. No-op on completed buildings.
 */
export function cancelBuilding(world: World, b: Building): boolean {
  if (b.state === "complete") return false;
  const p = world.player(b.playerId);
  p.gold += b.def.costGold;
  p.wood += b.def.costWood;
  for (const u of world.units) {
    if (u.buildTarget === b) u.stop();
  }
  world.removeBuilding(b);
  return true;
}
