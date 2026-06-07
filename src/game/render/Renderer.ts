import type { World } from "../World.ts";
import type { Camera } from "../Camera.ts";
import type { Fog } from "../systems/fog.ts";
import { FOG_HIDDEN, FOG_VISIBLE } from "../systems/fog.ts";
import type { BuildingKind, Vec2 } from "../types.ts";
import { COLORS, TILE } from "../constants.ts";
import { BUILDING_DEFS } from "../entities/defs.ts";
import { ISO_HALF_W, ISO_HALF_H, ISO_TILE_W, ISO_TILE_H } from "./iso.ts";
import type { Assets, TileKey } from "./assets.ts";
import type { Effects } from "./effects.ts";

// Isometric renderer (v0.4) — projects the square-grid world onto the iso plane.

export interface RenderState {
  dragBoxScreen: { x: number; y: number; w: number; h: number } | null;
  buildPreview: { kind: BuildingKind; tile: Vec2; valid: boolean } | null;
}

const UNIT_DRAW_R = 13; // screen radius (px) for a unit body at zoom 1

export class Renderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly cam: Camera,
    private readonly assets: Assets,
  ) {}

  render(world: World, fog: Fog, humanId: number, state: RenderState, effects: Effects): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.cam.viewW, this.cam.viewH);

    this.drawTerrain(world, fog);
    this.drawFogOverlay(fog);
    if (state.buildPreview) this.drawBuildPreview(state.buildPreview);
    this.drawEntities(world, fog, humanId);
    this.drawEffects(effects);
    this.drawColorGrade(); // gothic mood over the world, under UI
    if (state.dragBoxScreen) this.drawDragBox(state.dragBoxScreen);
  }

  /**
   * Grim color grade toward the art-direction North Star (Warcraft × They Are
   * Billions × Darkest Dungeon): a faint cool gloom wash plus a vignette that
   * darkens the edges and focuses the centre. Drawn over the world but under the
   * HUD, so UI stays crisp. Purely additive — easy to dial or remove.
   */
  private drawColorGrade(): void {
    const ctx = this.ctx;
    const w = this.cam.viewW;
    const h = this.cam.viewH;
    // Subtle cool darkening for muted, gothic gloom.
    ctx.fillStyle = "rgba(18,20,32,0.16)";
    ctx.fillRect(0, 0, w, h);
    // Vignette: clear centre → dark edges.
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.28,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(6,5,12,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // --- Terrain ------------------------------------------------------------

  private tileCenterScreen(tx: number, ty: number): Vec2 {
    return this.cam.worldToScreen(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
  }

  private diamondPath(cx: number, cy: number): void {
    const ctx = this.ctx;
    const hw = ISO_HALF_W * this.cam.zoom;
    const hh = ISO_HALF_H * this.cam.zoom;
    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
  }

  private drawTerrain(world: World, fog: Fog): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const { x0, y0, x1, y1 } = this.cam.visibleTileRange();
    const hw = ISO_HALF_W * z;
    const hh = ISO_HALF_H * z;

    // Back-to-front by (tx+ty) keeps any tile overhang ordering correct.
    for (let sum = 0; sum <= x1 + y1; sum++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ty = sum - tx;
        if (ty < y0 || ty > y1) continue;
        if (fog.level(tx, ty) === FOG_HIDDEN) continue; // stays black

        const t = world.map.at(tx, ty)!;
        const s = this.tileCenterScreen(tx, ty);
        const spriteKey = this.terrainSprite(t.terrain);
        const img = spriteKey ? this.assets.get(spriteKey) : undefined;

        if (img) {
          const v = this.tileVariant(tx, ty, img);
          ctx.save();
          this.diamondPath(s.x, s.y);
          ctx.clip();
          ctx.drawImage(img, v.sx, v.sy, ISO_TILE_W, ISO_TILE_H, s.x - hw, s.y - hh, ISO_TILE_W * z, ISO_TILE_H * z);
          ctx.restore();
        } else {
          this.diamondPath(s.x, s.y);
          ctx.fillStyle = this.terrainColor(t.terrain, tx, ty);
          ctx.fill();
        }

        if (t.terrain === "goldmine") {
          ctx.fillStyle = "#3a2c00";
          ctx.font = `bold ${Math.floor(28 * z)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("$", s.x, s.y);
        }
      }
    }
  }

  /**
   * Pick a tile-sheet cell deterministically from tile coords, so each tile
   * keeps a stable variant (no per-frame flicker) while the field looks varied.
   * The SBS sheets are grids of same-biome variations, so any cell fits.
   */
  private tileVariant(tx: number, ty: number, img: HTMLImageElement): { sx: number; sy: number } {
    const cols = Math.max(1, Math.floor(img.width / ISO_TILE_W));
    const rows = Math.max(1, Math.floor(img.height / ISO_TILE_H));
    const count = cols * rows;
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const cell = h % count;
    return { sx: (cell % cols) * ISO_TILE_W, sy: Math.floor(cell / cols) * ISO_TILE_H };
  }

  private terrainSprite(terrain: string): TileKey | null {
    if (terrain === "grass") return "grass";
    if (terrain === "water") return "water";
    if (terrain === "forest") return "forest";
    return null;
  }

  private terrainColor(terrain: string, tx: number, ty: number): string {
    switch (terrain) {
      case "water":
        return COLORS.water;
      case "forest":
        return COLORS.forest;
      case "rock":
        return COLORS.rock;
      case "goldmine":
        return COLORS.goldmine;
      default:
        return (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
    }
  }

  private drawFogOverlay(fog: Fog): void {
    const ctx = this.ctx;
    const { x0, y0, x1, y1 } = this.cam.visibleTileRange();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (fog.level(tx, ty) !== 1) continue; // only dim explored-but-not-visible
        const s = this.tileCenterScreen(tx, ty);
        this.diamondPath(s.x, s.y);
        ctx.fillStyle = COLORS.fogExplored;
        ctx.fill();
      }
    }
  }

  // --- Entities (depth-sorted) -------------------------------------------

  private drawEntities(world: World, fog: Fog, humanId: number): void {
    interface Drawable {
      depth: number;
      draw: () => void;
    }
    const list: Drawable[] = [];

    for (const b of world.buildings) {
      if (b.dead) continue;
      const isEnemy = b.playerId !== humanId;
      if (isEnemy && !this.anyTileVisible(fog, b.tile.x, b.tile.y, b.footprint)) continue;
      const depth = b.tile.x + b.tile.y + b.footprint; // sort by far corner
      list.push({ depth, draw: () => this.drawBuilding(world, b, isEnemy) });
    }
    for (const u of world.units) {
      if (u.dead) continue;
      const isEnemy = u.playerId !== humanId;
      const t = u.tile();
      if (isEnemy && fog.level(t.x, t.y) !== FOG_VISIBLE) continue;
      const depth = (u.pos.x + u.pos.y) / TILE;
      list.push({ depth, draw: () => this.drawUnit(world, u, isEnemy) });
    }

    list.sort((a, b) => a.depth - b.depth);
    for (const d of list) d.draw();
  }

  private drawBuilding(world: World, b: import("../entities/Building.ts").Building, isEnemy: boolean): void {
    const ctx = this.ctx;
    const fp = b.footprint;
    const corners = [
      this.cam.worldToScreen(b.tile.x * TILE, b.tile.y * TILE),
      this.cam.worldToScreen((b.tile.x + fp) * TILE, b.tile.y * TILE),
      this.cam.worldToScreen((b.tile.x + fp) * TILE, (b.tile.y + fp) * TILE),
      this.cam.worldToScreen(b.tile.x * TILE, (b.tile.y + fp) * TILE),
    ];
    const color = world.player(b.playerId).color;
    const poly = () => {
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
    };

    const center = this.cam.worldToScreen(
      (b.tile.x + fp / 2) * TILE,
      (b.tile.y + fp / 2) * TILE,
    );
    const topY = Math.min(...corners.map((c) => c.y));
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));

    // Stone body (ownership comes from the trim + banner, not the body color).
    poly();
    ctx.fillStyle = b.state === "complete" ? "#4a4236" : "#2f2a22";
    ctx.fill();
    // Thin team-colored trim, then a heavy inked outer outline.
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#15110d";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (b.state !== "complete") {
      ctx.save();
      poly();
      ctx.clip();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      const bottomY = Math.max(...corners.map((c) => c.y));
      const h = (bottomY - topY) * (1 - b.construction);
      ctx.fillRect(minX, topY, maxX - minX, h);
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `bold ${Math.floor(16 * this.cam.zoom)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.def.glyph, center.x, center.y);

    // Team banner on a pole at the top vertex — clear ownership cue.
    if (b.state === "complete") {
      const z = this.cam.zoom;
      const topV = corners.reduce((a, c) => (c.y < a.y ? c : a), corners[0]);
      const poleH = 20 * z;
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(topV.x, topV.y);
      ctx.lineTo(topV.x, topV.y - poleH);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(topV.x, topV.y - poleH);
      ctx.lineTo(topV.x + 13 * z, topV.y - poleH + 5 * z);
      ctx.lineTo(topV.x, topV.y - poleH + 11 * z);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (b.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, b.hitFlash / 0.12) * 0.5;
      ctx.fillStyle = "#fff";
      poly();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (b.selected) {
      poly();
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (b.rally) this.drawRally(b.center(), b.rally);
    }
    if (b.hp < b.def.maxHp || b.selected) {
      this.drawHpBar(minX, topY - 8, maxX - minX, b.hp / b.def.maxHp, !isEnemy);
    }
  }

  private drawUnit(world: World, u: import("../entities/Unit.ts").Unit, isEnemy: boolean): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    // Lunge toward the target during the brief attack animation.
    let wx = u.pos.x;
    let wy = u.pos.y;
    if (u.attackAnim > 0 && u.aim) {
      const dx = u.aim.x - u.pos.x;
      const dy = u.aim.y - u.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const amt = 6 * (u.attackAnim / 0.18);
      wx += (dx / d) * amt;
      wy += (dy / d) * amt;
    }
    const s = this.cam.worldToScreen(wx, wy);
    const r = UNIT_DRAW_R * z * (u.radius / 10);
    const color = world.player(u.playerId).color;

    // Ground shadow for a little depth.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + r * 0.5, r * 1.05, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Team-colored base ring (ownership reads from the ring, not just the body).
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 2 * z);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + r * 0.55, r * 1.15, r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (u.selected) {
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + r * 0.5, r * 1.2, r * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body bobs while moving (shadow + ring stay grounded). Tied to distance
    // travelled so it's deterministic and stops when the unit is still.
    const moving = u.path.length > 0 || u.finalTarget !== null;
    const by = s.y - (moving ? Math.abs(Math.sin((u.pos.x + u.pos.y) * 0.12)) * 3 * z : 0);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s.x, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#15110d"; // heavy inked outline
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(u.def.glyph, s.x, by);

    if (u.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, u.hitFlash / 0.12) * 0.7;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(s.x, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (u.carrying) {
      ctx.fillStyle = u.carrying.kind === "gold" ? "#ffd24a" : "#9c6b2e";
      ctx.beginPath();
      ctx.arc(s.x + r * 0.8, by - r * 0.8, Math.max(2, r * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    if (u.hp < u.def.maxHp || u.selected) {
      this.drawHpBar(s.x - r, by - r - 8 * z, r * 2, u.hp / u.def.maxHp, !isEnemy);
    }
  }

  private drawHpBar(x: number, y: number, w: number, frac: number, friendly: boolean): void {
    const ctx = this.ctx;
    const h = 4;
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = friendly ? COLORS.hpFront : COLORS.hpEnemy;
    ctx.fillRect(x, y, w * Math.max(0, frac), h);
  }

  private drawRally(from: Vec2, to: Vec2): void {
    const ctx = this.ctx;
    const a = this.cam.worldToScreen(from.x, from.y);
    const b = this.cam.worldToScreen(to.x, to.y);
    ctx.strokeStyle = COLORS.rally;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.rally;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBuildPreview(p: { kind: BuildingKind; tile: Vec2; valid: boolean }): void {
    const ctx = this.ctx;
    const fp = BUILDING_DEFS[p.kind].footprint;
    const corners = [
      this.cam.worldToScreen(p.tile.x * TILE, p.tile.y * TILE),
      this.cam.worldToScreen((p.tile.x + fp) * TILE, p.tile.y * TILE),
      this.cam.worldToScreen((p.tile.x + fp) * TILE, (p.tile.y + fp) * TILE),
      this.cam.worldToScreen(p.tile.x * TILE, (p.tile.y + fp) * TILE),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = p.valid ? COLORS.buildOk : COLORS.buildBad;
    ctx.fill();
    ctx.strokeStyle = p.valid ? "#3cc85a" : "#dc3c3c";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawEffects(fx: Effects): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;

    // Arrows / projectiles: travel along the line with a slight upward arc.
    for (const p of fx.projectiles) {
      const k = p.t / p.dur;
      const wx = p.from.x + (p.to.x - p.from.x) * k;
      const wy = p.from.y + (p.to.y - p.from.y) * k;
      const s = this.cam.worldToScreen(wx, wy);
      const lift = Math.sin(k * Math.PI) * 16 * z;
      const sFrom = this.cam.worldToScreen(p.from.x, p.from.y);
      const sTo = this.cam.worldToScreen(p.to.x, p.to.y);
      const ang = Math.atan2(sTo.y - sFrom.y, sTo.x - sFrom.x);
      ctx.save();
      ctx.translate(s.x, s.y - lift);
      ctx.rotate(ang);
      ctx.strokeStyle = "#efe3b0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8 * z, 0);
      ctx.lineTo(6 * z, 0);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(8 * z, 0);
      ctx.lineTo(3 * z, -3 * z);
      ctx.lineTo(3 * z, 3 * z);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Death poofs: the unit's token fades and rises.
    for (const d of fx.deaths) {
      const k = d.t / d.dur;
      const s = this.cam.worldToScreen(d.x, d.y);
      const r = UNIT_DRAW_R * z * (1 - k * 0.3);
      const y = s.y - k * 16 * z;
      ctx.globalAlpha = (1 - k) * 0.85;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(s.x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(20,0,0,0.9)";
      ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.glyph, s.x, y);
      ctx.globalAlpha = 1;
    }

    // Building collapse: expanding dust cloud + scattered debris.
    for (const col of fx.collapses) {
      const k = col.t / col.dur;
      const s = this.cam.worldToScreen(col.x, col.y);
      const baseR = col.size * 0.5 * z;
      const r = baseR * (0.4 + k * 0.9);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = "#6b6258";
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      // Debris specks flying outward.
      ctx.fillStyle = "#3a322a";
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const dr = r * (0.6 + (i % 3) * 0.15);
        ctx.fillRect(s.x + Math.cos(ang) * dr, s.y + Math.sin(ang) * dr * 0.6, 3 * z, 3 * z);
      }
      ctx.globalAlpha = 1;
    }

    // Floating "+N" resource gain text, rising and fading.
    for (const f of fx.floaters) {
      const k = f.t / f.dur;
      const s = this.cam.worldToScreen(f.x, f.y);
      const y = s.y - 10 * z - k * 26 * z;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.font = `bold ${Math.floor(13 * z)}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#15110d";
      ctx.strokeText(f.text, s.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, y);
      ctx.globalAlpha = 1;
    }
  }

  private drawDragBox(box: { x: number; y: number; w: number; h: number }): void {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.selection;
    ctx.fillStyle = "rgba(154,255,176,0.12)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }

  private anyTileVisible(fog: Fog, tx: number, ty: number, fp: number): boolean {
    for (let y = ty; y < ty + fp; y++) {
      for (let x = tx; x < tx + fp; x++) {
        if (fog.level(x, y) !== FOG_HIDDEN) return true;
      }
    }
    return false;
  }
}
