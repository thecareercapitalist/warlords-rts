import type { World } from "../World.ts";
import type { Unit } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { BuildingKind, ResourceKind, UnitKind, Vec2 } from "../types.ts";
import { enqueueUnit } from "./production.ts";
import { placeBuilding, canPlace } from "./placement.ts";
import { orderGather, orderAttackMove, orderMove } from "./orders.ts";
import { BUILDING_DEFS } from "../entities/defs.ts";
import { TILE } from "../constants.ts";
import { toTile, dist2 } from "../util/math.ts";

const TICK = 1.0; // seconds between AI decisions
const TARGET_WORKERS = 8;
const MAX_BARRACKS = 2;
const MAX_TOWERS = 2;
const ATTACK_ARMY_SIZE = 6; // launch a wave once this many fighters exist
const DEFEND_RADIUS = 12; // tiles: enemies this close to a building trigger defense
const COMBAT_KINDS: UnitKind[] = ["footman", "grunt", "archer"];

/**
 * A deliberately simple but functional skirmish AI: keep workers mining, hold a
 * supply buffer, build a barracks, pump fighters, and throw attack waves at the
 * enemy once the army is big enough. Enough to make the game a game; not enough
 * to win tournaments.
 */
export class AIController {
  private timer = 0;
  private attacking = false;
  private trainTick = 0; // rotates the mixed-army unit choice

  constructor(private readonly playerId: number) {}

  update(world: World, dt: number): void {
    const p = world.player(this.playerId);
    if (p.defeated) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK;

    const units = world.unitsOf(this.playerId);
    const buildings = world.buildingsOf(this.playerId);
    const townhall = buildings.find((b) => b.kind === "townhall");
    if (!townhall) return; // base destroyed; AI is effectively done

    this.manageWorkerSafety(world, this.workers(units), townhall);
    this.manageEconomy(world, units, buildings, townhall);
    this.manageBuildOrder(world, p, units, buildings, townhall);
    this.manageArmy(world, units);
  }

  /** Workers flee to the town hall when an enemy soldier is raiding the base. */
  private manageWorkerSafety(world: World, workers: Unit[], townhall: Building): void {
    const FLEE2 = (3.5 * TILE) ** 2;
    const enemies = world.units.filter(
      (u) => !u.dead && u.playerId !== this.playerId && u.def.damage > 0 && !u.def.canGather,
    );
    const home = townhall.center();
    for (const w of workers) {
      if (w.buildTarget) continue; // builders keep working
      const danger = enemies.some((e) => dist2(w.pos, e.pos) < FLEE2);
      if (danger) {
        w.fleeing = true;
        if (!w.finalTarget || dist2(w.finalTarget, home) > (1.5 * TILE) ** 2) {
          orderMove(world, w, home);
        }
      } else if (w.fleeing) {
        w.fleeing = false;
        w.stop(); // safe now → idle, so manageEconomy re-tasks it to gather
      }
    }
  }

  private workers(units: Unit[]): Unit[] {
    return units.filter((u) => u.def.canGather);
  }

  private fighters(units: Unit[]): Unit[] {
    return units.filter((u) => COMBAT_KINDS.includes(u.kind));
  }

  private manageEconomy(world: World, units: Unit[], _buildings: Building[], townhall: Building): void {
    const workers = this.workers(units);
    // Keep ~a third of workers on wood so farms/temple/archers don't starve the
    // economy (gold alone piles up while wood stays at zero, capping supply).
    const woodTarget = Math.max(2, Math.floor(workers.length * 0.35));
    const onWood = (w: Unit): boolean => {
      const rt = w.resourceTile;
      const t = rt && world.map.at(rt.x, rt.y);
      return !!t && t.terrain === "forest";
    };

    for (const w of workers) {
      const idleish =
        w.state === "idle" ||
        (w.state !== "gathering" &&
          w.state !== "movingToResource" &&
          w.state !== "returning" &&
          w.state !== "building");
      if (w.fleeing) continue; // retreating from a raid — don't send back to mine
      if (!idleish) continue;
      if (w.buildTarget) continue;
      const woodCount = workers.filter(onWood).length;
      const wantWood = woodCount < woodTarget;
      const center = townhall.center();
      const node =
        (wantWood
          ? this.scanResource(world, center, "wood", 20)
          : this.scanResource(world, center, "gold", 20)) ??
        this.findResource(world, center, w.playerId);
      if (node) orderGather(world, w, node);
    }
  }

  private manageBuildOrder(
    world: World,
    p: { gold: number; wood: number; supplyUsed: number; supplyCap: number },
    units: Unit[],
    buildings: Building[],
    townhall: Building,
  ): void {
    const workers = this.workers(units);
    const hasBarracks = buildings.some((b) => b.kind === "barracks");
    const hasTemple = buildings.some((b) => b.kind === "temple");
    const templeDone = buildings.some((b) => b.kind === "temple" && b.state === "complete");
    const constructing = buildings.some((b) => b.state !== "complete");
    const barracksCount = buildings.filter((b) => b.kind === "barracks").length;

    // A. ALWAYS pump a mixed army from every idle barracks. Queuing units never
    // blocks structure builds, so this must not sit behind the early-returns
    // below (otherwise constant farm-building starves the army).
    for (const barracks of buildings) {
      if (barracks.kind !== "barracks" || barracks.state !== "complete" || barracks.queue.length >= 2) continue;
      const choices: UnitKind[] = ["footman"];
      if (p.wood >= 30) choices.push("archer");
      if (templeDone && p.gold >= 140) choices.push("knight");
      const kind = choices[this.trainTick % choices.length];
      this.trainTick++;
      const err = enqueueUnit(world, barracks, kind);
      if (err && kind !== "footman") enqueueUnit(world, barracks, "footman"); // keep busy
    }

    // B. Keep workers coming.
    if (workers.length < TARGET_WORKERS && townhall.queue.length === 0) {
      enqueueUnit(world, townhall, "peon");
    }

    // C. One structure at a time, in priority order.
    if (constructing) return;
    if (p.supplyUsed + 2 >= p.supplyCap && p.supplyCap < 40) {
      this.tryBuild(world, "farm", townhall, workers);
      return;
    }
    if (!hasBarracks && workers.length >= 4) {
      this.tryBuild(world, "barracks", townhall, workers);
      return;
    }
    if (hasBarracks && !hasTemple && workers.length >= 6 && p.gold >= 200 && p.wood >= 120) {
      this.tryBuild(world, "temple", townhall, workers);
      return;
    }
    if (barracksCount < MAX_BARRACKS && workers.length >= 8 && p.gold >= 220 && p.wood >= 100) {
      this.tryBuild(world, "barracks", townhall, workers);
      return;
    }
    // A Forge upgrades the whole army (+attack) — worth it from surplus.
    const hasForge = buildings.some((b) => b.kind === "forge");
    if (hasBarracks && !hasForge && p.gold >= 280 && p.wood >= 100) {
      this.tryBuild(world, "forge", townhall, workers);
      return;
    }
    // Fortify the base with Guard Towers — only from genuine surplus, so this
    // never starves the army/economy (gold tends to pile up; wood is the gate).
    const towerCount = buildings.filter((b) => b.kind === "tower").length;
    if (hasBarracks && towerCount < MAX_TOWERS && p.gold >= 300 && p.wood >= 120) {
      this.tryBuild(world, "tower", townhall, workers);
      return;
    }
  }

  private manageArmy(world: World, units: Unit[]): void {
    const fighters = this.fighters(units);

    // Defense first: if enemies are near the base, pull the whole army home,
    // interrupting any offensive wave.
    const threat = this.findThreatNearBase(world);
    if (threat) {
      for (const f of fighters) orderAttackMove(world, f, threat);
      this.attacking = false;
      return;
    }

    if (this.attacking) {
      // Keep the wave going; if it's been whittled down, regroup.
      if (fighters.length < 2) this.attacking = false;
      return;
    }
    if (fighters.length >= ATTACK_ARMY_SIZE) {
      const target = this.findEnemyTarget(world);
      if (target) {
        for (const f of fighters) orderAttackMove(world, f, target);
        this.attacking = true;
      }
    }
  }

  /** Nearest enemy unit within DEFEND_RADIUS of any of my buildings, or null. */
  private findThreatNearBase(world: World): Vec2 | null {
    const myBuildings = world.buildingsOf(this.playerId);
    if (myBuildings.length === 0) return null;
    const r2 = (DEFEND_RADIUS * TILE) ** 2;
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const u of world.units) {
      if (u.dead || u.playerId === this.playerId) continue;
      for (const b of myBuildings) {
        const c = b.center();
        const d = (u.pos.x - c.x) ** 2 + (u.pos.y - c.y) ** 2;
        if (d < r2 && d < bestD) {
          bestD = d;
          best = { x: u.pos.x, y: u.pos.y };
        }
      }
    }
    return best;
  }

  private tryBuild(world: World, kind: BuildingKind, townhall: Building, workers: Unit[]): void {
    const spot = this.findBuildSpot(world, kind, townhall.tile);
    if (!spot) return;
    const builder = workers.find((w) => w.state !== "building") ?? workers[0];
    if (!builder) return;
    placeBuilding(world, this.playerId, kind, spot.x, spot.y, builder);
  }

  /** Spiral around the town hall for a spot the footprint fits. */
  private findBuildSpot(world: World, kind: BuildingKind, origin: Vec2): Vec2 | null {
    const fp = BUILDING_DEFS[kind].footprint;
    for (let r = 2; r <= 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = origin.x + dx;
          const y = origin.y + dy;
          // Leave a 1-tile gap so footprints don't seal the base in.
          if (canPlace(world, kind, x, y) && this.hasClearance(world, x, y, fp)) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  private hasClearance(world: World, tx: number, ty: number, fp: number): boolean {
    for (let y = ty - 1; y <= ty + fp; y++) {
      for (let x = tx - 1; x <= tx + fp; x++) {
        const t = world.map.at(x, y);
        if (!t) return false;
        if (t.terrain === "water") return false;
      }
    }
    return true;
  }

  private findResource(world: World, from: Vec2, _playerId: number): Vec2 | null {
    // Prefer gold, fall back to wood.
    const gold = this.scanResource(world, from, "gold", 18);
    if (gold) return gold;
    return this.scanResource(world, from, "wood", 18);
  }

  private scanResource(world: World, fromPx: Vec2, kind: ResourceKind, maxR: number): Vec2 | null {
    const ft = toTile(fromPx.x, fromPx.y);
    const want = kind === "gold" ? "goldmine" : "forest";
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let y = Math.max(0, ft.y - maxR); y <= Math.min(world.map.h - 1, ft.y + maxR); y++) {
      for (let x = Math.max(0, ft.x - maxR); x <= Math.min(world.map.w - 1, ft.x + maxR); x++) {
        const t = world.map.at(x, y);
        if (!t || t.resource <= 0 || t.terrain !== want) continue;
        const d = (x - ft.x) ** 2 + (y - ft.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  private findEnemyTarget(world: World): Vec2 | null {
    // Aim at the enemy town hall, else any enemy building, else any enemy unit.
    let fallback: Vec2 | null = null;
    for (const b of world.buildings) {
      if (b.dead || b.playerId === this.playerId) continue;
      if (b.kind === "townhall") return b.center();
      fallback = b.center();
    }
    if (fallback) return fallback;
    for (const u of world.units) {
      if (!u.dead && u.playerId !== this.playerId) return { ...u.pos };
    }
    return null;
  }
}
