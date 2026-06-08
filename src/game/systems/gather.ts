import type { World } from "../World.ts";
import type { Unit } from "../entities/Unit.ts";
import type { ResourceKind, Vec2 } from "../types.ts";
import { GATHER_TIME, PEON_CARRY_CAPACITY, TILE } from "../constants.ts";
import { arrived } from "./movement.ts";
import { orderGather, adjacentToTile, adjacentToBuilding, pathTo, standAdjacentTo } from "./orders.ts";

function resourceKindAt(world: World, x: number, y: number): ResourceKind | null {
  const t = world.map.at(x, y);
  if (!t || t.resource <= 0) return null;
  if (t.terrain === "goldmine") return "gold";
  if (t.terrain === "forest") return "wood";
  return null;
}

/** Search outward for the nearest harvestable tile. */
function nearestResourceTile(world: World, from: Vec2, maxR = 10): Vec2 | null {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = from.x + dx;
        const y = from.y + dy;
        if (resourceKindAt(world, x, y)) return { x, y };
      }
    }
  }
  return null;
}

/** Nearest forest tile with wood left (used to auto-task sawmill builders). */
export function nearestWoodTile(world: World, from: Vec2, maxR = 12): Vec2 | null {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = from.x + dx;
        const y = from.y + dy;
        const t = world.map.at(x, y);
        if (t && t.terrain === "forest" && t.resource > 0) return { x, y };
      }
    }
  }
  return null;
}

export function updateGather(world: World, dt: number): void {
  for (const u of world.units) {
    if (u.dead || !u.def.canGather) continue;

    switch (u.state) {
      case "movingToResource":
        if (arrived(u)) beginGathering(world, u);
        break;
      case "gathering":
        tickGathering(world, u, dt);
        break;
      case "returning":
        if (arrived(u)) deposit(world, u);
        break;
    }
  }
}

function beginGathering(world: World, u: Unit): void {
  const node = u.resourceTile;
  if (!node) {
    u.state = "idle";
    return;
  }
  const kind = resourceKindAt(world, node.x, node.y);
  if (!kind || !adjacentToTile(u, node.x, node.y, 1)) {
    // Node gone or we didn't actually reach it — look for another nearby.
    const next = nearestResourceTile(world, u.tile(), 8);
    if (next) orderGather(world, u, next);
    else u.state = "idle";
    return;
  }
  u.state = "gathering";
  u.gatherTimer = GATHER_TIME;
}

function tickGathering(world: World, u: Unit, dt: number): void {
  const node = u.resourceTile;
  if (!node) {
    u.state = "idle";
    return;
  }
  u.gatherTimer -= dt;
  if (u.gatherTimer > 0) return;

  const tile = world.map.at(node.x, node.y);
  const kind = resourceKindAt(world, node.x, node.y);
  if (!tile || !kind) {
    u.state = "idle";
    return;
  }

  const amount = Math.min(PEON_CARRY_CAPACITY, tile.resource);
  tile.resource -= amount;
  u.carrying = { kind, amount };

  // Node just ran dry → signal it (sound + FX).
  if (tile.resource <= 0) {
    world.events.push({ type: "depleted", x: node.x * TILE + TILE / 2, y: node.y * TILE + TILE / 2 });
  }
  // Depleted forest becomes a stump (grass) so it can be walked through.
  if (tile.terrain === "forest" && tile.resource <= 0) {
    tile.terrain = "grass";
  }

  // Head back to the nearest drop-off that accepts this resource.
  const drop = world.nearestDropoff(u.playerId, u.pos, kind);
  if (!drop) {
    u.state = "idle"; // nowhere to deposit; hold the load
    return;
  }
  u.dropoff = drop;
  u.state = "returning";
  const stand = standAdjacentTo(world, drop, u.tile()) ?? drop.adjacentTile();
  pathTo(world, u, stand.x, stand.y);
}

function deposit(world: World, u: Unit): void {
  const drop = u.dropoff;
  if (!drop || drop.dead || !adjacentToBuilding(u, drop, 1)) {
    // Drop-off lost; try to find another that accepts what we carry.
    const alt = u.carrying ? world.nearestDropoff(u.playerId, u.pos, u.carrying.kind) : null;
    if (alt && u.carrying) {
      u.dropoff = alt;
      const stand = standAdjacentTo(world, alt, u.tile()) ?? alt.adjacentTile();
      pathTo(world, u, stand.x, stand.y);
      u.state = "returning";
    } else {
      u.state = "idle";
    }
    return;
  }

  if (u.carrying) {
    const p = world.player(u.playerId);
    const { kind, amount } = u.carrying;
    if (kind === "gold") p.gold += amount;
    else p.wood += amount;
    const c = drop.center();
    world.events.push({ type: "gain", playerId: u.playerId, x: c.x, y: c.y, kind, amount });
    u.carrying = null;
  }

  // Return to the same node, or find a new one if it's exhausted.
  const node = u.resourceTile;
  if (node && resourceKindAt(world, node.x, node.y)) {
    orderGather(world, u, node);
  } else {
    const search = node ?? u.tile();
    const next = nearestResourceTile(world, search, 10);
    if (next) orderGather(world, u, next);
    else u.state = "idle";
  }
}
