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

// CC0 isometric roof sheet (buildings-roofs.png): 3 cols × 4 rows of 144×92
// cells. Map each building to a fitting roof [col, row]. Forge/Tower/Wall keep
// their bespoke code-art.
const ROOF_CELL: Partial<Record<BuildingKind, [number, number]>> = {
  farm: [0, 0], // thatch
  barracks: [1, 0], // dark tile
  sawmill: [2, 0], // timber
  townhall: [2, 2], // dark slate keep
  temple: [1, 3], // columned stone temple
};
const ROOF_CW = 144;
const ROOF_CH = 92;

// Per-kind figure palette (muted tunic + head/helm). Team identity stays on the
// base ring, not the body, per the North-Star.
const UNIT_BODY: Record<string, { tunic: string; head: string }> = {
  peon: { tunic: "#6b5638", head: "#c9a06a" },
  footman: { tunic: "#566069", head: "#b9a382" },
  grunt: { tunic: "#5f5436", head: "#9fae7a" },
  archer: { tunic: "#586b41", head: "#c9a06a" },
  knight: { tunic: "#454953", head: "#737984" },
  catapult: { tunic: "#5a3d22", head: "#5a3d22" },
};

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
          const v = this.tileVariant(tx, ty, img, t.terrain === "grass");
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

        // Map-decoration props: trees on forest, ore on goldmines, mountains on rock.
        if (t.terrain === "forest") {
          const tree = this.assets.propSprite(((tx * 7 + ty * 13) & 3) === 0 ? "deadtree" : "pines");
          if (tree) this.drawTileProp(tree, s.x, s.y, 0.95);
        } else if (t.terrain === "rock") {
          const mtn = this.assets.propSprite("mtn" + (((tx * 7 + ty * 13) % 4 + 4) % 4));
          if (mtn) this.drawTileProp(mtn, s.x, s.y, 1.35);
        } else if (t.terrain === "goldmine") {
          const gm = this.assets.propSprite("goldmine");
          if (gm) {
            this.drawTileProp(gm, s.x, s.y, 1.0);
          } else {
            ctx.fillStyle = "#3a2c00";
            ctx.font = `bold ${Math.floor(28 * z)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("$", s.x, s.y);
          }
        }
      }
    }
  }

  /** Blit a decoration prop standing on a tile, bottom-centre near the tile front. */
  private drawTileProp(sprite: CanvasImageSource, sx: number, sy: number, tilesWide: number): void {
    const z = this.cam.zoom;
    const cw = (sprite as HTMLCanvasElement).width;
    const ch = (sprite as HTMLCanvasElement).height;
    const dw = ISO_TILE_W * z * tilesWide;
    const dh = dw * (ch / cw);
    const bottomY = sy + ISO_HALF_H * z * 0.85; // sit near the tile's front edge
    this.ctx.drawImage(sprite, sx - dw / 2, bottomY - dh, dw, dh);
  }

  /**
   * Pick a tile-sheet cell deterministically from tile coords, so each tile
   * keeps a stable variant (no per-frame flicker) while the field looks varied.
   * The SBS sheets are grids of same-biome variations, so any cell fits.
   */
  private grassRank: number[] | null = null; // grass-sheet cell indices, greenest first

  /** Low-frequency value noise (0..1) → coherent terrain patches, soft seams. */
  private patchNoise(tx: number, ty: number): number {
    const vnoise = (gx: number, gy: number): number => {
      const h = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const SCALE = 5;
    const a = vnoise(Math.floor(tx / SCALE), Math.floor(ty / SCALE));
    const b = vnoise(Math.floor((tx + 2) / (SCALE * 2)), Math.floor((ty + 2) / (SCALE * 2)));
    return (a * 0.65 + b * 0.35) % 1;
  }

  /** Rank the grass sheet's cells by greenness, so we can favour lush cells. */
  private ensureGrassRank(img: HTMLImageElement, cols: number, rows: number): void {
    if (this.grassRank) return;
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const cx = cv.getContext("2d");
    if (!cx) {
      this.grassRank = [...Array(cols * rows).keys()];
      return;
    }
    cx.drawImage(img, 0, 0);
    const scored: { i: number; green: number }[] = [];
    for (let i = 0; i < cols * rows; i++) {
      const sx = (i % cols) * ISO_TILE_W + ISO_TILE_W / 2 - 24;
      const sy = Math.floor(i / cols) * ISO_TILE_H + ISO_TILE_H / 2 - 12;
      let r = 0, g = 0, b = 0, n = 0;
      try {
        const d = cx.getImageData(sx, sy, 48, 24).data;
        for (let p = 0; p < d.length; p += 4) {
          if (d[p + 3] > 10) { r += d[p]; g += d[p + 1]; b += d[p + 2]; n++; }
        }
      } catch { /* tainted — leave neutral */ }
      n = n || 1;
      scored.push({ i, green: g / n - (r / n + b / n) / 2 });
    }
    scored.sort((a, c) => c.green - a.green);
    this.grassRank = scored.map((s) => s.i);
  }

  private tileVariant(
    tx: number,
    ty: number,
    img: HTMLImageElement,
    grass = false,
  ): { sx: number; sy: number } {
    const cols = Math.max(1, Math.floor(img.width / ISO_TILE_W));
    const rows = Math.max(1, Math.floor(img.height / ISO_TILE_H));
    const count = cols * rows;
    const n = this.patchNoise(tx, ty);
    let cell: number;
    if (grass) {
      // Favour the greenest cells (n²) so the field is mostly lush grass with the
      // occasional dry/rocky patch — a They-Are-Billions-ish look.
      this.ensureGrassRank(img, cols, rows);
      const rank = this.grassRank!;
      cell = rank[Math.min(rank.length - 1, Math.floor(n * n * rank.length))];
    } else {
      cell = Math.floor(n * count) % count;
    }
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

    if (b.state !== "complete" && !this.assets.buildingSprite(b.kind, isEnemy)) {
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

    const bSprite = b.kind === "wall" ? undefined : this.assets.buildingSprite(b.kind, isEnemy);
    if (b.kind === "wall") {
      // Walls are drawn as iso-correct, auto-connecting stone (the generated sprite
      // is front-facing and reads wrong on the diamond grid).
      if (b.state === "complete") this.drawWall(world, b);
    } else if (bSprite) {
      // Generated isometric building sprite. While under construction it "rises"
      // bottom→top — the sprite itself is the progress bar.
      this.drawBuildingSprite(bSprite, corners, center, b.state === "complete" ? 1 : b.construction);
    } else if (b.kind === "tower" && b.state === "complete") {
      this.drawTurret(center, color);
    } else if (b.kind === "forge" && b.state === "complete") {
      this.drawForge(center);
    } else if (b.state === "complete") {
      // Prefer a real CC0 isometric roof sprite; fall back to code-art if the
      // sheet failed to load.
      const sheet = this.assets.sheet("roofs");
      const cell = ROOF_CELL[b.kind];
      if (sheet && cell) this.drawRoofSprite(sheet, cell, corners, center);
      else this.drawStructure(b, corners, center);
    } else {
      // Under construction: a glyph label reads over the scaffolding.
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `bold ${Math.floor(16 * this.cam.zoom)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.def.glyph, center.x, center.y);
    }

    // Team banner on a pole at the top vertex — clear ownership cue.
    if (b.state === "complete" && b.kind !== "tower" && b.kind !== "wall") {
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
      const fx = (13 + flutter) * z;
      ctx.beginPath();
      ctx.moveTo(topV.x, topV.y - poleH);
      if (isEnemy) {
        // Enemy host flies a ragged forked (swallowtail) pennant.
        ctx.lineTo(topV.x + fx, topV.y - poleH + 1.5 * z);
        ctx.lineTo(topV.x + fx * 0.5, topV.y - poleH + 5.5 * z); // inward notch
        ctx.lineTo(topV.x + fx, topV.y - poleH + 9.5 * z);
        ctx.lineTo(topV.x, topV.y - poleH + 11 * z);
      } else {
        ctx.lineTo(topV.x + fx, topV.y - poleH + 5 * z);
        ctx.lineTo(topV.x, topV.y - poleH + 11 * z);
      }
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
      // Heal-aura ring (green) for the Temple when selected.
      if (b.def.healRadius) {
        const z2 = this.cam.zoom;
        const c2 = this.cam.worldToScreen(b.center().x, b.center().y);
        const rr = b.def.healRadius * TILE * z2;
        ctx.save();
        ctx.strokeStyle = "rgba(127,221,138,0.5)";
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
      const bh = Math.max(6, bw * 0.06);
      const yb = topY - 16;
      const fw = bw * Math.max(0, Math.min(1, frac));
      ctx.fillStyle = "#15110d"; // ink border
      ctx.fillRect(bx - 1, yb - 1, bw + 2, bh + 2);
      ctx.fillStyle = "#241f1a"; // recessed track
      ctx.fillRect(bx, yb, bw, bh);
      const grad = ctx.createLinearGradient(0, yb, 0, yb + bh);
      grad.addColorStop(0, "#ffc15a");
      grad.addColorStop(1, "#b5701b");
      ctx.fillStyle = grad;
      ctx.fillRect(bx, yb, fw, bh);
      ctx.fillStyle = "rgba(255,255,255,0.4)"; // gloss
      ctx.fillRect(bx, yb, fw, Math.max(1, bh * 0.3));
    }

    // Staged battle damage: cracks at <75%, scorch + chunks at <50%, heavy smoke
    // + embers at <25%. Deterministic per building (hashed) so it never flickers.
    if (b.state === "complete" && b.hp < b.def.maxHp * 0.75) {
      const z = this.cam.zoom;
      const frac = b.hp / b.def.maxHp;
      let seed = ((b.tile.x * 73856093) ^ (b.tile.y * 19349663)) >>> 0;
      const rand = (): number => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return ((seed >>> 0) % 10000) / 10000;
      };
      const bottomY = Math.max(...corners.map((c) => c.y));
      // Scorch the stone darker as it's wrecked.
      if (frac < 0.5) {
        poly();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = `rgba(20,14,10,${frac < 0.25 ? 0.45 : 0.28})`;
        ctx.fillRect(minX, topY, maxX - minX, bottomY - topY);
        ctx.restore();
      }
      // Jagged black cracks across the footprint, more as it crumbles.
      const cracks = frac < 0.25 ? 5 : frac < 0.5 ? 3 : 2;
      ctx.strokeStyle = "rgba(15,11,9,0.75)";
      ctx.lineWidth = Math.max(1, 1.5 * z);
      for (let i = 0; i < cracks; i++) {
        const ax = minX + rand() * (maxX - minX);
        const ay = topY + rand() * (bottomY - topY);
        const len = (8 + rand() * 14) * z;
        const ang = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(ang) * len * 0.5, ay + Math.sin(ang) * len * 0.4 + 2 * z);
        ctx.lineTo(ax + Math.cos(ang + 0.6) * len, ay + Math.sin(ang + 0.6) * len * 0.4);
        ctx.stroke();
      }
      // Rising smoke plume (+ ember) once it's badly hurt.
      if (frac < 0.35) {
        for (let i = 0; i < 3; i++) {
          const ph = this.now * 0.8 + i * 2.1 + b.tile.x * 0.5;
          const rise = (ph % 3) / 3;
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
    }

    if (b.hp < b.def.maxHp || b.selected) {
      const bw = (maxX - minX) * 0.8;
      // Place the bar above the actual sprite top (tall sprites rise well past the
      // footprint), not at the footprint diamond — fixes the bar clipping the body.
      let hpY = topY - 10;
      if (bSprite) {
        const cw = (bSprite as HTMLCanvasElement).width;
        const ch = (bSprite as HTMLCanvasElement).height;
        const maxY = Math.max(...corners.map((c) => c.y));
        const dh = ch * ((maxX - minX) / cw) * 0.84;
        const spriteTop = maxY - dh + (maxY - center.y) * 0.15;
        hpY = spriteTop - 12;
      }
      this.drawHpBar((minX + maxX) / 2 - bw / 2, hpY, bw, b.hp / b.def.maxHp, !isEnemy);
    }
  }

  /** Blit a generated building sprite, scaled to the footprint and standing on it. */
  private drawBuildingSprite(
    sprite: CanvasImageSource,
    corners: Vec2[],
    center: Vec2,
    reveal = 1,
  ): void {
    const ctx = this.ctx;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const fpW = Math.max(...xs) - Math.min(...xs);
    const cw = (sprite as HTMLCanvasElement).width;
    const ch = (sprite as HTMLCanvasElement).height;
    const scale = (fpW / cw) * 0.84; // buildings sit close to their footprint
    const dw = cw * scale;
    const dh = ch * scale;
    const bottomY = Math.max(...ys); // footprint front (south) vertex
    const dx = center.x - dw / 2;
    const dy = bottomY - dh + (bottomY - center.y) * 0.15;
    if (reveal >= 1) {
      ctx.drawImage(sprite, dx, dy, dw, dh);
      return;
    }
    // Under construction: the sprite itself is the progress bar — a faint ghost of
    // the finished building, with the solid sprite revealed bottom→top, and a warm
    // "mason's line" glowing at the build front.
    const r = Math.max(0, Math.min(1, reveal));
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.drawImage(sprite, dx, dy, dw, dh); // ghost of what's coming
    ctx.globalAlpha = 1;
    const revealH = dh * r;
    const lineY = dy + dh - revealH;
    ctx.beginPath();
    ctx.rect(dx, lineY, dw, revealH);
    ctx.clip();
    ctx.drawImage(sprite, dx, dy, dw, dh); // solid built portion
    ctx.restore();
    if (r > 0.01 && r < 0.99) {
      const glow = 0.55 + 0.45 * Math.sin(this.now * 6);
      ctx.strokeStyle = `rgba(255,205,120,${glow})`;
      ctx.lineWidth = Math.max(1.5, 2.5 * this.cam.zoom);
      ctx.beginPath();
      ctx.moveTo(dx + 2, lineY);
      ctx.lineTo(dx + dw - 2, lineY);
      ctx.stroke();
    }
  }

  /** A small wheeled wooden siege frame (the catapult's chassis). */
  private drawSiegeEngine(bx: number, by: number, r: number): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const ink = "#15110d";
    // Wheels.
    for (const wx of [bx - r * 0.6, bx + r * 0.6]) {
      ctx.fillStyle = "#2a2520";
      ctx.beginPath();
      ctx.arc(wx, by + r * 0.72, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
      ctx.fillStyle = "#4a4038";
      ctx.beginPath();
      ctx.arc(wx, by + r * 0.72, r * 0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    // Wooden frame.
    ctx.fillStyle = "#5a3d22";
    ctx.fillRect(bx - r * 0.85, by - r * 0.05, r * 1.7, r * 0.72);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, 1.6 * z);
    ctx.strokeRect(bx - r * 0.85, by - r * 0.05, r * 1.7, r * 0.72);
    ctx.strokeStyle = "rgba(255,244,214,0.4)"; // top rim light
    ctx.lineWidth = Math.max(1, 1 * z);
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.85, by - r * 0.05);
    ctx.lineTo(bx + r * 0.85, by - r * 0.05);
    ctx.stroke();
  }

  /**
   * Draw a CC0 isometric roof sprite scaled onto the footprint, pulled toward the
   * gothic palette (darker, desaturated). `cell` is [col, row] in the sheet.
   */
  private drawRoofSprite(
    sheet: CanvasImageSource,
    cell: [number, number],
    corners: Vec2[],
    center: Vec2,
  ): void {
    const ctx = this.ctx;
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const fpW = Math.max(...xs) - Math.min(...xs);
    const scale = (fpW / ROOF_CW) * 1.3; // overhang a touch past the footprint
    const dw = ROOF_CW * scale;
    const dh = ROOF_CH * scale;
    // Anchor the sprite's bottom-centre near the footprint's front (south) vertex
    // so the building sits on its tile and rises upward.
    const bottomY = Math.max(...ys);
    const dx = center.x - dw / 2;
    const dy = bottomY - dh + ROOF_CH * scale * 0.16;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.filter = "brightness(0.74) saturate(0.7) contrast(1.05)";
    ctx.drawImage(sheet, cell[0] * ROOF_CW, cell[1] * ROOF_CH, ROOF_CW, ROOF_CH, dx, dy, dw, dh);
    ctx.restore();
  }

  /**
   * A raised isometric structure on a building's footprint: extruded stone walls
   * plus a per-kind roof and emblem. Reads as a real building at small scale,
   * not a labeled tile. `corners` are the footprint diamond [N, E, S, W].
   */
  private drawStructure(
    b: import("../entities/Building.ts").Building,
    corners: Vec2[],
    center: Vec2,
  ): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const [N, E, S, W] = corners;
    // Wall height + roof palette per building kind.
    const cfg: Record<string, { wall: number; roof: string; roofHi: string }> = {
      farm: { wall: 13, roof: "#8a6a38", roofHi: "#a8854a" }, // thatch
      barracks: { wall: 19, roof: "#5b4631", roofHi: "#6f5640" }, // timber
      sawmill: { wall: 16, roof: "#6a5436", roofHi: "#806746" }, // plank
      temple: { wall: 24, roof: "#7d776a", roofHi: "#9a9384" }, // pale stone
      townhall: { wall: 27, roof: "#3f3a32", roofHi: "#564f43" }, // slate keep
    };
    const c = cfg[b.kind] ?? { wall: 16, roof: "#5b5346", roofHi: "#6e6555" };
    const h = c.wall * z;
    const up = (p: Vec2): Vec2 => ({ x: p.x, y: p.y - h });
    const Nu = up(N);
    const Eu = up(E);
    const Su = up(S);
    const Wu = up(W);

    const quad = (a: Vec2, bb: Vec2, cc: Vec2, dd: Vec2, fill: string): void => {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bb.x, bb.y);
      ctx.lineTo(cc.x, cc.y);
      ctx.lineTo(dd.x, dd.y);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
    };

    // The two viewer-facing walls (SW: W→S, SE: S→E). Left lit, right shadowed.
    quad(W, S, Su, Wu, "#534a3c");
    quad(S, E, Eu, Su, "#39342b");

    // Roof: flat top diamond as a base, then a kind-specific cap on top.
    quad(Nu, Eu, Su, Wu, c.roof);
    const rcx = center.x;
    const rcy = center.y - h; // roof-plane center (screen)
    const half = (Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x))) / 2;

    ctx.lineJoin = "round";
    if (b.kind === "farm" || b.kind === "barracks") {
      // Gable roof: a ridge running N–S, raised; two slopes meet at it. Each
      // slope is the eave path (N→W/E→S) closed up over the raised ridge.
      const ridge = 9 * z;
      const ridgeN = { x: Nu.x, y: Nu.y - ridge };
      const ridgeS = { x: Su.x, y: Su.y - ridge };
      const slope = (eave: Vec2, fill: string): void => {
        ctx.beginPath();
        ctx.moveTo(Nu.x, Nu.y);
        ctx.lineTo(eave.x, eave.y);
        ctx.lineTo(Su.x, Su.y);
        ctx.lineTo(ridgeS.x, ridgeS.y);
        ctx.lineTo(ridgeN.x, ridgeN.y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = "#15110d";
        ctx.lineWidth = Math.max(1, 1.2 * z);
        ctx.stroke();
      };
      slope(Wu, c.roofHi); // west slope, lit
      slope(Eu, c.roof); // east slope, shadowed
      // Ridge beam.
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = Math.max(1, 1.4 * z);
      ctx.beginPath();
      ctx.moveTo(ridgeN.x, ridgeN.y);
      ctx.lineTo(ridgeS.x, ridgeS.y);
      ctx.stroke();
      if (b.kind === "barracks") {
        // Dark arched doorway on the front (south) wall + crossed-blades mark.
        ctx.fillStyle = "#1c1812";
        ctx.beginPath();
        ctx.ellipse(rcx, S.y - 5 * z, 4 * z, 6 * z, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#cdb27a";
        ctx.lineWidth = Math.max(1, 1.3 * z);
        ctx.beginPath();
        ctx.moveTo(rcx - 4 * z, rcy - 3 * z);
        ctx.lineTo(rcx + 4 * z, rcy + 3 * z);
        ctx.moveTo(rcx + 4 * z, rcy - 3 * z);
        ctx.lineTo(rcx - 4 * z, rcy + 3 * z);
        ctx.stroke();
      } else {
        // Farm: a little chimney with a warm ember glow.
        ctx.fillStyle = "#3a2f24";
        ctx.fillRect(rcx + half * 0.3, rcy - ridge - 5 * z, 3 * z, 7 * z);
        ctx.fillStyle = "rgba(255,150,55,0.8)";
        ctx.fillRect(rcx + half * 0.3, rcy - ridge - 6 * z, 3 * z, 2 * z);
      }
    } else if (b.kind === "temple") {
      // Pale columns on the front + a tall spire with an ember-lit window.
      ctx.strokeStyle = "#b8b1a0";
      ctx.lineWidth = Math.max(1, 2 * z);
      for (const fxr of [-0.5, 0, 0.5]) {
        const px = rcx + fxr * half * 0.8;
        ctx.beginPath();
        ctx.moveTo(px, S.y - 1 * z);
        ctx.lineTo(px, rcy + 2 * z);
        ctx.stroke();
      }
      // Spire.
      const spireH = 16 * z;
      ctx.beginPath();
      ctx.moveTo(rcx, rcy - spireH);
      ctx.lineTo(rcx - 5 * z, rcy);
      ctx.lineTo(rcx + 5 * z, rcy);
      ctx.closePath();
      ctx.fillStyle = c.roofHi;
      ctx.fill();
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
      // Glowing arched window.
      const glow = 0.55 + 0.3 * Math.abs(Math.sin(this.now * 2 + center.x * 0.05));
      ctx.fillStyle = `rgba(255,170,70,${glow.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(rcx, rcy - spireH * 0.45, 2.2 * z, 3.4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.kind === "townhall") {
      // Crenellated parapet (merlons) around the roof rim + a hearth window.
      ctx.fillStyle = c.roofHi;
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = Math.max(1, 1 * z);
      const merlons = 5;
      for (let i = 0; i <= merlons; i++) {
        const t = i / merlons;
        // Along the front-left edge (Wu→Su) and front-right (Su→Eu).
        const lx = Wu.x + (Su.x - Wu.x) * t;
        const ly = Wu.y + (Su.y - Wu.y) * t;
        const rx = Su.x + (Eu.x - Su.x) * t;
        const ry = Su.y + (Eu.y - Su.y) * t;
        for (const [mx, my] of [[lx, ly], [rx, ry]]) {
          ctx.fillRect(mx - 1.6 * z, my - 5 * z, 3.2 * z, 5 * z);
          ctx.strokeRect(mx - 1.6 * z, my - 5 * z, 3.2 * z, 5 * z);
        }
      }
      // Warm flickering hearth window on the front wall.
      const glow = 0.5 + 0.35 * Math.abs(Math.sin(this.now * 3 + center.x * 0.08));
      ctx.fillStyle = `rgba(255,150,55,${glow.toFixed(3)})`;
      ctx.fillRect(rcx - 4.5 * z, S.y - 9 * z, 9 * z, 7 * z);
      ctx.fillStyle = `rgba(255,226,150,${(glow * 0.85).toFixed(3)})`;
      ctx.fillRect(rcx - 2 * z, S.y - 7.6 * z, 4 * z, 4 * z);
    } else if (b.kind === "sawmill") {
      // A big circular saw blade on the roof + a stacked log pile in front.
      const r = 6 * z;
      ctx.fillStyle = "#9aa0a6";
      ctx.beginPath();
      ctx.arc(rcx - half * 0.2, rcy - 2 * z, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(rcx - half * 0.2, rcy - 2 * z);
        ctx.lineTo(rcx - half * 0.2 + Math.cos(a) * r, rcy - 2 * z + Math.sin(a) * r);
      }
      ctx.stroke();
      // Log pile (front).
      ctx.fillStyle = "#7a5a32";
      for (const [dx, dy] of [[-3, 0], [0, 0], [3, 0], [-1.5, -2.4], [1.5, -2.4]]) {
        ctx.beginPath();
        ctx.arc(rcx + half * 0.35 + dx * z, S.y - 3 * z + dy * z, 1.6 * z, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A generated iso stone rampart, drawn at the correct diagonal per connection. */
  private drawWall(world: World, b: import("../entities/Building.ts").Building): void {
    const ctx = this.ctx;
    const sprite = this.assets.wallSprite;
    if (!sprite) return; // footprint poly already drawn as a fallback foundation
    const gx = b.tile.x;
    const gy = b.tile.y;
    const has = (nx: number, ny: number): boolean =>
      world.buildings.some(
        (o) => !o.dead && o.kind === "wall" && o.playerId === b.playerId && o.tile.x === nx && o.tile.y === ny,
      );
    const E = has(gx + 1, gy);
    const W = has(gx - 1, gy);
    const N = has(gx, gy - 1);
    const S = has(gx, gy + 1);
    const ws = (wx: number, wy: number): Vec2 => this.cam.worldToScreen(wx, wy);
    const corners = [
      ws(gx * TILE, gy * TILE),
      ws((gx + 1) * TILE, gy * TILE),
      ws((gx + 1) * TILE, (gy + 1) * TILE),
      ws(gx * TILE, (gy + 1) * TILE),
    ];
    const [T, R, B, L] = corners; // top, right, bottom, left diamond vertices
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const maxY = Math.max(...corners.map((c) => c.y));
    const center = ws((gx + 0.5) * TILE, (gy + 0.5) * TILE);
    const cw = (sprite as HTMLCanvasElement).width;
    const ch = (sprite as HTMLCanvasElement).height;
    // Scale so a segment is a touch over a tile → adjacent walls just overlap into
    // a continuous run without spilling far onto a neighbouring bastion.
    const scale = ((maxX - minX) / cw) * 1.28;
    const dw = cw * scale;
    const dh = ch * scale;

    // The sprite runs "/" (lower-left → upper-right) = a N–S wall. Mirror → "\" = E–W.
    const blit = (mirror: boolean): void => {
      const dx = center.x - dw / 2;
      const dy = maxY - dh + (maxY - center.y) * 0.55; // base sits on the tile
      ctx.save();
      if (mirror) {
        ctx.translate(center.x * 2, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(sprite, dx, dy, dw, dh);
      ctx.restore();
    };

    void T; void R; void B; void L;
    const ns = N || S;
    const ew = E || W || (!N && !S && !E && !W); // isolated → default E–W ("\")
    const bastion = this.assets.bastionSprite;
    if (ns && ew && bastion) {
      // A junction (bend/T/cross) is a corner BASTION — bigger + taller than the
      // walls so the straight arms read as running INTO it, not over it.
      const bw2 = ((maxX - minX) / (bastion as HTMLCanvasElement).width) * 1.7;
      const bdw = (bastion as HTMLCanvasElement).width * bw2;
      const bdh = (bastion as HTMLCanvasElement).height * bw2;
      // Soft ground shadow so it grounds over the wall arms.
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(center.x, maxY - (maxY - center.y) * 0.2, bdw * 0.36, bdw * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(bastion, center.x - bdw / 2, maxY - bdh + (maxY - center.y) * 0.7, bdw, bdh);
    } else {
      if (ns) blit(false); // continuous "/" run
      if (ew) blit(true); // continuous "\" run
      if (ns && ew) this.drawWallPost(center, (maxX - minX) * 0.5); // fallback if no sprite
    }
  }

  /** A short crenellated stone pillar that caps a wall junction. */
  private drawWallPost(center: Vec2, tileW: number): void {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const rw = tileW * 0.28; // post radius (screen px)
    const rh = rw * 0.55; // iso ellipse squash
    const H = 46 * z; // a touch taller than the wall
    const cx = center.x;
    const baseY = center.y + 6 * z;
    const topY = baseY - H;
    // Shaft (two sides + fill).
    ctx.beginPath();
    ctx.moveTo(cx - rw, baseY);
    ctx.lineTo(cx - rw, topY);
    ctx.lineTo(cx + rw, topY);
    ctx.lineTo(cx + rw, baseY);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
    g.addColorStop(0, "#403a33");
    g.addColorStop(0.5, "#5c5349");
    g.addColorStop(1, "#3a342d");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#15110d";
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // Rounded base + top caps.
    ctx.fillStyle = "#3a342d";
    ctx.beginPath();
    ctx.ellipse(cx, baseY, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#6e6557";
    ctx.beginPath();
    ctx.ellipse(cx, topY, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Crenellation notches around the top rim.
    ctx.fillStyle = "#7c7264";
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const mx = cx + Math.cos(a) * rw * 0.8;
      const my = topY + Math.sin(a) * rh * 0.8;
      ctx.fillRect(mx - 2.4 * z, my - 5 * z, 4.8 * z, 6 * z);
    }
    // Rim light on the lit (upper-left) side.
    ctx.strokeStyle = "rgba(255,244,214,0.4)";
    ctx.lineWidth = Math.max(1, 1.3 * z);
    ctx.beginPath();
    ctx.moveTo(cx - rw, baseY);
    ctx.lineTo(cx - rw, topY);
    ctx.stroke();
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
    let strikeSwing = 0; // 0..1 attack swing, reused for a body squash below
    if (u.attackAnim > 0 && u.aim) {
      const dx = u.aim.x - u.pos.x;
      const dy = u.aim.y - u.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const phase = Math.min(1, u.attackAnim / 0.18); // 1 just struck → 0
      strikeSwing = Math.sin(phase * Math.PI); // 0 → 1 → 0, a lunge out and back
      const ranged = u.def.attackRange > 1;
      const reach = ranged ? -8 : 18; // melee thrusts in; ranged recoils back (world units)
      const amt = reach * strikeSwing;
      wx += (dx / d) * amt;
      wy += (dy / d) * amt;
    }
    const s = this.cam.worldToScreen(wx, wy);
    const r = UNIT_DRAW_R * z * (u.radius / 10);
    const color = world.player(u.playerId).color;

    // Generated sprite (if any) + its on-screen size, computed up front so the
    // ground ellipses can scale proportionally to the (large) sprite.
    // A gathering worker plays a 2-frame pickaxe swing instead of the idle sprite.
    let sprite = this.assets.unitSprite(u.kind, isEnemy);
    if (u.def.canGather && u.state === "gathering" && this.assets.mineFrames.length === 2) {
      sprite = this.assets.mineFrames[Math.floor(this.now * 6) % 2];
    } else if (u.kind === "footman" && !isEnemy && u.attackAnim > 0 && this.assets.footmanAtkFrames.length === 3) {
      // Play the 3-frame sword swing during an attack (strike → recover).
      const ph = u.attackAnim / 0.18; // 1 just struck → 0
      sprite = this.assets.footmanAtkFrames[ph > 0.6 ? 2 : ph > 0.3 ? 1 : 0];
    }
    let spriteW = 0;
    let spriteH = 0;
    if (sprite) {
      const cw = (sprite as HTMLCanvasElement).width;
      const ch = (sprite as HTMLCanvasElement).height;
      spriteH = r * 15.6; // unit sprite height relative to radius
      spriteW = spriteH * (cw / ch);
    }
    // Ground ellipse half-width: tied to the sprite footprint, else the body.
    const gw = sprite ? spriteW * 0.34 : r * 1.15;
    const ringY = s.y + r * 0.55;

    // Ground shadow for a little depth.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(s.x, ringY, gw, gw * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    // Team-colored base ring (ownership reads from the ring, not just the body).
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, 2.4 * z);
    ctx.beginPath();
    ctx.ellipse(s.x, ringY, gw, gw * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (u.selected) {
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = Math.max(2, 2.4 * z);
      ctx.beginPath();
      ctx.ellipse(s.x, ringY, gw * 1.1, gw * 0.55, 0, 0, Math.PI * 2);
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
      const ph = (u.pos.x + u.pos.y) * 0.13;
      by -= Math.abs(Math.sin(ph)) * 4.5 * z; // walk bob (footfalls)
      bx += Math.sin(ph * 0.5) * 2.2 * z; // gentle side-to-side sway
    } else if (u.state !== "gathering") {
      // Idle breathing — gentle, phase-offset per unit so they don't pulse in unison.
      by -= Math.sin(this.now * 2 + (u.pos.x + u.pos.y) * 0.5) * 1.2 * z;
    }
    // Hit-react: a brief flinch (drop + squash) the instant a unit is struck.
    const hitReact = u.hitFlash > 0 ? Math.min(1, u.hitFlash / 0.12) : 0;
    if (hitReact) by += hitReact * 2.5 * z;

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

    // Veteran aura: battle-hardened units carry a faint gold halo (elite accent).
    const vAura = veterancyRank(u.kills);
    if (vAura >= 1) {
      ctx.strokeStyle = vAura >= 2 ? "rgba(255,205,90,0.9)" : "rgba(228,178,80,0.5)";
      ctx.lineWidth = Math.max(1, (vAura >= 2 ? 2 : 1.4) * z);
      ctx.beginPath();
      ctx.ellipse(bx, by + r * 0.4, r * 1.2, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Prefer a generated sprite (Pixelcut). Fall back to the code-art figure.
    const pal = UNIT_BODY[u.kind] ?? { tunic: "#6b5e48", head: "#c9a06a" };
    const ink = "#15110d";
    if (sprite) {
      // Determine screen-facing from attack aim or movement; mirror to face it.
      const face = u.attackAnim > 0 && u.aim ? u.aim : u.finalTarget;
      if (face) {
        const fs = this.cam.worldToScreen(face.x, face.y);
        if (fs.x < s.x - 1) u.faceLeft = true;
        else if (fs.x > s.x + 1) u.faceLeft = false;
      }
      const footY = by + r * 0.55;
      // Squash/stretch: stretch toward the target on a swing; compress on a hit.
      const sw2 = spriteW * (1 + 0.16 * strikeSwing + 0.1 * hitReact);
      const sh2 = spriteH * (1 - 0.09 * strikeSwing - 0.12 * hitReact);
      ctx.save();
      if (u.faceLeft) {
        ctx.translate(bx * 2, 0); // mirror across the unit's vertical axis
        ctx.scale(-1, 1);
      }
      ctx.drawImage(sprite, bx - sw2 / 2, footY - sh2, sw2, sh2); // feet at base ring
      ctx.restore();
      // Frost tint: a soft blue glow over the figure while chilled.
      if (u.chillFx > 0) {
        ctx.globalAlpha = Math.min(1, u.chillFx / 4) * 0.32;
        ctx.fillStyle = "#7fd0ff";
        ctx.beginPath();
        ctx.ellipse(bx, footY - spriteH * 0.5, spriteW * 0.42, spriteH * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (u.kind === "catapult") {
      this.drawSiegeEngine(bx, by, r);
    } else {
      const he = r * 0.46; // head radius
      const headY = by - r * 0.62;
      const torsoTop = by - r * 0.12;
      const torsoBot = by + r * 0.78;
      const tw = r * 0.82; // torso half-width at the shoulders
      // Legs.
      ctx.strokeStyle = "#241f1a";
      ctx.lineWidth = Math.max(1.5, 2.2 * z);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx - tw * 0.4, torsoBot - r * 0.05);
      ctx.lineTo(bx - tw * 0.5, by + r * 1.02);
      ctx.moveTo(bx + tw * 0.4, torsoBot - r * 0.05);
      ctx.lineTo(bx + tw * 0.5, by + r * 1.02);
      ctx.stroke();
      // Torso (tunic) — a tapered cloak shape.
      ctx.beginPath();
      ctx.moveTo(bx - tw, torsoBot);
      ctx.quadraticCurveTo(bx - tw * 1.05, torsoTop, bx - tw * 0.55, torsoTop - r * 0.08);
      ctx.lineTo(bx + tw * 0.55, torsoTop - r * 0.08);
      ctx.quadraticCurveTo(bx + tw * 1.05, torsoTop, bx + tw, torsoBot);
      ctx.closePath();
      ctx.fillStyle = pal.tunic;
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.stroke();
      // Rim light down the left of the torso.
      ctx.strokeStyle = "rgba(255,244,214,0.5)";
      ctx.lineWidth = Math.max(1, 1.1 * z);
      ctx.beginPath();
      ctx.moveTo(bx - tw * 0.82, torsoBot - r * 0.25);
      ctx.quadraticCurveTo(bx - tw * 0.92, torsoTop + r * 0.1, bx - tw * 0.5, torsoTop);
      ctx.stroke();
      // Head.
      ctx.fillStyle = pal.head;
      ctx.beginPath();
      ctx.arc(bx, headY, he, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, 1.4 * z);
      ctx.stroke();
      // Knight gets a steel helm cap; peon a simple hood brim.
      if (u.kind === "knight") {
        ctx.fillStyle = "#8a909a";
        ctx.beginPath();
        ctx.arc(bx, headY - he * 0.15, he, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1, 1 * z);
        ctx.stroke();
      }
    }

    // Per-kind weapon silhouette (code-art only; generated sprites include weapons).
    if (!sprite) {
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
      // Human: wood-handled tool with a steel head. Enemy: a crude dark bone pick.
      ctx.strokeStyle = isEnemy ? "#4a4640" : "#6b4a2a";
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.3, by + r * 0.5);
      ctx.lineTo(bx + r * 0.35, by - r * 0.65);
      ctx.stroke();
      ctx.fillStyle = isEnemy ? "#cfc7b4" : "#8a8f96"; // bone vs steel head
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

    if (u.hp < u.def.maxHp || u.selected || (u.def.maxMana && u.mana < u.def.maxMana)) {
      // Size + place the bar relative to the (large) sprite, not the tiny body.
      const hpW = sprite ? gw * 1.7 : r * 2;
      const hpY = sprite ? by + r * 0.55 - spriteH - 6 * z : by - r - 8 * z;
      const barH = Math.max(5, Math.min(hpW * 0.07, 10));
      this.drawHpBar(bx - hpW / 2, hpY, hpW, u.hp / u.def.maxHp, !isEnemy);
      // Mana bar (blue) just below the HP bar, for spellcasters.
      if (u.def.maxMana) {
        const my = hpY + barH + 2 * z;
        const mh = Math.max(3, barH * 0.7);
        ctx.fillStyle = "#15110d";
        ctx.fillRect(bx - hpW / 2 - 1, my - 1, hpW + 2, mh + 2);
        ctx.fillStyle = "#1a2440";
        ctx.fillRect(bx - hpW / 2, my, hpW, mh);
        ctx.fillStyle = "#4a86e8";
        ctx.fillRect(bx - hpW / 2, my, hpW * Math.max(0, u.mana / u.def.maxMana), mh);
      }
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
    const h = Math.max(5, Math.min(w * 0.07, 10)); // thicker, but capped so big buildings aren't huge
    const f = Math.max(0, Math.min(1, frac));
    // Inked border + dark recessed track for a beveled, 3D look.
    ctx.fillStyle = "#15110d";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = "#241f1a";
    ctx.fillRect(x, y, w, h);
    // Health-graded fill with a top→bottom gradient.
    const stops =
      f > 0.6 ? (friendly ? ["#8fe88f", "#3c8a3c"] : ["#74c074", "#327032"])
      : f > 0.3 ? ["#f2cb52", "#9a7212"]
      : ["#e85c42", "#8c2216"];
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * f, h);
    // Glossy top highlight.
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x, y, w * f, Math.max(1, h * 0.3));
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
    // Preview the Temple's heal aura (green) before placing it.
    if (def.healRadius) {
      const z = this.cam.zoom;
      const c = this.cam.worldToScreen((p.tile.x + fp / 2) * TILE, (p.tile.y + fp / 2) * TILE);
      const rr = def.healRadius * TILE * z;
      ctx.save();
      ctx.strokeStyle = "rgba(127,221,138,0.5)";
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
    // `ps` floors the on-screen size so projectiles stay readable when zoomed out.
    const ps = Math.max(z, 0.85);
    for (const p of fx.projectiles) {
      const k = p.t / p.dur;
      const wx = p.from.x + (p.to.x - p.from.x) * k;
      const wy = p.from.y + (p.to.y - p.from.y) * k;
      const s = this.cam.worldToScreen(wx, wy);
      // Mage / dragon: a glowing bolt with a comet trail.
      if (p.magic || p.fire) {
        const arc = (kk: number): { x: number; y: number } => {
          const px = this.cam.worldToScreen(
            p.from.x + (p.to.x - p.from.x) * kk,
            p.from.y + (p.to.y - p.from.y) * kk,
          );
          return { x: px.x, y: px.y - Math.sin(kk * Math.PI) * 10 * ps };
        };
        const R = (p.fire ? 13 : 11) * ps;
        // Comet trail: fading orbs behind the head.
        for (let i = 4; i >= 1; i--) {
          const tk = Math.max(0, k - i * 0.05);
          const tp = arc(tk);
          const tr = R * (0.85 - i * 0.13);
          ctx.globalAlpha = 0.32 * (1 - i / 5);
          ctx.fillStyle = p.fire ? "#ff8a2e" : "#5aa0ff";
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, Math.max(1, tr), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        const o = arc(k);
        const grd = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R);
        if (p.fire) {
          grd.addColorStop(0, "rgba(255,240,190,0.97)");
          grd.addColorStop(0.4, "rgba(255,140,40,0.9)");
          grd.addColorStop(1, "rgba(150,40,10,0)");
        } else {
          grd.addColorStop(0, "rgba(210,238,255,0.97)");
          grd.addColorStop(0.4, "rgba(90,160,255,0.88)");
          grd.addColorStop(1, "rgba(60,90,220,0)");
        }
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(o.x, o.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.fire ? "#fff2d6" : "#eaf4ff";
        ctx.beginPath();
        ctx.arc(o.x, o.y, 4 * ps, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // Siege: a dark stone on a high lob, not an arrow.
      if (p.heavy) {
        const lift2 = Math.sin(k * Math.PI) * 34 * ps;
        ctx.fillStyle = "#33302b";
        ctx.beginPath();
        ctx.arc(s.x, s.y - lift2, 9 * ps, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        continue;
      }
      const lift = Math.sin(k * Math.PI) * 18 * ps;
      const sFrom = this.cam.worldToScreen(p.from.x, p.from.y);
      const sTo = this.cam.worldToScreen(p.to.x, p.to.y);
      const ang = Math.atan2(sTo.y - sFrom.y, sTo.x - sFrom.x);
      ctx.save();
      ctx.translate(s.x, s.y - lift);
      ctx.rotate(ang);
      // Faint motion streak behind the arrow.
      ctx.strokeStyle = "rgba(230,236,242,0.28)";
      ctx.lineWidth = 2 * ps;
      ctx.beginPath();
      ctx.moveTo(-46 * ps, 0);
      ctx.lineTo(-20 * ps, 0);
      ctx.stroke();
      // Shaft (inked, with a lighter wood highlight) — bigger + clearer.
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = 6 * ps;
      ctx.beginPath();
      ctx.moveTo(-22 * ps, 0);
      ctx.lineTo(15 * ps, 0);
      ctx.stroke();
      ctx.strokeStyle = "#d8c074";
      ctx.lineWidth = 3.2 * ps;
      ctx.beginPath();
      ctx.moveTo(-22 * ps, 0);
      ctx.lineTo(15 * ps, 0);
      ctx.stroke();
      // Steel head.
      ctx.fillStyle = "#e6ecf2";
      ctx.strokeStyle = "#15110d";
      ctx.lineWidth = 1.4 * ps;
      ctx.beginPath();
      ctx.moveTo(24 * ps, 0);
      ctx.lineTo(11 * ps, -7 * ps);
      ctx.lineTo(11 * ps, 7 * ps);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Fletching feathers at the tail.
      ctx.fillStyle = "#c45a3a";
      ctx.beginPath();
      ctx.moveTo(-22 * ps, 0);
      ctx.lineTo(-30 * ps, -6 * ps);
      ctx.lineTo(-18 * ps, 0);
      ctx.lineTo(-30 * ps, 6 * ps);
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
      const y = s.y - 24 * z - k * 60 * z;
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.font = `bold ${Math.floor(80 * z)}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, 10 * z);
      ctx.strokeStyle = "#15110d";
      ctx.strokeText(f.text, s.x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, s.x, y);
      ctx.globalAlpha = 1;
    }

    // Spell blasts: a fiery explosion (Fireball) or an icy nova (Freeze).
    for (const b of fx.blasts) {
      const k = b.t / b.dur; // 0..1
      const c = this.cam.worldToScreen(b.x, b.y);
      const ry = ISO_HALF_H / ISO_HALF_W; // iso squash for ground rings
      // Radius in SCREEN px so the blast actually covers its tile AoE (and then
      // some, for the shockwave) — ISO_HALF_W px per world tile.
      if (b.kind === "fire") {
        const R = 2.6 * ISO_HALF_W * z * (0.35 + k * 1.0) * b.scale;
        // Expanding fire ring.
        const grd = ctx.createRadialGradient(c.x, c.y, R * 0.15, c.x, c.y, R);
        grd.addColorStop(0, `rgba(255,245,200,${(1 - k) * 0.95})`);
        grd.addColorStop(0.45, `rgba(255,140,40,${(1 - k) * 0.85})`);
        grd.addColorStop(0.8, `rgba(180,50,15,${(1 - k) * 0.55})`);
        grd.addColorStop(1, "rgba(90,20,8,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R, R * ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // A rolling shock ring at the leading edge.
        ctx.strokeStyle = `rgba(255,200,110,${(1 - k) * 0.7})`;
        ctx.lineWidth = Math.max(2, 7 * z * (1 - k));
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R, R * ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Flying embers/debris (more, bigger, flung farther).
        ctx.fillStyle = `rgba(255,180,60,${1 - k})`;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + b.x;
          const dr = R * (0.75 + (i % 4) * 0.1);
          const ex = c.x + Math.cos(a) * dr;
          const ey = c.y + Math.sin(a) * dr * ry - k * 40 * z;
          ctx.beginPath();
          ctx.arc(ex, ey, (6 - k * 4) * z + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        // Bright core flash early on.
        if (k < 0.45) {
          ctx.fillStyle = `rgba(255,255,240,${(0.45 - k) * 2})`;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, R * 0.55, R * 0.55 * ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const R = 3.2 * ISO_HALF_W * z * (0.35 + k * 1.0) * b.scale;
        // Icy nova ring (double ring for heft).
        ctx.strokeStyle = `rgba(150,220,255,${(1 - k) * 0.95})`;
        ctx.lineWidth = Math.max(3, 9 * z * (1 - k));
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R, R * ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(210,240,255,${(1 - k) * 0.6})`;
        ctx.lineWidth = Math.max(1.5, 4 * z * (1 - k));
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R * 0.82, R * 0.82 * ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        const grd = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
        grd.addColorStop(0, `rgba(180,230,255,${(1 - k) * 0.45})`);
        grd.addColorStop(1, "rgba(120,180,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, R, R * ry, 0, 0, Math.PI * 2);
        ctx.fill();
        // Ice shards radiating out (more + longer).
        ctx.strokeStyle = `rgba(220,245,255,${1 - k})`;
        ctx.lineWidth = Math.max(1.5, 3 * z);
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const dr = R * 0.85;
          const sx = c.x + Math.cos(a) * dr;
          const sy = c.y + Math.sin(a) * dr * ry;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.cos(a) * 18 * z, sy + Math.sin(a) * 18 * z * ry);
          ctx.stroke();
        }
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
