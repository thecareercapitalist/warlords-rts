import type { World } from "../World.ts";
import type { Unit } from "../entities/Unit.ts";
import { tileCenter, toTile, dist } from "../util/math.ts";
import { TILE } from "../constants.ts";

const ARRIVE_EPS = 3; // px considered "reached" for a waypoint

/** True when a unit has consumed its whole path and final destination. */
export function arrived(u: Unit): boolean {
  return u.path.length === 0 && u.finalTarget === null;
}

export function updateMovement(world: World, dt: number): void {
  for (const u of world.units) {
    if (u.dead) continue;
    advance(u, dt);
  }
  separate(world, dt);
}

function advance(u: Unit, dt: number): void {
  if (u.path.length === 0 && u.finalTarget === null) return;

  const target = u.path.length > 0 ? tileCenter(u.path[0].x, u.path[0].y) : u.finalTarget!;

  const dx = target.x - u.pos.x;
  const dy = target.y - u.pos.y;
  const d = Math.hypot(dx, dy);
  const step = u.def.speed * (u.slowT > 0 ? 0.5 : 1) * dt; // chilled units move at half speed

  if (d <= Math.max(ARRIVE_EPS, step)) {
    // Snap to this target and advance to the next.
    u.pos.x = target.x;
    u.pos.y = target.y;
    if (u.path.length > 0) {
      u.path.shift();
    } else {
      u.finalTarget = null;
    }
    if (u.path.length === 0 && u.finalTarget === null) {
      onArrive(u);
    }
  } else {
    u.pos.x += (dx / d) * step;
    u.pos.y += (dy / d) * step;
  }
}

function onArrive(u: Unit): void {
  // Plain move orders settle to idle; behavior systems own the rest.
  if (u.state === "moving" || u.state === "attackMoving") {
    u.state = "idle";
  }
}

// --- Separation -----------------------------------------------------------
// A light boids-style push so clustered units spread out instead of stacking
// perfectly. Uses a per-frame spatial hash keyed by tile so it stays cheap.

export function separate(world: World, dt: number): void {
  const cell = TILE;
  const buckets = new Map<number, Unit[]>();
  const key = (cx: number, cy: number) => cx * 100000 + cy;

  for (const u of world.units) {
    if (u.dead) continue;
    const cx = Math.floor(u.pos.x / cell);
    const cy = Math.floor(u.pos.y / cell);
    const k = key(cx, cy);
    let arr = buckets.get(k);
    if (!arr) buckets.set(k, (arr = []));
    arr.push(u);
  }

  for (const u of world.units) {
    if (u.dead) continue;
    // Units actively working in place (mining/chopping, or building once arrived)
    // hold their ground — otherwise clustered workers shove each other and appear
    // to slide back and forth instead of standing and swinging.
    const working =
      u.state === "gathering" ||
      (u.state === "building" && u.path.length === 0 && u.finalTarget === null);
    if (working) continue;
    const cx = Math.floor(u.pos.x / cell);
    const cy = Math.floor(u.pos.y / cell);
    let pushX = 0;
    let pushY = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const arr = buckets.get(key(cx + ox, cy + oy));
        if (!arr) continue;
        for (const o of arr) {
          if (o === u) continue;
          const dx = u.pos.x - o.pos.x;
          const dy = u.pos.y - o.pos.y;
          const minDist = u.radius + o.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < minDist * minDist) {
            const d = Math.sqrt(d2);
            const overlap = (minDist - d) / d;
            pushX += dx * overlap * 0.5;
            pushY += dy * overlap * 0.5;
          }
        }
      }
    }
    if (pushX !== 0 || pushY !== 0) {
      const maxPush = 40 * dt + 0.5;
      const pm = Math.hypot(pushX, pushY);
      if (pm > maxPush) {
        pushX = (pushX / pm) * maxPush;
        pushY = (pushY / pm) * maxPush;
      }
      const nx = u.pos.x + pushX;
      const ny = u.pos.y + pushY;
      // Don't let separation shove a unit into blocking terrain.
      const t = toTile(nx, ny);
      if (!world.map.isBlockingTerrain(t.x, t.y)) {
        u.pos.x = nx;
        u.pos.y = ny;
      }
    }
  }
}

/** Distance in pixels between two units' centers. */
export function unitGap(a: Unit, b: Unit): number {
  return dist(a.pos, b.pos);
}
