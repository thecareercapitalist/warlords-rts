import type { World } from "../World.ts";
import type { Unit } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { Vec2 } from "../types.ts";
import { type Rect, rectContains, toTile } from "../util/math.ts";

/** Topmost unit whose body circle contains the world point. */
export function unitAt(world: World, p: Vec2): Unit | null {
  let best: Unit | null = null;
  for (const u of world.units) {
    if (u.dead) continue;
    const dx = u.pos.x - p.x;
    const dy = u.pos.y - p.y;
    if (dx * dx + dy * dy <= (u.radius + 2) ** 2) best = u; // later units draw on top
  }
  return best;
}

/** Building whose footprint covers the world point. */
export function buildingAt(world: World, p: Vec2): Building | null {
  const t = toTile(p.x, p.y);
  for (const b of world.buildings) {
    if (!b.dead && b.coversTile(t.x, t.y)) return b;
  }
  return null;
}

/** Any selectable entity at a point (units first). */
export function entityAt(world: World, p: Vec2): Unit | Building | null {
  return unitAt(world, p) ?? buildingAt(world, p);
}

/** Player-owned units intersecting a world-space rectangle. */
export function unitsInRect(world: World, rect: Rect, playerId: number): Unit[] {
  const out: Unit[] = [];
  for (const u of world.units) {
    if (u.dead || u.playerId !== playerId) continue;
    if (rectContains(rect, u.pos)) out.push(u);
  }
  return out;
}
