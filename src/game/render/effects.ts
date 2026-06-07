import type { Vec2 } from "../types.ts";

// Transient, presentation-only visual effects (projectiles, death poofs). These
// hold no gameplay state — they're spawned from drained World events and just
// animate then expire.

interface Projectile {
  from: Vec2;
  to: Vec2;
  t: number;
  dur: number;
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

export class Effects {
  readonly projectiles: Projectile[] = [];
  readonly deaths: DeathFx[] = [];
  readonly floaters: Floater[] = [];

  spawnFloater(x: number, y: number, text: string, color: string): void {
    this.floaters.push({ x, y, text, color, t: 0, dur: 1.0 });
  }

  spawnProjectile(from: Vec2, to: Vec2): void {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = Math.max(0.12, Math.min(0.5, d / 600));
    this.projectiles.push({ from: { ...from }, to: { ...to }, t: 0, dur });
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
  }

  clear(): void {
    this.projectiles.length = 0;
    this.deaths.length = 0;
    this.floaters.length = 0;
  }
}
