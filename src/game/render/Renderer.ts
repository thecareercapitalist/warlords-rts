import type { World } from "../World.ts";
import type { Camera } from "../Camera.ts";
import type { Fog } from "../systems/fog.ts";
import { FOG_HIDDEN, FOG_VISIBLE } from "../systems/fog.ts";
import type { BuildingKind, Vec2 } from "../types.ts";
import { COLORS, TILE } from "../constants.ts";
import { BUILDING_DEFS } from "../entities/defs.ts";

export interface RenderState {
  dragBoxScreen: { x: number; y: number; w: number; h: number } | null;
  buildPreview: { kind: BuildingKind; tile: Vec2; valid: boolean } | null;
}

export class Renderer {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly cam: Camera,
  ) {}

  render(world: World, fog: Fog, humanId: number, state: RenderState): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.cam.viewW, this.cam.viewH);

    this.drawTerrain(world, fog);
    this.drawBuildings(world, fog, humanId);
    this.drawUnits(world, fog, humanId);
    if (state.buildPreview) this.drawBuildPreview(state.buildPreview);
    this.drawFogOverlay(fog);
    if (state.dragBoxScreen) this.drawDragBox(state.dragBoxScreen);
  }

  private drawTerrain(world: World, fog: Fog): void {
    const ctx = this.ctx;
    const { x0, y0, x1, y1 } = this.cam.visibleTileBounds();
    const z = this.cam.zoom;
    const size = TILE * z;

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (fog.level(tx, ty) === FOG_HIDDEN) continue; // stays black
        const t = world.map.at(tx, ty)!;
        const s = this.cam.worldToScreen(tx * TILE, ty * TILE);
        let color: string;
        switch (t.terrain) {
          case "water":
            color = COLORS.water;
            break;
          case "forest":
            color = COLORS.forest;
            break;
          case "rock":
            color = COLORS.rock;
            break;
          case "goldmine":
            color = COLORS.goldmine;
            break;
          default:
            color = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
        }
        ctx.fillStyle = color;
        ctx.fillRect(s.x, s.y, size + 1, size + 1);

        // Simple terrain markers (programmer art).
        if (t.terrain === "forest") {
          ctx.fillStyle = "#1a3a1a";
          ctx.beginPath();
          ctx.arc(s.x + size / 2, s.y + size / 2, size * 0.28, 0, Math.PI * 2);
          ctx.fill();
        } else if (t.terrain === "goldmine") {
          ctx.fillStyle = "#5a4500";
          ctx.font = `${Math.floor(size * 0.6)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("$", s.x + size / 2, s.y + size / 2 + 1);
        }
      }
    }
  }

  private drawBuildings(world: World, fog: Fog, humanId: number): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    for (const b of world.buildings) {
      if (b.dead) continue;
      const isEnemy = b.playerId !== humanId;
      if (isEnemy && !this.anyTileVisible(fog, b.tile.x, b.tile.y, b.footprint)) continue;

      const s = this.cam.worldToScreen(b.tile.x * TILE, b.tile.y * TILE);
      const size = b.footprint * TILE * z;
      const color = world.player(b.playerId).color;

      // Body
      ctx.fillStyle = b.state === "complete" ? color : this.shade(color, -0.35);
      ctx.fillRect(s.x + 1, s.y + 1, size - 2, size - 2);
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x + 1, s.y + 1, size - 2, size - 2);

      // Glyph
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = `bold ${Math.floor(size * 0.3)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.def.glyph, s.x + size / 2, s.y + size / 2);

      // Construction overlay
      if (b.state !== "complete") {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        const h = size * (1 - b.construction);
        ctx.fillRect(s.x + 1, s.y + 1, size - 2, h);
      }

      // Selection + HP
      if (b.selected) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.x, s.y, size, size);
        if (b.rally) this.drawRally(b.center(), b.rally);
      }
      if (b.hp < b.def.maxHp || b.selected) {
        this.drawHpBar(s.x + 2, s.y - 7 * z, size - 4, b.hp / b.def.maxHp, !isEnemy);
      }
    }
  }

  private drawUnits(world: World, fog: Fog, humanId: number): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    for (const u of world.units) {
      if (u.dead) continue;
      const isEnemy = u.playerId !== humanId;
      const t = u.tile();
      if (isEnemy && fog.level(t.x, t.y) !== FOG_VISIBLE) continue;

      const s = this.cam.worldToScreen(u.pos.x, u.pos.y);
      const r = u.radius * z;
      const color = world.player(u.playerId).color;

      if (u.selected) {
        ctx.strokeStyle = COLORS.selection;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Glyph
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `bold ${Math.floor(r * 1.1)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(u.def.glyph, s.x, s.y + 0.5);

      // Carried resource pip
      if (u.carrying) {
        ctx.fillStyle = u.carrying.kind === "gold" ? "#ffd24a" : "#9c6b2e";
        ctx.beginPath();
        ctx.arc(s.x + r * 0.7, s.y - r * 0.7, Math.max(2, r * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }

      if (u.hp < u.def.maxHp || u.selected) {
        this.drawHpBar(s.x - r, s.y - r - 6 * z, r * 2, u.hp / u.def.maxHp, !isEnemy);
      }
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
    const s = this.cam.worldToScreen(p.tile.x * TILE, p.tile.y * TILE);
    const size = fp * TILE * this.cam.zoom;
    ctx.fillStyle = p.valid ? COLORS.buildOk : COLORS.buildBad;
    ctx.fillRect(s.x, s.y, size, size);
    ctx.strokeStyle = p.valid ? "#3cc85a" : "#dc3c3c";
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x, s.y, size, size);
  }

  private drawFogOverlay(fog: Fog): void {
    const ctx = this.ctx;
    const { x0, y0, x1, y1 } = this.cam.visibleTileBounds();
    const z = this.cam.zoom;
    const size = TILE * z + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const lvl = fog.level(tx, ty);
        if (lvl === FOG_VISIBLE) continue;
        const s = this.cam.worldToScreen(tx * TILE, ty * TILE);
        ctx.fillStyle = lvl === FOG_HIDDEN ? COLORS.fog : COLORS.fogExplored;
        ctx.fillRect(s.x, s.y, size, size);
      }
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

  /** Lighten (positive) or darken (negative) a hex colour. */
  private shade(hex: string, amt: number): string {
    const c = hex.replace("#", "");
    const n = parseInt(c, 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return `rgb(${r},${g},${b})`;
  }
}
