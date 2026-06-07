import type { World } from "../World.ts";
import type { Camera } from "../Camera.ts";
import type { Fog } from "../systems/fog.ts";
import { FOG_HIDDEN, FOG_VISIBLE } from "../systems/fog.ts";
import type { BuildingKind, Vec2 } from "../types.ts";
import { COLORS, TILE, FOREST_TILE_WOOD, GOLDMINE_AMOUNT } from "../constants.ts";
import { BUILDING_DEFS, UNIT_DEFS } from "../entities/defs.ts";
import { veterancyRank } from "../entities/Unit.ts";
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

  private now = 0; // animation clock (seconds), supplied each frame

  render(
    world: World,
    fog: Fog,
    humanId: number,
    state: RenderState,
    effects: Effects,
    now = 0,
    shake = 0,
  ): void {
    this.now = now;
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.cam.viewW, this.cam.viewH);

    // Screen shake (e.g. on a building collapse) — translate the world only;
    // the HUD and color grade stay put so the frame edges never tear.
    const shaking = shake > 0.1;
    if (shaking) {
      ctx.save();
      ctx.translate(Math.sin(now * 53) * shake, Math.cos(now * 47) * shake);
    }
    this.drawTerrain(world, fog);
    this.drawDecals(effects);
    this.drawFogOverlay(fog);
    if (state.buildPreview) this.drawBuildPreview(state.buildPreview);
    this.drawEntities(world, fog, humanId);
    this.drawEffects(effects);
    if (shaking) ctx.restore();

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

        // Depletion: darken a resource tile as it's harvested toward empty.
        if (t.terrain === "forest" || t.terrain === "goldmine") {
          const max = t.terrain === "forest" ? FOREST_TILE_WOOD : GOLDMINE_AMOUNT;
          const frac = Math.max(0, Math.min(1, t.resource / max));
          if (frac < 0.999) {
            ctx.save();
            this.diamondPath(s.x, s.y);
            ctx.clip();
            ctx.fillStyle = `rgba(0,0,0,${(1 - frac) * 0.55})`;
            ctx.fillRect(s.x - hw, s.y - hh, ISO_TILE_W * z, ISO_TILE_H * z);
            ctx.restore();
          }
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
    const ctx = this.ctx;
    interface Drawable {
      depth: number;
      draw: () => void;
    }
    const list: Drawable[] = [];

    for (const b of world.buildings) {
      if (b.dead) continue;
      const isEnemy = b.playerId !== humanId;
      if (isEnemy && !this.anyTileVisible(fog, b.tile.x, b.tile.y, b.footprint)) continue;
      // Scouted-but-unseen enemy buildings render as dimmed "last known" ghosts.
      const remembered =
        isEnemy && !this.anyTileLit(fog, b.tile.x, b.tile.y, b.footprint);
      const depth = b.tile.x + b.tile.y + b.footprint; // sort by far corner
      list.push({
        depth,
        draw: () => {
          if (remembered) {
            ctx.save();
            ctx.globalAlpha = 0.45;
            this.drawBuilding(world, b, isEnemy);
            ctx.restore();
          } else {
            this.drawBuilding(world, b, isEnemy);
          }
        },
      });
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
    // Rim light on the upper edges, shadow on the lower edges — painted depth.
    // corners: [0]=top, [1]=right, [2]=bottom, [3]=left.
    const rimW = Math.max(1, 1.5 * this.cam.zoom);
    ctx.strokeStyle = "rgba(255,244,214,0.4)";
    ctx.lineWidth = rimW;
    ctx.beginPath();
    ctx.moveTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = rimW;
    ctx.beginPath();
    ctx.moveTo(corners[3].x, corners[3].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.stroke();

    if (b.state !== "complete") {
      const z = this.cam.zoom;
      ctx.save();
      poly();
      ctx.clip();
      const bottomY = Math.max(...corners.map((c) => c.y));
      // The structure "rises" from the bottom: dark unbuilt region up top.
      const builtY = bottomY - (bottomY - topY) * b.construction;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(minX, topY, maxX - minX, builtY - topY);
      // Wooden scaffolding over the unbuilt region: horizontal beams + poles.
      ctx.strokeStyle = "#6b4a2a";
      ctx.lineWidth = Math.max(1.5, 2 * z);
      for (let i = 1; i <= 3; i++) {
        const yy = topY + (builtY - topY) * (i / 4);
        ctx.beginPath();
        ctx.moveTo(minX, yy);
        ctx.lineTo(maxX, yy);
        ctx.stroke();
      }
      for (const fx of [0.3, 0.7]) {
        const px = minX + (maxX - minX) * fx;
        ctx.beginPath();
        ctx.moveTo(px, topY);
        ctx.lineTo(px, builtY);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (b.kind === "tower" && b.state === "complete") {
      this.drawTurret(center, color);
    } else if (b.kind === "forge" && b.state === "complete") {
      this.drawForge(center);
    } else {
      // A warm, flickering hearth window on the completed Town Hall — home-fire
      // glow at the heart of the base, against the gloom.
      if (b.kind === "townhall" && b.state === "complete") {
        const z = this.cam.zoom;
        const glow = 0.5 + 0.35 * Math.abs(Math.sin(this.now * 3 + center.x * 0.08));
        ctx.fillStyle = `rgba(255,150,55,${glow.toFixed(3)})`;
        ctx.fillRect(center.x - 4.5 * z, center.y + 3 * z, 9 * z, 7 * z);
        ctx.fillStyle = `rgba(255,226,150,${(glow * 0.85).toFixed(3)})`;
        ctx.fillRect(center.x - 2 * z, center.y + 4.4 * z, 4 * z, 4 * z);
      }
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `bold ${Math.floor(16 * this.cam.zoom)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Town Hall glyph nudges up so the hearth window below stays clear.
      const glyphY = b.kind === "townhall" && b.state === "complete"
        ? center.y - 6 * this.cam.zoom
        : center.y;
      ctx.fillText(b.def.glyph, center.x, glyphY);
    }

    // Team banner on a pole at the top vertex — clear ownership cue.
    if (b.state === "complete" && b.kind !== "tower") {
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
      // Pennant flutters in the wind (phase-offset per building by its position).
      const flutter = Math.sin(this.now * 4 + topV.x * 0.1) * 3;
      ctx.beginPath();
      ctx.moveTo(topV.x, topV.y - poleH);
      ctx.lineTo(topV.x + (13 + flutter) * z, topV.y - poleH + 5 * z);
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
      // Attack-range ring for defensive buildings (iso-squashed ellipse).
      if (b.def.damage !== undefined && b.def.attackRange) {
        const z2 = this.cam.zoom;
        const c2 = this.cam.worldToScreen(b.center().x, b.center().y);
        const rr = b.def.attackRange * TILE * z2;
        ctx.save();
        ctx.strokeStyle = "rgba(217,138,50,0.5)"; // ember
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(c2.x, c2.y, rr, rr * (ISO_HALF_H / ISO_HALF_W), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Unit-production progress bar (ember fill) when training something.
    if (b.state === "complete" && b.queue.length > 0) {
      const total = UNIT_DEFS[b.queue[0]].buildTime;
      const frac = total > 0 ? 1 - b.productionTimer / total : 0;
      const bw = (maxX - minX) * 0.7;
      const bx = (minX + maxX) / 2 - bw / 2;
      const yb = topY - 14;
      ctx.fillStyle = "rgba(10,8,6,0.8)";
      ctx.fillRect(bx, yb, bw, 4);
      ctx.fillStyle = COLORS.uiEmber;
      ctx.fillRect(bx, yb, bw * Math.max(0, Math.min(1, frac)), 4);
    }

    // Heavy damage: a rising smoke plume with an ember fleck.
    if (b.state === "complete" && b.hp < b.def.maxHp * 0.35) {
      const z = this.cam.zoom;
      for (let i = 0; i < 3; i++) {
        const ph = this.now * 0.8 + i * 2.1 + b.tile.x * 0.5;
        const rise = (ph % 3) / 3; // 0..1 loop
        const sx = center.x + Math.sin(ph * 1.7) * 6 * z;
        const sy = topY - 4 * z - rise * 26 * z;
        ctx.globalAlpha = (1 - rise) * 0.4;
        ctx.fillStyle = "#3a342e";
        ctx.beginPath();
        ctx.arc(sx, sy, (3 + rise * 4) * z, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#e88530";
      ctx.beginPath();
      ctx.arc(center.x + Math.sin(this.now * 3) * 5 * z, topY - 7 * z, 1.6 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (b.hp < b.def.maxHp || b.selected) {
      this.drawHpBar(minX, topY - 8, maxX - minX, b.hp / b.def.maxHp, !isEnemy);
    }
  }

  /** A dark furnace with a flickering ember mouth — the Forge. */
  private drawForge(center: Vec2): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const cx = center.x;
    const cy = center.y;
    // Furnace block.
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(cx - 11 * z, cy - 5 * z, 22 * z, 16 * z);
    ctx.strokeStyle = "#15110d";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 11 * z, cy - 5 * z, 22 * z, 16 * z);
    // Glowing ember mouth (flickers with the clock).
    const glow = 0.6 + 0.4 * Math.abs(Math.sin(this.now * 5 + cx * 0.1));
    ctx.fillStyle = `rgba(255,140,40,${glow})`;
    ctx.fillRect(cx - 7 * z, cy + 1 * z, 14 * z, 8 * z);
    ctx.fillStyle = `rgba(255,228,150,${glow * 0.9})`;
    ctx.fillRect(cx - 3.5 * z, cy + 2.5 * z, 7 * z, 4 * z);
    // Rising ember sparks — warm motes drifting up against the gloom.
    for (let i = 0; i < 4; i++) {
      const ph = this.now * 1.3 + i * 1.9 + cx * 0.05;
      const rise = (ph % 2) / 2; // 0..1 loop
      const ex = cx + Math.sin(ph * 2.3) * 5 * z;
      const ey = cy - 4 * z - rise * 22 * z;
      ctx.globalAlpha = (1 - rise) * 0.85;
      ctx.fillStyle = i % 2 ? "#ffb347" : "#ff7a1e";
      ctx.beginPath();
      ctx.arc(ex, ey, (1.6 - rise) * z + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** A tall crenellated stone turret with team trim + flickering ember slit. */
  private drawTurret(center: Vec2, color: string): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const cx = center.x;
    const baseY = center.y + 8 * z;
    const tw = 18 * z;
    const th = 32 * z;
    // Column body.
    ctx.fillStyle = "#4a4236";
    ctx.fillRect(cx - tw / 2, baseY - th, tw, th);
    ctx.strokeStyle = "#15110d";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - tw / 2, baseY - th, tw, th);
    // Team-colored trim band near the top.
    ctx.fillStyle = color;
    ctx.fillRect(cx - tw / 2, baseY - th + 3 * z, tw, 3 * z);
    // Crenellations (merlons) on top.
    ctx.fillStyle = "#3a342b";
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - tw / 2 + i * (tw / 3), baseY - th - 5 * z, tw / 3 - 1.5 * z, 5 * z);
    }
    // Ember arrow-slit, flickering with the clock.
    const glow = 0.55 + 0.45 * Math.abs(Math.sin(this.now * 3 + cx * 0.1));
    ctx.fillStyle = `rgba(230,150,60,${glow})`;
    ctx.fillRect(cx - 2.5 * z, baseY - th * 0.55, 5 * z, 9 * z);
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

      // Planned route: current leg + queued waypoints as a dashed line + dots.
      if (u.waypoints.length > 0) {
        const legs: Vec2[] = [];
        if (u.finalTarget) legs.push(u.finalTarget);
        for (const w of u.waypoints) legs.push(w);
        ctx.strokeStyle = COLORS.rally;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        for (const w of legs) {
          const p = this.cam.worldToScreen(w.x, w.y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLORS.rally;
        for (const w of legs) {
          const p = this.cam.worldToScreen(w.x, w.y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5 * z, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Patrol beat: a cyan dashed line between the two endpoints.
      if (u.patrolA && u.patrolB) {
        const pa = this.cam.worldToScreen(u.patrolA.x, u.patrolA.y);
        const pb = this.cam.worldToScreen(u.patrolB.x, u.patrolB.y);
        ctx.strokeStyle = "rgba(120,200,235,0.7)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(120,200,235,0.9)";
        for (const p of [pa, pb]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3 * z, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Body bobs while moving (shadow + ring stay grounded). Tied to distance
    // travelled so it's deterministic and stops when the unit is still.
    const moving = u.path.length > 0 || u.finalTarget !== null;
    let bx = s.x;
    let by = s.y;
    if (moving) {
      by -= Math.abs(Math.sin((u.pos.x + u.pos.y) * 0.12)) * 3 * z; // walk bob
    } else if (u.state !== "gathering") {
      // Idle breathing — gentle, phase-offset per unit so they don't pulse in unison.
      by -= Math.sin(this.now * 2 + (u.pos.x + u.pos.y) * 0.5) * 1.2 * z;
    }

    // Gather swing: workers rhythmically lurch toward the resource they harvest.
    if (u.state === "gathering" && u.resourceTile) {
      const rs = this.cam.worldToScreen(
        (u.resourceTile.x + 0.5) * TILE,
        (u.resourceTile.y + 0.5) * TILE,
      );
      const dx = rs.x - s.x;
      const dy = rs.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const sw = Math.max(0, Math.sin(this.now * 9)) * 4 * z; // 0→4px chops
      bx += (dx / d) * sw;
      by += (dy / d) * sw;
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    // Soft drop-shadow on the lower-right for form.
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.arc(bx, by, r - 1, Math.PI * 0.1, Math.PI * 0.7);
    ctx.stroke();
    ctx.strokeStyle = "#15110d"; // heavy inked outline
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.stroke();
    // Dramatic rim light along the upper-left edge (North-Star painted look).
    ctx.strokeStyle = "rgba(255,244,214,0.6)";
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.beginPath();
    ctx.arc(bx, by, r - 1, Math.PI * 1.05, Math.PI * 1.6);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(u.def.glyph, bx, by);

    // Per-kind weapon silhouette — read a unit's role by shape, not just letter.
    ctx.lineWidth = Math.max(1, 1.5 * z);
    if (u.kind === "archer") {
      // Human: warm wooden bow. Enemy: a longer, pale bone recurve.
      ctx.strokeStyle = isEnemy ? "#9a9282" : "#6b4a2a";
      ctx.lineWidth = Math.max(1, (isEnemy ? 1.9 : 1.5) * z);
      const rad = (isEnemy ? 0.9 : 0.75) * r;
      const sweep = isEnemy ? 0.5 : 0.45;
      ctx.beginPath();
      ctx.arc(bx + rad, by, rad, -Math.PI * sweep, Math.PI * sweep);
      ctx.stroke();
    } else if (u.kind === "knight") {
      if (isEnemy) {
        // Enemy champion: a pair of dark, curved horns instead of a gold crest.
        ctx.fillStyle = "#332e29";
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.5, by - r * 0.8);
        ctx.lineTo(bx - r * 0.95, by - r * 1.5);
        ctx.lineTo(bx - r * 0.18, by - r * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx + r * 0.5, by - r * 0.8);
        ctx.lineTo(bx + r * 0.95, by - r * 1.5);
        ctx.lineTo(bx + r * 0.18, by - r * 0.95);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#e8c060"; // human gold crest spike on top
        ctx.beginPath();
        ctx.moveTo(bx, by - r * 1.55);
        ctx.lineTo(bx - 2.4 * z, by - r * 0.85);
        ctx.lineTo(bx + 2.4 * z, by - r * 0.85);
        ctx.closePath();
        ctx.fill();
      }
    } else if (u.kind === "footman" || u.kind === "grunt") {
      if (isEnemy) {
        // Enemy faction wields a broad, dark orcish cleaver (vs human steel).
        ctx.strokeStyle = "#5c6356";
        ctx.lineWidth = Math.max(2, 2.8 * z);
        ctx.beginPath();
        ctx.moveTo(bx + r * 0.45, by + r * 0.5);
        ctx.lineTo(bx + r * 1.2, by - r * 0.5);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#c8d0d8"; // human steel blade up-and-right
        ctx.beginPath();
        ctx.moveTo(bx + r * 0.5, by + r * 0.45);
        ctx.lineTo(bx + r * 1.15, by - r * 0.75);
        ctx.stroke();
      }
    } else if (u.kind === "peon") {
      ctx.strokeStyle = "#6b4a2a"; // wooden tool handle
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.3, by + r * 0.5);
      ctx.lineTo(bx + r * 0.35, by - r * 0.65);
      ctx.stroke();
      ctx.fillStyle = "#8a8f96"; // small steel head
      ctx.fillRect(bx + r * 0.15, by - r * 0.9, 3 * z, 2.4 * z);
    } else if (u.kind === "catapult") {
      ctx.strokeStyle = "#5a3d22"; // heavy wooden throwing arm
      ctx.lineWidth = Math.max(1.5, 2.2 * z);
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.7, by + r * 0.5);
      ctx.lineTo(bx + r * 0.7, by - r * 0.8);
      ctx.stroke();
      ctx.fillStyle = "#8a8f96"; // loaded stone
      ctx.beginPath();
      ctx.arc(bx + r * 0.7, by - r * 0.85, 3 * z, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hold-position stance: a steel-blue anchoring bracket beneath the unit.
    if (u.holdGround) {
      ctx.strokeStyle = "#7da0c8";
      ctx.lineWidth = Math.max(1, 1.5 * z);
      ctx.beginPath();
      ctx.arc(bx, by + 1 * z, r + 3 * z, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    }

    if (u.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, u.hitFlash / 0.12) * 0.7;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Mending near a Temple: a soft green halo + drifting plus mote.
    if (u.healFx > 0) {
      const pulse = 0.4 + 0.3 * Math.sin(this.now * 6);
      ctx.globalAlpha = Math.min(1, u.healFx / 0.3) * pulse;
      ctx.strokeStyle = "#7fdd8a";
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.beginPath();
      ctx.arc(bx, by, r + 2 * z, 0, Math.PI * 2);
      ctx.stroke();
      const my = by - r - (6 + Math.sin(this.now * 4) * 2) * z;
      ctx.strokeStyle = "#aef0b4";
      ctx.beginPath();
      ctx.moveTo(bx - 2.5 * z, my);
      ctx.lineTo(bx + 2.5 * z, my);
      ctx.moveTo(bx, my - 2.5 * z);
      ctx.lineTo(bx, my + 2.5 * z);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (u.carrying) {
      ctx.fillStyle = u.carrying.kind === "gold" ? "#ffd24a" : "#9c6b2e";
      ctx.beginPath();
      ctx.arc(bx + r * 0.8, by - r * 0.8, Math.max(2, r * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }

    if (u.hp < u.def.maxHp || u.selected) {
      this.drawHpBar(bx - r, by - r - 8 * z, r * 2, u.hp / u.def.maxHp, !isEnemy);
    }

    // Veterancy rank pips (ember chevrons) above the unit.
    const rank = veterancyRank(u.kills);
    if (rank > 0) {
      ctx.fillStyle = COLORS.uiEmber;
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = 1;
      for (let i = 0; i < rank; i++) {
        const cx = bx + (i - (rank - 1) / 2) * 5 * z;
        const cy = by - r - 13 * z;
        ctx.beginPath();
        ctx.moveTo(cx - 2 * z, cy + 2 * z);
        ctx.lineTo(cx, cy - 2 * z);
        ctx.lineTo(cx + 2 * z, cy + 2 * z);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  private drawHpBar(x: number, y: number, w: number, frac: number, friendly: boolean): void {
    const ctx = this.ctx;
    const h = 4;
    ctx.fillStyle = COLORS.hpBack;
    ctx.fillRect(x, y, w, h);
    // Color by health so wounded units read at a glance; faint friend/foe tint.
    const col =
      frac > 0.6 ? (friendly ? "#6bd06b" : "#54a854") : frac > 0.3 ? "#d9a832" : "#c0392b";
    ctx.fillStyle = col;
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

    // Preview the attack range of a defensive building before placing it.
    const def = BUILDING_DEFS[p.kind];
    if (def.attackRange) {
      const z = this.cam.zoom;
      const c = this.cam.worldToScreen((p.tile.x + fp / 2) * TILE, (p.tile.y + fp / 2) * TILE);
      const rr = def.attackRange * TILE * z;
      ctx.save();
      ctx.strokeStyle = "rgba(217,138,50,0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rr, rr * (ISO_HALF_H / ISO_HALF_W), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Ground stains left by the dead — a grim touch that fades over several seconds. */
  private drawDecals(fx: Effects): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    for (const d of fx.decals) {
      const k = d.t / d.dur;
      const s = this.cam.worldToScreen(d.x, d.y);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = "#2a0e0c"; // dark dried-blood / scorch
      for (let i = 0; i < 4; i++) {
        const a = d.seed + (i / 4) * Math.PI * 2;
        const rr = (3 + ((i * 2.3 + d.seed) % 3)) * z;
        ctx.beginPath();
        ctx.ellipse(s.x + Math.cos(a) * 4 * z, s.y + Math.sin(a) * 2.2 * z, rr, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Move-order markers: a quick expanding ring (iso-squashed) at the target.
    for (const m of fx.markers) {
      const k = m.t / m.dur;
      const s = this.cam.worldToScreen(m.x, m.y);
      const rr = (4 + k * 12) * z;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = m.attack ? "#dc3c3c" : COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, rr, rr * (ISO_HALF_H / ISO_HALF_W), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawEffects(fx: Effects): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;

    // Hit-impact sparks: a few short lines flying outward from the point of hit.
    for (const im of fx.impacts) {
      const k = im.t / im.dur;
      const s = this.cam.worldToScreen(im.x, im.y);
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.strokeStyle = "#ffe08a";
      ctx.lineWidth = Math.max(1, 1.5 * z);
      const reach = (3 + k * 7) * z;
      for (let i = 0; i < 5; i++) {
        const a = im.seed + (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(a) * 2 * z, s.y + Math.sin(a) * 1 * z);
        ctx.lineTo(s.x + Math.cos(a) * reach, s.y + Math.sin(a) * reach * 0.6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Arrows / projectiles: travel along the line with a slight upward arc.
    for (const p of fx.projectiles) {
      const k = p.t / p.dur;
      const wx = p.from.x + (p.to.x - p.from.x) * k;
      const wy = p.from.y + (p.to.y - p.from.y) * k;
      const s = this.cam.worldToScreen(wx, wy);
      // Siege: a dark stone on a high lob, not an arrow.
      if (p.heavy) {
        const lift2 = Math.sin(k * Math.PI) * 30 * z;
        ctx.fillStyle = "#33302b";
        ctx.beginPath();
        ctx.arc(s.x, s.y - lift2, 4.5 * z, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }
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

  /** True if any footprint tile is currently lit (not just explored). */
  private anyTileLit(fog: Fog, tx: number, ty: number, fp: number): boolean {
    for (let y = ty; y < ty + fp; y++) {
      for (let x = tx; x < tx + fp; x++) {
        if (fog.level(x, y) === FOG_VISIBLE) return true;
      }
    }
    return false;
  }
}
