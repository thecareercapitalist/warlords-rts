import type { World } from "../World.ts";
import type { Unit } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { BuildingKind, ResourceKind, UnitKind, Vec2 } from "../types.ts";
import { enqueueUnit } from "./production.ts";
import { placeBuilding, canPlace } from "./placement.ts";
import { orderGather, orderAttackMove, orderMove, orderBuild } from "./orders.ts";
import { BUILDING_DEFS } from "../entities/defs.ts";
import { TILE } from "../constants.ts";
import { toTile, dist2 } from "../util/math.ts";

/** Skirmish difficulty — scales the AI's economy and how soon it commits waves. */
export type Difficulty = "easy" | "normal" | "hard";

const TICK = 1.0; // seconds between AI decisions
const TARGET_WORKERS = 8;
const MAX_BARRACKS = 2;
const MAX_TOWERS = 2;
const ATTACK_ARMY_SIZE = 6; // launch a wave once this many fighters exist
const GARRISON_SIZE = 2; // fighters held back to guard the base during a wave
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
  private wavesSent = 0; // each launched wave raises the bar for the next
  private trainTick = 0; // rotates the mixed-army unit choice
  private difficulty: Difficulty = "normal";
  private age = 0; // seconds since the match began (gates the first wave)

  constructor(private readonly playerId: number) {}

  /** Set skirmish difficulty (live — affects the next decisions). */
  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
  }

  /** Worker economy target, scaled by difficulty (weaker AI economy on Recruit). */
  private targetWorkers(): number {
    return this.difficulty === "easy" ? 5 : this.difficulty === "hard" ? 10 : TARGET_WORKERS;
  }

  update(world: World, dt: number): void {
    const p = world.player(this.playerId);
    if (p.defeated) return;
    this.age += dt; // accrues every frame, independent of the decision tick
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK;

    const units = world.unitsOf(this.playerId);
    const buildings = world.buildingsOf(this.playerId);
    const townhall = buildings.find((b) => b.kind === "townhall");
    if (!townhall) return; // base destroyed; AI is effectively done

    this.manageWorkerSafety(world, this.workers(units), townhall);
    this.manageConstruction(world, this.workers(units), buildings);
    this.manageRepair(world, this.workers(units), buildings);
    this.manageEconomy(world, units, buildings, townhall);
    this.manageBuildOrder(world, p, units, buildings, townhall);
    this.manageArmy(world, units);
  }

  /**
   * Resume any stalled construction: if a building site has no worker actively
   * building it, send one. Without this the AI can soft-lock — e.g. a half-built
   * farm whose builder wandered off leaves it supply-capped forever.
   */
  private manageConstruction(world: World, workers: Unit[], buildings: Building[]): void {
    const site = buildings.find((b) => b.state !== "complete" && !b.dead);
    if (!site) return;
    // Put up to 2 workers on a site so it finishes quickly — a lone builder on a
    // cramped base is painfully slow and starves supply growth.
    if (workers.filter((w) => w.buildTarget === site).length >= 2) return;
    const w = workers.find(
      (u) => !u.fleeing && !u.buildTarget && u.state !== "building",
    );
    if (w) orderBuild(world, w, site);
  }

  /** Pull a worker to repair the most-damaged building (cap 2 repairers). */
  private manageRepair(world: World, workers: Unit[], buildings: Building[]): void {
    if (world.player(this.playerId).gold < 20) return; // repair costs gold
    let worst: Building | null = null;
    for (const b of buildings) {
      if (b.state !== "complete" || b.hp >= b.def.maxHp * 0.8) continue;
      if (!worst || b.hp / b.def.maxHp < worst.hp / worst.def.maxHp) worst = b;
    }
    if (!worst) return;
    const repairing = workers.filter((w) => w.buildTarget === worst).length;
    if (repairing >= 2) return;
    const w = workers.find(
      (u) => !u.fleeing && !u.buildTarget && u.state !== "building",
    );
    if (w) orderBuild(world, w, worst);
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
      // Gold workers fall back to the nearest LIVE mine anywhere on the map once
      // local gold is exhausted (mines are finite now) — keeps the economy alive
      // and pushes the AI to work distant/neutral mines.
      const node = wantWood
        ? (this.scanResource(world, center, "wood", 24) ?? this.findResource(world, center, w.playerId))
        : (this.scanResource(world, center, "gold", 22) ??
           this.nearestLiveMine(world, center) ??
           this.scanResource(world, center, "wood", 24));
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
    const forgeDone = buildings.some((b) => b.kind === "forge" && b.state === "complete");
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
      // A Forge unlocks siege — sprinkle in a catapult to crack the human's base.
      if (forgeDone && p.gold >= 160 && p.wood >= 60) choices.push("catapult");
      const kind = choices[this.trainTick % choices.length];
      this.trainTick++;
      const err = enqueueUnit(world, barracks, kind);
      if (err && kind !== "footman") enqueueUnit(world, barracks, "footman"); // keep busy
    }

    // A2. Summon casters from the Enclave: mostly Mages, an occasional Dragon when
    // resources are flush.
    for (const enc of buildings) {
      if (enc.kind !== "enclave" || enc.state !== "complete" || enc.queue.length >= 1) continue;
      if (p.gold >= 350 && p.wood >= 120 && this.trainTick % 3 === 0) {
        enqueueUnit(world, enc, "dragon");
      } else if (p.gold >= 90 && p.wood >= 20) {
        enqueueUnit(world, enc, "mage");
      }
      this.trainTick++;
    }

    // B. Keep workers coming.
    if (workers.length < this.targetWorkers() && townhall.queue.length === 0) {
      enqueueUnit(world, townhall, "peon");
    }

    // C. One structure at a time, in priority order.
    if (constructing) return;

    // Forward base: once the home gold is exhausted but a distant mine still has
    // ore and we can afford it, plant a SECOND town hall beside that mine so
    // workers don't trek across the whole map.
    const homeGold = this.scanResource(world, townhall.center(), "gold", 12);
    if (!homeGold) {
      const mine = this.nearestLiveMine(world, townhall.center());
      const thDef = BUILDING_DEFS.townhall;
      const alreadyNear =
        mine && buildings.some((b) => b.kind === "townhall" && Math.abs(b.tile.x - mine.x) + Math.abs(b.tile.y - mine.y) <= 10);
      if (mine && !alreadyNear && p.gold >= thDef.costGold && p.wood >= thDef.costWood) {
        const spot = this.findBuildSpot(world, "townhall", mine);
        const builder = workers.find((w) => w.state !== "building") ?? workers[0];
        if (spot && builder) {
          placeBuilding(world, this.playerId, "townhall", spot.x, spot.y, builder);
          return;
        }
      }
    }
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
    // A Mage's Enclave unlocks casters + the Dragon — a late-game power spike.
    const hasEnclave = buildings.some((b) => b.kind === "enclave");
    if (hasBarracks && hasForge && !hasEnclave && p.gold >= 220 && p.wood >= 110) {
      this.tryBuild(world, "enclave", townhall, workers);
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
    const allFighters = this.fighters(units);

    // Preserve fragile, expensive units: a badly-wounded mage or dragon retreats
    // toward home rather than feeding itself to the enemy line. Fleeing units go to
    // "moving" state so they won't auto-re-engage on the way out.
    const myB = world.buildingsOf(this.playerId);
    const home = (myB.find((b) => b.kind === "townhall") ?? myB[0])?.center() ?? null;
    const retreating = new Set<Unit>();
    if (home) {
      // Scan ALL AI units (mage/dragon aren't in COMBAT_KINDS / allFighters).
      for (const f of units) {
        if (f.dead) continue;
        if (f.kind !== "mage" && f.kind !== "dragon") continue;
        if (f.hp >= f.def.maxHp * 0.3) continue;
        const danger = world.units.some(
          (o) => !o.dead && o.playerId !== this.playerId && o.def.damage > 0 && dist2(f.pos, o.pos) < (6 * TILE) ** 2,
        );
        if (!danger) continue;
        retreating.add(f);
        f.attackTarget = null;
        f.holdGround = false;
        if (!f.finalTarget || dist2(f.finalTarget, home) > (2 * TILE) ** 2) orderMove(world, f, home);
      }
    }
    const fighters = allFighters.filter((f) => !retreating.has(f));

    // Defense first: if enemies are near the base, pull the whole army home,
    // interrupting any offensive wave.
    const threat = this.findThreatNearBase(world);
    if (threat) {
      this.commandLine(world, fighters, threat);
      this.attacking = false;
      return;
    }

    if (this.attacking) {
      // The wave is "live" only while some fighter is engaged or still advancing on
      // a target. Once it's spent — everyone idle with nothing left to fight, or
      // whittled down — drop the flag so the (now larger) army regroups and commits
      // a FRESH wave below this same tick, keeping continuous pressure on. (Before,
      // this returned every tick while ≥2 fighters survived, so the AI launched a
      // single wave all game and the rest of its army just stood around.)
      const live =
        fighters.length >= 2 &&
        fighters.some((f) => f.attackTarget !== null || f.path.length > 0 || f.finalTarget !== null);
      if (live) return;
      this.attacking = false;
    }
    // Each wave the AI commits raises the muster threshold for the next, so its
    // attacks grow larger and scarier as the game wears on (capped). Difficulty
    // shifts the base: Recruit musters more before attacking (later, rarer waves),
    // Warlord commits sooner.
    const diffAdj = this.difficulty === "easy" ? 3 : this.difficulty === "hard" ? -2 : 0;
    const threshold = Math.max(3, ATTACK_ARMY_SIZE + diffAdj + Math.min(this.wavesSent * 2, 8));
    // First-wave grace: never rush before a difficulty-scaled minimum, so the player
    // gets a build-up window (Recruit generous, Warlord short). Later waves are
    // ungated — once the war is on, it stays on.
    const firstWaveGrace = this.difficulty === "easy" ? 120 : this.difficulty === "hard" ? 55 : 85;
    if (this.wavesSent === 0 && this.age < firstWaveGrace) return;
    if (fighters.length >= threshold) {
      const target = this.findEnemyTarget(world);
      if (target) {
        // Hold a small home guard back; send the rest on the wave. The guards
        // are the fighters nearest the base, so the wave stays cohesive.
        const myB = world.buildingsOf(this.playerId);
        const base = (myB.find((b) => b.kind === "townhall") ?? myB[0])?.center();
        let wave = fighters;
        if (base && fighters.length > GARRISON_SIZE) {
          const byDist = [...fighters].sort(
            (a, b) =>
              (b.pos.x - base.x) ** 2 + (b.pos.y - base.y) ** 2 -
              ((a.pos.x - base.x) ** 2 + (a.pos.y - base.y) ** 2),
          );
          wave = byDist.slice(0, fighters.length - GARRISON_SIZE); // farthest from base attack
        }
        this.commandLine(world, wave, target);
        this.attacking = true;
        this.wavesSent++;
      }
    }
  }

  /**
   * Order a group to a target as a battle line: melee charge the target; fragile
   * ranged units (attackRange > 1) attack-move to a point a few tiles SHORT of the
   * target — staying behind the melee front instead of leading the charge.
   */
  private commandLine(world: World, group: Unit[], target: Vec2): void {
    const melee = group.filter((u) => u.def.attackRange <= 1);
    let cx = 0;
    let cy = 0;
    for (const u of melee) {
      cx += u.pos.x;
      cy += u.pos.y;
    }
    const hasMelee = melee.length > 0;
    if (hasMelee) {
      cx /= melee.length;
      cy /= melee.length;
    }
    for (const u of group) {
      if (u.def.attackRange > 1 && hasMelee) {
        // Offset back from the target toward the melee's side so they hold the rear.
        let dx = cx - target.x;
        let dy = cy - target.y;
        const len = Math.hypot(dx, dy) || 1;
        const back = 3 * TILE;
        orderAttackMove(world, u, { x: target.x + (dx / len) * back, y: target.y + (dy / len) * back });
      } else {
        orderAttackMove(world, u, target);
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
          // Leave a 1-tile gap so footprints don't seal the base in, and require
          // a walkable adjacent tile so a builder can actually reach the site
          // (a ring of rock/forest is non-water but unwalkable → unbuildable).
          if (
            canPlace(world, kind, x, y) &&
            this.hasClearance(world, x, y, fp) &&
            this.hasReachableAdjacent(world, x, y, fp)
          ) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  /** At least one walkable tile on the footprint's surrounding ring (so a
   *  builder can stand adjacent and the site is actually reachable). */
  private hasReachableAdjacent(world: World, tx: number, ty: number, fp: number): boolean {
    for (let y = ty - 1; y <= ty + fp; y++) {
      for (let x = tx - 1; x <= tx + fp; x++) {
        const onRing = x < tx || x >= tx + fp || y < ty || y >= ty + fp;
        if (onRing && world.map.isWalkable(x, y)) return true;
      }
    }
    return false;
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

  /** Nearest goldmine anywhere on the map that still has gold (map-wide fallback). */
  private nearestLiveMine(world: World, fromPx: Vec2): Vec2 | null {
    const ft = toTile(fromPx.x, fromPx.y);
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (const m of world.map.goldmines) {
      const t = world.map.at(m.x, m.y);
      if (!t || t.terrain !== "goldmine" || t.resource <= 0) continue;
      const d = (m.x - ft.x) ** 2 + (m.y - ft.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x: m.x, y: m.y };
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
