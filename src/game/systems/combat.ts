import type { World } from "../World.ts";
import type { Unit, Targetable } from "../entities/Unit.ts";
import { veterancyMult } from "../entities/Unit.ts";
import { TILE, ATTACK_ANIM_DUR } from "../constants.ts";
import { dist, dist2, clamp, tileCenter } from "../util/math.ts";
import { pathTo, orderAttackMove, standAdjacentTo } from "./orders.ts";

const REPATH_INTERVAL = 0.4; // seconds between chase repaths

function isEnemy(a: { playerId: number }, b: { playerId: number }): boolean {
  return a.playerId !== b.playerId;
}

const FORGE_ATTACK_BONUS = 2;

/** +attack while the player owns at least one completed Forge. */
function forgeBonus(world: World, playerId: number): number {
  for (const b of world.buildings) {
    if (b.kind === "forge" && b.playerId === playerId && b.state === "complete" && !b.dead) {
      return FORGE_ATTACK_BONUS;
    }
  }
  return 0;
}

/** Distance from a unit to the nearest point of its target's body. */
function distToTarget(u: Unit, t: Targetable): number {
  if (t.etype === "building") {
    const x0 = t.tile.x * TILE;
    const y0 = t.tile.y * TILE;
    const x1 = (t.tile.x + t.footprint) * TILE;
    const y1 = (t.tile.y + t.footprint) * TILE;
    const cx = clamp(u.pos.x, x0, x1);
    const cy = clamp(u.pos.y, y0, y1);
    return Math.hypot(u.pos.x - cx, u.pos.y - cy);
  }
  return dist(u.pos, t.pos);
}

/** Range in pixels at which `u` can hit `t`, measured to the target's edge. */
function effectiveRangePx(u: Unit, t: Targetable): number {
  const reach = u.def.attackRange * TILE + u.radius + 3;
  return t.etype === "unit" ? reach + t.radius : reach;
}

/** Closest live enemy within `radiusTiles`, units preferred over buildings. */
function acquireTarget(world: World, u: Unit, radiusTiles: number): Targetable | null {
  const rPx = radiusTiles * TILE;
  const r2 = rPx * rPx;
  let best: Targetable | null = null;
  let bestD = Infinity;
  const melee = u.def.attackRange <= 1;
  for (const o of world.units) {
    if (o.dead || !isEnemy(u, o)) continue;
    if (o.def.flying && melee) continue; // melee can't reach flyers
    const d = dist2(u.pos, o.pos);
    if (d < r2 && d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best) return best;
  for (const b of world.buildings) {
    if (b.dead || !isEnemy(u, b)) continue;
    const d = dist2(u.pos, b.center());
    if (d < r2 && d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function updateCombat(world: World, dt: number): void {
  for (const b of world.buildings) if (b.hitFlash > 0) b.hitFlash -= dt;
  for (const u of world.units) {
    if (u.dead) continue;
    if (u.attackCooldown > 0) u.attackCooldown -= dt;
    if (u.repathTimer > 0) u.repathTimer -= dt;
    if (u.hitFlash > 0) u.hitFlash -= dt;
    if (u.attackAnim > 0) u.attackAnim -= dt;

    // Drop a target that has died.
    if (u.attackTarget && u.attackTarget.dead) u.attackTarget = null;

    // Auto-acquire: combat units (not workers) defend themselves and engage
    // enemies they encounter while attack-moving. Workers fight only when
    // explicitly ordered (which sets attackTarget directly).
    if (!u.attackTarget && u.def.damage > 0 && !u.def.canGather) {
      // A plain MOVE order is obeyed literally — units no longer auto-engage while
      // "moving", so the player can pull them out of a fight and reposition. They
      // still defend themselves once idle, and hunt while attack-moving.
      if (u.state === "attackMoving" || u.state === "idle") {
        // Generous aggro so units defend themselves against anything that wanders
        // near; a bit wider while attack-moving. Hold-ground is filtered below.
        const aggro = u.state === "attackMoving" ? u.def.visionRadius + 2 : u.def.visionRadius + 3;
        const tgt = acquireTarget(world, u, aggro);
        // Hold-ground units only engage foes already within firing range — they
        // never chase. Everyone else acquires normally.
        if (tgt && !(u.holdGround && distToTarget(u, tgt) > effectiveRangePx(u, tgt))) {
          u.attackTarget = tgt;
        }
      }
    }

    // Holding a live target → engage it, whatever state we drifted into.
    if (u.attackTarget) {
      if (u.state !== "attacking") u.state = "attacking";
      fightTarget(world, u, dt);
    }
  }

  updateTowers(world, dt);
}

/** Defensive buildings (towers) auto-fire at the nearest enemy unit in range. */
function updateTowers(world: World, dt: number): void {
  for (const b of world.buildings) {
    if (b.dead || b.state !== "complete" || b.def.damage === undefined) continue;
    if (b.attackCooldown > 0) {
      b.attackCooldown -= dt;
      continue;
    }
    const rPx = (b.def.attackRange ?? 0) * TILE;
    const r2 = rPx * rPx;
    const c = b.center();
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const o of world.units) {
      if (o.dead || o.playerId === b.playerId) continue;
      const d = dist2(c, o.pos);
      if (d < r2 && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) continue;
    world.events.push({ type: "projectile", from: { x: c.x, y: c.y }, to: { x: best.pos.x, y: best.pos.y } });
    world.events.push({ type: "attack", ranged: true });
    best.hp -= Math.max(1, (b.def.damage ?? 0) - (best.def.armor ?? 0));
    best.hitFlash = 0.12;
    world.events.push({ type: "damaged", playerId: best.playerId, x: best.pos.x, y: best.pos.y });
    b.attackCooldown = b.def.attackCooldown ?? 1.2;
    if (best.hp <= 0) {
      world.events.push({
        type: "death",
        x: best.pos.x,
        y: best.pos.y,
        color: world.player(best.playerId).color,
        glyph: best.def.glyph,
        by: b.playerId,
      });
      best.state = "dead";
    }
  }
}

function fightTarget(world: World, u: Unit, _dt: number): void {
  const t = u.attackTarget!;
  if (t.dead) {
    u.attackTarget = null;
    resumeAfterKill(world, u);
    return;
  }
  // Melee units can't strike a flying target — give up on it.
  if (t.etype === "unit" && (t as Unit).def.flying && u.def.attackRange <= 1) {
    u.attackTarget = null;
    resumeAfterKill(world, u);
    return;
  }

  const range = effectiveRangePx(u, t);

  if (distToTarget(u, t) <= range) {
    // In range: stop and strike on cooldown.
    u.path = [];
    u.finalTarget = null;
    if (u.attackCooldown <= 0) {
      const c = t.center();
      // Animation + FX cues.
      u.attackAnim = ATTACK_ANIM_DUR;
      u.aim = { x: c.x, y: c.y };
      t.hitFlash = 0.12;
      const ranged = u.def.attackRange > 1;
      const heavy = (u.def.siegeMult ?? 1) > 1; // siege engines lob a weighty shot
      world.events.push({ type: "attack", ranged, heavy });
      if (ranged) {
        const magic = u.kind === "mage";
        const fire = u.kind === "dragon";
        world.events.push({ type: "projectile", from: { x: u.pos.x, y: u.pos.y }, to: { x: c.x, y: c.y }, heavy, magic, fire });
      }
      const armor = t.etype === "unit" ? (t.def.armor ?? 0) : 0;
      const siege = t.etype === "building" ? (u.def.siegeMult ?? 1) : 1;
      const raw = (u.def.damage * veterancyMult(u.kills) + forgeBonus(world, u.playerId)) * siege;
      t.hp -= Math.max(1, raw - armor);
      world.events.push({ type: "damaged", playerId: t.playerId, x: c.x, y: c.y });

      // Siege splash: the shot also harms enemy units clustered near the impact.
      if (u.def.splash) {
        const sr2 = (u.def.splash * TILE) ** 2;
        const splashDmg = u.def.damage * 0.6;
        for (const o of world.units) {
          if (o.dead || o === t || !isEnemy(u, o)) continue;
          if ((o.pos.x - c.x) ** 2 + (o.pos.y - c.y) ** 2 > sr2) continue;
          o.hp -= Math.max(1, splashDmg - (o.def.armor ?? 0));
          o.hitFlash = 0.12;
          world.events.push({ type: "damaged", playerId: o.playerId, x: o.pos.x, y: o.pos.y });
          if (o.hp <= 0 && o.state !== "dead") {
            o.state = "dead";
            u.kills++;
            world.events.push({
              type: "death",
              x: o.pos.x,
              y: o.pos.y,
              color: world.player(o.playerId).color,
              glyph: o.def.glyph,
              by: u.playerId,
            });
          }
        }
      }
      u.attackCooldown = u.def.attackCooldown;
      if (t.hp <= 0) {
        u.kills++;
        if (t.etype === "building") {
          world.events.push({ type: "collapse", x: c.x, y: c.y, size: t.footprint * TILE, by: u.playerId });
        } else {
          world.events.push({
            type: "death",
            x: c.x,
            y: c.y,
            color: world.player(t.playerId).color,
            glyph: t.def.glyph,
            by: u.playerId,
          });
          t.state = "dead";
        }
        u.attackTarget = null;
        resumeAfterKill(world, u);
      }
    }
  } else if (u.holdGround) {
    // Stance: never advance — drop the target and stay put until one comes close.
    u.attackTarget = null;
    u.state = "idle";
    u.path = [];
    u.finalTarget = null;
  } else {
    // Out of range: chase, repathing periodically. For buildings, head to the
    // nearest open adjacent tile so attackers spread around the footprint.
    if (u.repathTimer <= 0 || u.path.length === 0) {
      if (t.etype === "building") {
        const stand = standAdjacentTo(world, t, u.tile());
        if (stand) pathTo(world, u, stand.x, stand.y, tileCenter(stand.x, stand.y));
      } else {
        pathTo(world, u, t.tile().x, t.tile().y, t.pos);
      }
      u.repathTimer = REPATH_INTERVAL;
    }
  }
}

function resumeAfterKill(world: World, u: Unit): void {
  if (u.attackMove && u.attackMoveDest) {
    orderAttackMove(world, u, u.attackMoveDest);
  } else {
    u.state = "idle";
    u.path = [];
    u.finalTarget = null;
  }
}
