import type { Vec2 } from "../types.ts";

// Transient, presentation-only visual effects (projectiles, death poofs). These
// hold no gameplay state — they're spawned from drained World events and just
// animate then expire.

interface Projectile {
  from: Vec2;
  to: Vec2;
  t: number;
  dur: number;
  heavy?: boolean; // siege: a lobbed stone rather than an arrow
  magic?: boolean; // mage: a glowing arcane bolt
}

interface DeathFx {
  x: number;
  y: number;
  color: string;
  glyph: string;
  t: number;
  dur: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  dur: number;
}

interface Collapse {
  x: number;
  y: number;
  size: number;
  t: number;
  dur: number;
}

interface Impact {
  x: number;
  y: number;
  seed: number; // varies spark directions per impact
  t: number;
  dur: number;
}

interface Decal {
  x: number;
  y: number;
  seed: number;
  t: number;
  dur: number;
}

interface Marker {
  x: number;
  y: number;
  t: number;
  dur: number;
  attack?: boolean; // red (attack-move) vs green (plain move)
}

interface Blast {
  x: number;
  y: number;
  t: number;
  dur: number;
  kind: "fire" | "frost";
}

export class Effects {
  readonly projectiles: Projectile[] = [];
  readonly deaths: DeathFx[] = [];
  readonly floaters: Floater[] = [];
  readonly collapses: Collapse[] = [];
  readonly impacts: Impact[] = [];
  readonly decals: Decal[] = [];
  readonly markers: Marker[] = []; // move-order destination rings
  readonly blasts: Blast[] = []; // spell impacts (fireball / freeze)

  spawnBlast(x: number, y: number, kind: "fire" | "frost"): void {
    this.blasts.push({ x, y, t: 0, dur: kind === "fire" ? 0.55 : 0.7, kind });
  }

  spawnMoveMarker(x: number, y: number, attack = false): void {
    this.markers.push({ x, y, t: 0, dur: 0.5, attack });
  }

  spawnImpact(x: number, y: number): void {
    // Cap so a big melee doesn't pile up thousands of sparks.
    if (this.impacts.length > 80) return;
    this.impacts.push({ x, y, seed: (x * 13 + y * 7) % 6.283, t: 0, dur: 0.18 });
  }

  spawnDecal(x: number, y: number): void {
    if (this.decals.length > 120) this.decals.shift(); // cap oldest out
    this.decals.push({ x, y, seed: (x * 17 + y * 11) % 6.283, t: 0, dur: 7 });
  }

  spawnFloater(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, color, t: 0, dur: 1.0 });
  }

  spawnCollapse(x: number, y: number, size: number): void {
    this.collapses.push({ x, y, size, t: 0, dur: 0.7 });
  }

  spawnProjectile(from: Vec2, to: Vec2, heavy = false, magic = false): void {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.max(0.12, Math.min(0.5, d / 600));
    this.projectiles.push({ from: { ...from }, to: { ...to }, t: 0, dur, heavy, magic });
  }

  spawnDeath(x: number, y: number, color: string, glyph: string): void {
    this.deaths.push({ x, y, color, glyph, t: 0, dur: 0.55 });
  }

  update(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.projectiles[i].t += dt;
      if (this.projectiles[i].t >= this.projectiles[i].dur) this.projectiles.splice(i, 1);
    }
    for (let i = this.deaths.length - 1; i >= 0; i--) {
      this.deaths[i].t += dt;
      if (this.deaths[i].t >= this.deaths[i].dur) this.deaths.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t += dt;
      if (this.floaters[i].t >= this.floaters[i].dur) this.floaters.splice(i, 1);
    }
    for (let i = this.collapses.length - 1; i >= 0; i--) {
      this.collapses[i].t += dt;
      if (this.collapses[i].t >= this.collapses[i].dur) this.collapses.splice(i, 1);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].t += dt;
      if (this.impacts[i].t >= this.impacts[i].dur) this.impacts.splice(i, 1);
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      this.decals[i].t += dt;
      if (this.decals[i].t >= this.decals[i].dur) this.decals.splice(i, 1);
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      this.markers[i].t += dt;
      if (this.markers[i].t >= this.markers[i].dur) this.markers.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      this.blasts[i].t += dt;
      if (this.blasts[i].t >= this.blasts[i].dur) this.blasts.splice(i, 1);
    }
  }

  clear(): void {
    this.projectiles.length = 0;
    this.deaths.length = 0;
    this.floaters.length = 0;
    this.collapses.length = 0;
    this.impacts.length = 0;
    this.decals.length = 0;
    this.markers.length = 0;
    this.blasts.length = 0;
  }
}
