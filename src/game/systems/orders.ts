import type { World } from "../World.ts";
import type { Unit, Targetable } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { Vec2 } from "../types.ts";
import { findPath } from "../pathfinding/astar.ts";
import { tileCenter, toTile, tileChebyshev } from "../util/math.ts";

/** Spiral outwards from (tx,ty) for the closest walkable tile. */
export function nearestWalkable(world: World, tx: number, ty: number, maxR = 12): Vec2 | null {
  if (world.map.isWalkable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (world.map.isWalkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Compute and assign a path for `u` to tile (tx,ty). The final pixel target is
 * the tile centre (or `finalPx` if supplied, e.g. an exact adjacency point).
 */
export function pathTo(world: World, u: Unit, tx: number, ty: number, finalPx?: Vec2): boolean {
  // Flying units ignore terrain/walls — fly straight to the exact point.
  if (u.def.flying) {
    u.path = [];
    u.finalTarget = finalPx ?? tileCenter(tx, ty);
    return true;
  }
  const from = u.tile();
  const dest = nearestWalkable(world, tx, ty);
  if (!dest) return false;

  const path = findPath(world.map, from.x, from.y, dest.x, dest.y);
  u.path = path;
  // Only honour an exact pixel target if the CLICKED tile was actually walkable —
  // otherwise (water / off-map / blocked) snap to the nearest walkable tile centre,
  // so a unit never slides onto water or off the map edge on its final step.
  u.finalTarget = finalPx && world.map.isWalkable(tx, ty) ? finalPx : tileCenter(dest.x, dest.y);

  // Already adjacent / on the tile: no waypoints, just the final nudge.
  if (path.length === 0 && from.x === dest.x && from.y === dest.y) {
    u.finalTarget = finalPx ?? null;
  }
  return true;
}

/**
 * A walkable tile on the ring immediately surrounding a building footprint,
 * chosen closest to `from`. Guarantees chebyshev-1 adjacency so interaction
 * (construction, deposit) actually registers. Returns null if fully sealed in.
 */
export function standAdjacentTo(world: World, b: Building, from: Vec2): Vec2 | null {
  const fp = b.footprint;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (let y = b.tile.y - 1; y <= b.tile.y + fp; y++) {
    for (let x = b.tile.x - 1; x <= b.tile.x + fp; x++) {
      const onRing = x < b.tile.x || x >= b.tile.x + fp || y < b.tile.y || y >= b.tile.y + fp;
      if (!onRing) continue;
      if (!world.map.isWalkable(x, y)) continue;
      const d = (x - from.x) ** 2 + (y - from.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, y };
      }
    }
  }
  return best;
}

export function orderMove(world: World, u: Unit, pixel: Vec2): void {
  const t = toTile(pixel.x, pixel.y);
  u.attackTarget = null;
  u.attackMove = false;
  u.retaliateT = 0; // a fresh move clears the fight-back window so you can pull clear
  u.moveGraceT = 1.2; // ...and grants a brief grace to break off before self-defense re-engages
  u.holdGround = false; // repositioning cancels the hold stance
  u.resourceTile = null;
  u.buildTarget = null;
  // Any carried resources are kept; the worker is just relocating.
  u.state = "moving";
  pathTo(world, u, t.x, t.y, pixel);
}

/**
 * Advance queued shift-click waypoints: an idle unit with a pending waypoint
 * moves to the next one. orderMove leaves `waypoints` untouched, so the rest of
 * the queue survives until each leg completes.
 */
export function updateWaypoints(world: World): void {
  for (const u of world.units) {
    if (u.dead || u.waypoints.length === 0) continue;
    if (u.state === "idle" && u.finalTarget === null && u.path.length === 0) {
      const next = u.waypoints.shift()!;
      orderMove(world, u, next);
    }
  }
}

/**
 * Patrolling units march between their two endpoints, attack-moving (so they
 * engage enemies en route). When one leg finishes and nothing's left to fight,
 * head to the far endpoint.
 */
export function updatePatrol(world: World): void {
  for (const u of world.units) {
    if (u.dead || !u.patrolA || !u.patrolB) continue;
    if (u.attackTarget || u.path.length > 0 || u.finalTarget !== null) continue;
    if (u.state !== "idle") continue;
    const dA = (u.pos.x - u.patrolA.x) ** 2 + (u.pos.y - u.patrolA.y) ** 2;
    const dB = (u.pos.x - u.patrolB.x) ** 2 + (u.pos.y - u.patrolB.y) ** 2;
    const target = dA > dB ? u.patrolA : u.patrolB; // head to the farther end
    const a = u.patrolA;
    const b = u.patrolB;
    orderAttackMove(world, u, target);
    u.patrolA = a; // orderAttackMove doesn't touch these, but be explicit
    u.patrolB = b;
  }
}

export function orderAttackMove(world: World, u: Unit, pixel: Vec2): void {
  const t = toTile(pixel.x, pixel.y);
  u.attackTarget = null;
  u.attackMove = true;
  u.holdGround = false; // attack-move overrides the hold stance
  u.attackMoveDest = { ...pixel };
  u.resourceTile = null;
  u.buildTarget = null;
  u.state = "attackMoving";
  pathTo(world, u, t.x, t.y, pixel);
}

export function orderAttack(world: World, u: Unit, target: Targetable): void {
  u.attackTarget = target;
  u.attackMove = false;
  u.resourceTile = null;
  u.buildTarget = null;
  u.state = "attacking";
  // Movement toward the target is handled each frame by the combat system.
  void world;
}

/** Send a worker to harvest the resource node at the given tile. */
export function orderGather(world: World, u: Unit, resourceTile: Vec2): boolean {
  if (!u.def.canGather) return false;
  const node = world.map.at(resourceTile.x, resourceTile.y);
  if (!node || node.resource <= 0) return false;

  u.attackTarget = null;
  u.attackMove = false;
  u.buildTarget = null;
  u.resourceTile = { ...resourceTile };

  const stand = nearestWalkable(world, resourceTile.x, resourceTile.y, 4);
  if (!stand) return false;
  u.state = "movingToResource";
  return pathTo(world, u, stand.x, stand.y);
}

/** Send a worker to construct an existing building site. */
export function orderBuild(world: World, u: Unit, b: Building): boolean {
  if (!u.def.canBuild) return false;
  u.attackTarget = null;
  u.attackMove = false;
  u.resourceTile = null;
  const stand = standAdjacentTo(world, b, u.tile());
  if (!stand) {
    u.stop(); // unreachable site — don't leave the worker frozen
    return false;
  }
  u.attackTarget = null;
  u.attackMove = false;
  u.resourceTile = null;
  u.buildTarget = b;
  u.state = "building";
  return pathTo(world, u, stand.x, stand.y);
}

/** Is the unit adjacent (within `range` tiles) of a tile? */
export function adjacentToTile(u: Unit, tx: number, ty: number, range = 1): boolean {
  const ut = u.tile();
  return tileChebyshev(ut.x, ut.y, tx, ty) <= range;
}

/** Is the unit close enough to a building footprint to interact? */
export function adjacentToBuilding(u: Unit, b: Building, range = 1): boolean {
  const ut = u.tile();
  // Distance from the unit tile to the nearest footprint tile.
  const nx = Math.max(b.tile.x, Math.min(ut.x, b.tile.x + b.footprint - 1));
  const ny = Math.max(b.tile.y, Math.min(ut.y, b.tile.y + b.footprint - 1));
  return tileChebyshev(ut.x, ut.y, nx, ny) <= range;
}
