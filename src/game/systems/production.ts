import type { World } from "../World.ts";
import type { Building } from "../entities/Building.ts";
import type { UnitKind, Vec2 } from "../types.ts";
import { Unit } from "../entities/Unit.ts";
import { UNIT_DEFS, BUILDING_DEFS } from "../entities/defs.ts";
import { lerp, tileCenter, toTile } from "../util/math.ts";
import { TILE } from "../constants.ts";
import { nearestWalkable, orderMove, orderGather, adjacentToBuilding } from "./orders.ts";
import { arrived } from "./movement.ts";

const MAX_BUILDERS_SPEEDUP = 3;
const REPAIR_RATE = 28; // HP/sec restored per assigned worker
const REPAIR_GOLD_PER_HP = 0.2; // gold cost per HP repaired

const HEAL_RADIUS = 5; // tiles around a Temple
const HEAL_RATE = 3; // HP/sec restored to friendly units in range

export function updateProduction(world: World, dt: number): void {
  updateConstruction(world, dt);
  updateRepair(world, dt);
  updateQueues(world, dt);
  updateHealing(world, dt);
}

/** Temples slowly mend friendly units standing nearby — a positional perk. */
function updateHealing(world: World, dt: number): void {
  for (const u of world.units) if (u.healFx > 0) u.healFx -= dt; // decay glow
  const temples = world.buildings.filter(
    (b) => b.kind === "temple" && b.state === "complete" && !b.dead,
  );
  if (temples.length === 0) return;
  const r2 = (HEAL_RADIUS * TILE) ** 2;
  for (const u of world.units) {
    if (u.dead || u.hp >= u.def.maxHp) continue;
    for (const t of temples) {
      if (t.playerId !== u.playerId) continue;
      const c = t.center();
      if ((u.pos.x - c.x) ** 2 + (u.pos.y - c.y) ** 2 <= r2) {
        u.hp = Math.min(u.def.maxHp, u.hp + HEAL_RATE * dt);
        u.healFx = 0.3; // refresh the green mending glow
        break;
      }
    }
  }
}

// --- Repair ---------------------------------------------------------------
// A worker assigned (buildTarget) to a COMPLETE but damaged friendly building
// restores its HP over time for a trickle of gold. Stops when full or broke.

function updateRepair(world: World, dt: number): void {
  for (const b of world.buildings) {
    if (b.dead || b.state !== "complete" || b.hp >= b.def.maxHp) continue;

    let workers = 0;
    for (const u of world.units) {
      if (u.dead || u.buildTarget !== b || u.state !== "building") continue;
      if (arrived(u) && adjacentToBuilding(u, b, 1)) workers++;
    }
    if (workers === 0) continue;

    const p = world.player(b.playerId);
    const need = b.def.maxHp - b.hp;
    const byRate = REPAIR_RATE * Math.min(workers, MAX_BUILDERS_SPEEDUP) * dt;
    const byGold = REPAIR_GOLD_PER_HP > 0 ? p.gold / REPAIR_GOLD_PER_HP : need;
    const heal = Math.min(need, byRate, byGold);
    if (heal <= 0) continue;

    b.hp += heal;
    p.gold -= heal * REPAIR_GOLD_PER_HP;

    if (b.hp >= b.def.maxHp) {
      b.hp = b.def.maxHp;
      for (const u of world.units) {
        if (u.buildTarget === b && u.state === "building") {
          u.buildTarget = null;
          u.state = "idle";
        }
      }
    }
  }
}

// --- Construction ---------------------------------------------------------

function updateConstruction(world: World, dt: number): void {
  for (const b of world.buildings) {
    if (b.dead || b.state === "complete") continue;

    // Count workers actively building this site.
    let builders = 0;
    for (const u of world.units) {
      if (u.dead || u.buildTarget !== b || u.state !== "building") continue;
      if (arrived(u) && adjacentToBuilding(u, b, 1)) builders++;
    }
    if (builders === 0) continue;

    if (b.state === "site") b.state = "constructing";
    const rate = Math.min(builders, MAX_BUILDERS_SPEEDUP) / b.def.buildTime;
    b.construction = Math.min(1, b.construction + rate * dt);
    // HP ramps from the 10% site value up to full as it completes.
    b.hp = Math.max(b.hp, Math.floor(lerp(b.def.maxHp * 0.1, b.def.maxHp, b.construction)));

    if (b.construction >= 1) {
      b.state = "complete";
      b.hp = b.def.maxHp;
      world.events.push({ type: "build" });
      world.recomputeSupply();
      // Release builders.
      for (const u of world.units) {
        if (u.buildTarget === b && u.state === "building") {
          u.buildTarget = null;
          u.state = "idle";
        }
      }
    }
  }
}

// --- Unit production queues ------------------------------------------------

function updateQueues(world: World, dt: number): void {
  for (const b of world.buildings) {
    if (b.dead || b.state !== "complete" || b.queue.length === 0) continue;
    b.productionTimer -= dt;
    if (b.productionTimer > 0) continue;

    const kind = b.queue.shift()!;
    spawnUnit(world, b, kind);
    if (b.queue.length > 0) {
      b.productionTimer = UNIT_DEFS[b.queue[0]].buildTime;
    }
  }
}

function spawnUnit(world: World, b: Building, kind: UnitKind): void {
  const spawnTile =
    nearestWalkable(world, b.tile.x - 1, b.tile.y + b.footprint, 6) ??
    nearestWalkable(world, b.tile.x + b.footprint, b.tile.y, 6);
  if (!spawnTile) return; // boxed in; skip (rare)

  const px = tileCenter(spawnTile.x, spawnTile.y);
  const u = world.addUnit(new Unit(kind, b.playerId, px));
  world.recomputeSupply();

  // Send to rally point if one is set.
  const rally = b.rally;
  if (rally) sendToRally(world, u, rally);
}

function sendToRally(world: World, u: Unit, rally: Vec2): void {
  const t = toTile(rally.x, rally.y);
  const tile = world.map.at(t.x, t.y);
  if (u.def.canGather && tile && tile.resource > 0 && (tile.terrain === "forest" || tile.terrain === "goldmine")) {
    orderGather(world, u, t);
  } else {
    orderMove(world, u, rally);
  }
}

/**
 * Queue a unit for production if the player can afford it and has supply.
 * Returns a reason string on failure, or null on success.
 */
export function enqueueUnit(world: World, b: Building, kind: UnitKind): string | null {
  if (b.state !== "complete") return "Building not finished";
  if (!b.def.produces.includes(kind)) return "Cannot produce here";
  const def = UNIT_DEFS[kind];
  if (def.requiresBuilding) {
    const has = world
      .buildingsOf(b.playerId)
      .some((x) => x.kind === def.requiresBuilding && x.state === "complete");
    if (!has) return `Requires ${BUILDING_DEFS[def.requiresBuilding].label}`;
  }
  const p = world.player(b.playerId);
  if (p.gold < def.costGold) return "Not enough gold";
  if (p.wood < def.costWood) return "Not enough wood";
  if (p.supplyUsed + queuedSupply(world, p.id) + def.supply > p.supplyCap) {
    return "Need more farms";
  }
  p.gold -= def.costGold;
  p.wood -= def.costWood;
  b.queue.push(kind);
  if (b.queue.length === 1) b.productionTimer = def.buildTime;
  return null;
}

/**
 * Cancel the most-recently-queued unit at a building and refund its cost. The
 * in-progress unit (index 0) is preserved unless it's the only one queued.
 */
export function cancelQueuedUnit(world: World, b: Building): boolean {
  if (b.queue.length === 0) return false;
  const kind = b.queue.pop()!;
  const def = UNIT_DEFS[kind];
  const p = world.player(b.playerId);
  p.gold += def.costGold;
  p.wood += def.costWood;
  if (b.queue.length === 0) b.productionTimer = 0;
  return true;
}

/** Supply already committed to in-progress production queues. */
function queuedSupply(world: World, playerId: number): number {
  let s = 0;
  for (const b of world.buildings) {
    if (b.playerId !== playerId || b.dead) continue;
    for (const k of b.queue) s += UNIT_DEFS[k].supply;
  }
  return s;
}
