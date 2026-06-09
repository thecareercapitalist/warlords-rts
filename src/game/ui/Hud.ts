import type { World } from "../World.ts";
import type { Camera } from "../Camera.ts";
import type { Unit } from "../entities/Unit.ts";
import { veterancyRank, veterancyMult } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { BuildingKind, UnitKind, Vec2 } from "../types.ts";
import { MAP_W, MAP_H, TILE, COLORS } from "../constants.ts";
import { UNIT_DEFS, BUILDING_DEFS } from "../entities/defs.ts";
import { clamp, type Rect, rectContains } from "../util/math.ts";
import { SPELL_LIST, type SpellId } from "../systems/spells.ts";
import type { Assets } from "../render/assets.ts";
import { drawCorners, draw9Slice } from "./frame.ts";

export type HudAction =
  | { type: "build"; kind: BuildingKind }
  | { type: "train"; kind: UnitKind }
  | { type: "cancel" }
  | { type: "cancelUnit" }
  | { type: "stop" }
  | { type: "move" }
  | { type: "attackMove" }
  | { type: "patrol" }
  | { type: "hold" }
  | { type: "warcry" }
  | { type: "spell"; id: SpellId }
  | { type: "denied"; label: string; reason: string };

interface Button {
  rect: Rect;
  label: string;
  sub: string;
  hotkey: string;
  action: HudAction;
  enabled: boolean;
  autocast?: boolean; // spell button: autocast is on for the selection
  cooldown?: number; // 0..1 remaining fraction → draws a darkening sweep
}

const BAR_H = 150;

export class Hud {
  private buttons: Button[] = [];
  minimapRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  barRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private attackPing: { x: number; y: number; t: number } | null = null;
  // Clickable top-bar hot regions, recomputed each render.
  private idleWorkerRect: Rect | null = null;
  /** Close (×) box on the first-run hints card; click dismisses it. */
  hintsCloseRect: Rect | null = null;
  private idleBuildingRect: Rect | null = null;
  private groupChips: { n: number; rect: Rect }[] = [];
  /** Set by Game once loaded — lets command buttons show sprite icons. */
  assets: Assets | null = null;
  /** Set by Game (decays over ~0.45s); reddens the resource bar on a denied action. */
  denyFlash = 0;
  /** Set by Game each frame: War Cry cooldown seconds + its max, for the command button. */
  warcryCd = 0;
  warcryMax = 35;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  get barHeight(): number {
    return BAR_H;
  }

  layout(cam: Camera): void {
    const y = cam.viewH - BAR_H;
    this.barRect = { x: 0, y, w: cam.viewW, h: BAR_H };
    this.minimapRect = { x: 10, y: y + 10, w: BAR_H - 20, h: BAR_H - 20 };
  }

  /** True if the pointer is over any HUD chrome (so the world ignores it). */
  isOverUi(p: Vec2): boolean {
    return rectContains(this.barRect, p);
  }

  // --- Command buttons ----------------------------------------------------

  rebuildButtons(world: World, humanId: number, units: Unit[], buildings: Building[]): void {
    this.buttons = [];
    const baseX = this.minimapRect.x + this.minimapRect.w + 230;
    const baseY = this.barRect.y + 20;
    const bw = 78;
    const bh = 38;
    const gap = 8;

    const place = (i: number): Rect => ({
      x: baseX + (i % 4) * (bw + gap),
      y: baseY + Math.floor(i / 4) * (bh + gap),
      w: bw,
      h: bh,
    });

    const p = world.player(humanId);
    const hasWorker = units.some((u) => u.def.canBuild);
    const completedKinds = new Set(
      world.buildingsOf(humanId).filter((b) => b.state === "complete").map((b) => b.kind),
    );

    if (hasWorker) {
      // Left-hand hotkeys that AVOID W/A/S/D (those pan the camera) and the global
      // unit-command keys, so a build key never double-fires with movement.
      const builds: { kind: BuildingKind; key: string }[] = [
        { kind: "farm", key: "F" },
        { kind: "barracks", key: "B" },
        { kind: "sawmill", key: "R" },
        { kind: "temple", key: "T" },
        { kind: "forge", key: "G" },
        { kind: "tower", key: "V" },
        { kind: "wall", key: "C" },
        { kind: "enclave", key: "Q" },
        { kind: "townhall", key: "Z" },
      ];
      builds.forEach(({ kind, key }, i) => {
        const d = BUILDING_DEFS[kind];
        this.buttons.push({
          rect: place(i),
          label: d.label,
          sub: `${d.costGold}g${d.costWood ? " " + d.costWood + "w" : ""}`,
          hotkey: key,
          action: { type: "build", kind },
          enabled: p.gold >= d.costGold && p.wood >= d.costWood,
        });
      });
      this.buttons.push({
        rect: place(builds.length),
        label: "Stop",
        sub: "X",
        hotkey: "X",
        action: { type: "stop" },
        enabled: true,
      });
      return;
    }

    // Mage(s) selected → spell buttons (left-click = cast, right-click = autocast),
    // PLUS the standard movement commands incl. Patrol (mages are units too).
    const mages = units.filter((u) => u.kind === "mage" && u.playerId === humanId);
    if (mages.length > 0 && buildings.length === 0) {
      const held = mages.some((m) => m.holdGround);
      let i = 0;
      SPELL_LIST.forEach((sp) => {
        this.buttons.push({
          rect: place(i++),
          label: sp.label,
          sub: `${sp.cost} mana`,
          hotkey: sp.hotkey,
          action: { type: "spell", id: sp.id },
          enabled: true,
          autocast: mages.some((m) => m.autocast === sp.id),
        });
      });
      const mageCmds: { label: string; key: string; action: HudAction }[] = [
        { label: "Move", key: "M", action: { type: "move" } },
        { label: "Stop", key: "X", action: { type: "stop" } },
        { label: "Patrol", key: "R", action: { type: "patrol" } },
        { label: held ? "Unhold" : "Hold", key: "H", action: { type: "hold" } },
      ];
      for (const c of mageCmds) {
        this.buttons.push({
          rect: place(i++),
          label: c.label,
          sub: c.key,
          hotkey: c.key,
          action: c.action,
          enabled: true,
          autocast: c.action.type === "hold" && held,
        });
      }
      return;
    }

    // Own combat units selected (no worker/mage/building) → command buttons.
    const fighters = units.filter(
      (u) => u.playerId === humanId && u.def.damage > 0 && !u.def.canGather && u.kind !== "mage",
    );
    if (fighters.length > 0 && buildings.length === 0) {
      const held = fighters.some((u) => u.holdGround);
      const cmds: { label: string; key: string; action: HudAction }[] = [
        { label: "Move", key: "M", action: { type: "move" } },
        { label: "Attack", key: "Q", action: { type: "attackMove" } },
        { label: "Stop", key: "X", action: { type: "stop" } },
        { label: "Patrol", key: "R", action: { type: "patrol" } },
        { label: held ? "Unhold" : "Hold", key: "H", action: { type: "hold" } },
        { label: "War Cry", key: "F", action: { type: "warcry" } },
      ];
      cmds.forEach((c, i) => {
        const isCry = c.action.type === "warcry";
        this.buttons.push({
          rect: place(i),
          label: c.label,
          sub: isCry ? "+30% atk · 6s" : c.key,
          hotkey: c.key,
          action: c.action,
          enabled: !isCry || this.warcryCd <= 0,
          autocast: c.action.type === "hold" && held,
          cooldown: isCry && this.warcryCd > 0 ? this.warcryCd / this.warcryMax : undefined,
        });
      });
      return;
    }

    // Single production building selected → train buttons.
    // Left-hand hotkeys clear of W/A/S/D (camera) and the global command keys.
    const trainKey: Partial<Record<UnitKind, string>> = {
      peon: "Q",
      footman: "F",
      archer: "R",
      knight: "T",
      catapult: "C",
      mage: "G",
      dragon: "V",
    };
    const prod = buildings.find((b) => b.def.produces.length > 0 && b.state === "complete");
    if (prod) {
      prod.def.produces.forEach((kind, i) => {
        const d = UNIT_DEFS[kind];
        const techOk = !d.requiresBuilding || completedKinds.has(d.requiresBuilding);
        const sub = !techOk
          ? `needs ${BUILDING_DEFS[d.requiresBuilding!].label}`
          : `${d.costGold}g${d.costWood ? " " + d.costWood + "w" : ""} · ${d.supply}p`;
        this.buttons.push({
          rect: place(i),
          label: d.label,
          sub,
          hotkey: trainKey[kind] ?? d.label[0].toUpperCase(),
          action: { type: "train", kind },
          enabled: techOk && p.gold >= d.costGold && p.wood >= d.costWood,
        });
      });
      // Cancel the last queued unit (refund) when something is training.
      if (prod.queue.length > 0) {
        this.buttons.push({
          rect: place(prod.def.produces.length),
          label: "Cancel",
          sub: `queue ${prod.queue.length}`,
          hotkey: "C",
          action: { type: "cancelUnit" },
          enabled: true,
        });
      }
      return;
    }

    // An unfinished building selected → offer Cancel (with refund).
    const cancellable = buildings.find((b) => b.playerId === humanId && b.state !== "complete");
    if (cancellable) {
      this.buttons.push({
        rect: place(0),
        label: "Cancel",
        sub: "refund",
        hotkey: "C",
        action: { type: "cancel" },
        enabled: true,
      });
    }
  }

  hitTestCommand(p: Vec2): HudAction | null {
    for (const b of this.buttons) {
      if (!rectContains(b.rect, p)) continue;
      if (b.enabled) return b.action;
      // Disabled button → explain why (cost / prerequisite) instead of ignoring.
      return { type: "denied", label: b.label, reason: b.sub };
    }
    return null;
  }

  hotkeyAction(key: string): HudAction | null {
    for (const b of this.buttons) {
      if (b.enabled && b.hotkey.toLowerCase() === key.toLowerCase()) return b.action;
    }
    return null;
  }

  /** Spell id under a point, if any (used for right-click autocast toggle). */
  spellButtonAt(p: Vec2): SpellId | null {
    for (const b of this.buttons) {
      if (rectContains(b.rect, p) && b.action.type === "spell") return b.action.id;
    }
    return null;
  }

  /** Click target in the top bar (idle pills / control-group chips), if any. */
  topHit(
    p: Vec2,
  ): { type: "idleWorkers" } | { type: "idleBuildings" } | { type: "group"; n: number } | null {
    if (this.idleWorkerRect && rectContains(this.idleWorkerRect, p)) return { type: "idleWorkers" };
    if (this.idleBuildingRect && rectContains(this.idleBuildingRect, p)) return { type: "idleBuildings" };
    for (const c of this.groupChips) if (rectContains(c.rect, p)) return { type: "group", n: c.n };
    return null;
  }

  // --- Minimap ------------------------------------------------------------

  minimapToWorld(p: Vec2): Vec2 {
    const fx = (p.x - this.minimapRect.x) / this.minimapRect.w;
    const fy = (p.y - this.minimapRect.y) / this.minimapRect.h;
    return {
      x: clamp(fx, 0, 1) * MAP_W * TILE,
      y: clamp(fy, 0, 1) * MAP_H * TILE,
    };
  }

  isOverMinimap(p: Vec2): boolean {
    return rectContains(this.minimapRect, p);
  }

  // --- Rendering ----------------------------------------------------------

  render(
    world: World,
    cam: Camera,
    humanId: number,
    units: Unit[],
    buildings: Building[],
    fogVis: Uint8Array,
    message: string | null,
    attackPing: { x: number; y: number; t: number } | null = null,
    groups: Map<number, Unit[]> = new Map(),
  ): void {
    const ctx = this.ctx;
    const p = world.player(humanId);
    this.attackPing = attackPing;

    // Top resource bar — beveled dark stone with an ember underline.
    const tg = ctx.createLinearGradient(0, 0, 0, 34);
    tg.addColorStop(0, "#23211c");
    tg.addColorStop(0.5, "#16140f");
    tg.addColorStop(1, "#0c0b08");
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, cam.viewW, 34);
    // Brief red wash when an action was denied for cost — visual echo of the buzz.
    if (this.denyFlash > 0) {
      ctx.fillStyle = `rgba(196,73,47,${Math.min(0.5, this.denyFlash) * 0.6})`;
      ctx.fillRect(0, 0, cam.viewW, 34);
    }
    ctx.fillStyle = "rgba(255,244,214,0.12)"; // top highlight
    ctx.fillRect(0, 0, cam.viewW, 1);
    ctx.fillStyle = COLORS.uiEmber;
    ctx.fillRect(0, 33, cam.viewW, 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 35, cam.viewW, 2);
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.uiGold;
    ctx.fillText(`⛂ Gold ${Math.floor(p.gold)}`, 16, 17);
    ctx.fillStyle = COLORS.uiWood;
    ctx.fillText(`🌲 Wood ${Math.floor(p.wood)}`, 170, 17);
    // Supply: amber when nearly full, pulsing red + an actionable hint when capped
    // (so a new player knows to build a Farm rather than wondering why training fails).
    const capped = p.supplyUsed >= p.supplyCap;
    const near = !capped && p.supplyUsed >= p.supplyCap - 2;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
    ctx.fillStyle = capped ? `rgba(226,92,60,${pulse})` : near ? "#d8a24a" : COLORS.uiText;
    ctx.fillText(`👤 Supply ${p.supplyUsed}/${p.supplyCap}`, 320, 17);
    if (capped) {
      ctx.font = "bold 13px 'Segoe UI', sans-serif";
      ctx.fillStyle = `rgba(226,92,60,${pulse})`;
      ctx.fillText("⚠ Build a Farm", 436, 17);
      ctx.font = "16px 'Segoe UI', sans-serif";
    }
    // Idle indicators as clickable pills (right-aligned so they never collide with
    // the resource readouts). Stored rects drive the click handlers.
    this.idleWorkerRect = null;
    this.idleBuildingRect = null;
    const idle = this.idleWorkerCount(world, humanId);
    const idleProd = this.idleProductionCount(world, humanId);
    let px = cam.viewW - 14;
    const pill = (label: string): Rect => {
      ctx.font = "14px 'Segoe UI', sans-serif";
      const w = ctx.measureText(label).width + 22;
      const r: Rect = { x: px - w, y: 5, w, h: 24 };
      px -= w + 8;
      ctx.fillStyle = "rgba(217,138,50,0.16)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "rgba(217,138,50,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = COLORS.uiEmber;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      return r;
    };
    if (idleProd > 0) this.idleBuildingRect = pill(`⚑ ${idleProd} idle bldg`);
    if (idle > 0) this.idleWorkerRect = pill(`⚒ ${idle} idle`);

    // Control-group chips strip just under the resource bar.
    this.groupChips = [];
    let gx = 14;
    const gy = 40;
    for (let i = 1; i <= 10; i++) {
      const n = i % 10; // show 1..9 then 0
      const grp = (groups.get(n) ?? []).filter((u) => !u.dead);
      if (grp.length === 0) continue;
      const w = 40;
      const r: Rect = { x: gx, y: gy, w, h: 20 };
      this.groupChips.push({ n, rect: r });
      gx += w + 5;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, "#34302a");
      g.addColorStop(1, "#1d1a15");
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "rgba(217,138,50,0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = "#f3e8c8";
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${n}`, r.x + 5, r.y + r.h / 2);
      ctx.fillStyle = "#9fb2c2";
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${grp.length}`, r.x + r.w - 5, r.y + r.h / 2);
    }

    // Transient message as a floating banner below the top bars (never overlaps).
    if (message) {
      ctx.font = "bold 15px 'Segoe UI', sans-serif";
      const mw = ctx.measureText(message).width + 28;
      const my = this.groupChips.length > 0 ? 68 : 44;
      const mx = cam.viewW / 2 - mw / 2;
      ctx.fillStyle = "rgba(12,11,8,0.82)";
      ctx.fillRect(mx, my, mw, 26);
      ctx.strokeStyle = "rgba(217,138,50,0.7)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mx, my, mw, 26);
      ctx.fillStyle = COLORS.uiEmber;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, cam.viewW / 2, my + 13);
    }

    // Bottom command bar — beveled dark stone with an ember top edge + a carved
    // inset around the command-card area for a gothic console feel.
    const by0 = this.barRect.y;
    const bg = ctx.createLinearGradient(0, by0, 0, by0 + this.barRect.h);
    bg.addColorStop(0, "#201d18");
    bg.addColorStop(0.12, "#16140f");
    bg.addColorStop(1, "#0b0a07");
    ctx.fillStyle = bg;
    ctx.fillRect(this.barRect.x, by0, this.barRect.w, this.barRect.h);
    // Ember top edge with a thin highlight + shadow for a raised lip.
    ctx.fillStyle = "rgba(255,244,214,0.10)";
    ctx.fillRect(this.barRect.x, by0 - 1, this.barRect.w, 1);
    ctx.fillStyle = COLORS.uiEmber;
    ctx.fillRect(this.barRect.x, by0, this.barRect.w, 2);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(this.barRect.x, by0 + 2, this.barRect.w, 3);
    // Ornate forged-iron corner brackets on the command console.
    if (this.assets?.frameSprite) {
      drawCorners(ctx, this.assets.frameSprite, { x: this.barRect.x + 2, y: by0 + 2, w: this.barRect.w - 4, h: this.barRect.h - 4 }, 30);
    }
    // Subtle vertical divider stones between minimap / info / command sections.
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    const dx1 = this.minimapRect.x + this.minimapRect.w + 14;
    const dx2 = this.minimapRect.x + this.minimapRect.w + 222;
    for (const dx of [dx1, dx2]) {
      ctx.beginPath();
      ctx.moveTo(dx, by0 + 12);
      ctx.lineTo(dx, by0 + this.barRect.h - 12);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,244,214,0.06)";
      ctx.beginPath();
      ctx.moveTo(dx + 1, by0 + 12);
      ctx.lineTo(dx + 1, by0 + this.barRect.h - 12);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
    }

    this.renderMinimap(world, cam, humanId, fogVis);
    this.renderSelectionInfo(world, humanId, units, buildings);
    this.renderButtons();
  }

  private renderMinimap(world: World, cam: Camera, humanId: number, fogVis: Uint8Array): void {
    const ctx = this.ctx;
    const r = this.minimapRect;
    const sx = r.w / MAP_W;
    const sy = r.h / MAP_H;

    ctx.fillStyle = "#000";
    ctx.fillRect(r.x, r.y, r.w, r.h);

    // Terrain (only explored tiles).
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const lvl = fogVis[ty * MAP_W + tx];
        if (lvl === 0) continue;
        const t = world.map.at(tx, ty)!;
        let c = "#3f6b35";
        if (t.terrain === "water") c = "#2a4d80";
        else if (t.terrain === "forest") c = "#234d22";
        else if (t.terrain === "rock") c = "#5b5b5b";
        else if (t.terrain === "goldmine") c = "#caa12a";
        ctx.fillStyle = c;
        ctx.fillRect(r.x + tx * sx, r.y + ty * sy, sx + 0.5, sy + 0.5);
      }
    }

    // Entities (visible only for enemies).
    for (const b of world.buildings) {
      if (b.dead) continue;
      if (b.playerId !== humanId && fogVis[b.tile.y * MAP_W + b.tile.x] !== 2) continue;
      ctx.fillStyle = world.player(b.playerId).color;
      ctx.fillRect(r.x + b.tile.x * sx, r.y + b.tile.y * sy, sx * b.footprint, sy * b.footprint);
    }
    for (const u of world.units) {
      if (u.dead) continue;
      const t = u.tile();
      if (u.playerId !== humanId && fogVis[t.y * MAP_W + t.x] !== 2) continue;
      ctx.fillStyle = world.player(u.playerId).color;
      ctx.fillRect(r.x + t.x * sx, r.y + t.y * sy, Math.max(2, sx), Math.max(2, sy));
    }

    // Camera viewport rectangle (bounding tile range of the visible diamond).
    const range = cam.visibleTileRange();
    const v0x = r.x + (range.x0 / MAP_W) * r.w;
    const v0y = r.y + (range.y0 / MAP_H) * r.h;
    const vw = ((range.x1 - range.x0 + 1) / MAP_W) * r.w;
    const vh = ((range.y1 - range.y0 + 1) / MAP_H) * r.h;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(v0x, v0y, vw, vh);

    // Pulsing ember ping where the player is under attack.
    if (this.attackPing) {
      const ping = this.attackPing;
      const mmx = r.x + (ping.x / (MAP_W * TILE)) * r.w;
      const mmy = r.y + (ping.y / (MAP_H * TILE)) * r.h;
      const pulse = 3 + Math.abs(Math.sin(ping.t * 6)) * 4;
      const alpha = Math.max(0, 1 - ping.t / 4);
      ctx.strokeStyle = `rgba(217,138,50,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mmx, mmy, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = COLORS.uiPanelEdge;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private renderSelectionInfo(
    world: World,
    humanId: number,
    units: Unit[],
    buildings: Building[],
  ): void {
    const ctx = this.ctx;
    const forgeBonus = world
      .buildingsOf(humanId)
      .some((b) => b.kind === "forge" && b.state === "complete" && !b.dead)
      ? 2
      : 0;
    const x = this.minimapRect.x + this.minimapRect.w + 20;
    const y = this.barRect.y + 24;
    ctx.fillStyle = COLORS.uiText;
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    if (units.length > 1) {
      ctx.fillText(`${units.length} selected`, x, y);
      ctx.fillStyle = COLORS.uiTextDim;
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText(this.selectionSummary(units), x, y + 20);
      ctx.fillText(this.groupHpLine(units), x, y + 38);
      return;
    }
    if (units.length === 1) {
      const u = units[0];
      ctx.fillText(u.def.label, x, y);
      ctx.fillStyle = COLORS.uiTextDim;
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText(`HP ${Math.ceil(u.hp)}/${u.def.maxHp}`, x, y + 20);
      // Stat line; when War Cry is active, splice a green "(+N)" right after the Atk.
      let statLine = this.unitStatLine(u, forgeBonus);
      const buffBonus = u.buffT > 0 ? Math.round((Math.round(u.def.damage * veterancyMult(u.kills)) + forgeBonus) * 0.3) : 0;
      if (buffBonus > 0) statLine = statLine.replace(/^Atk \d+/, (m) => `${m} (+${buffBonus})`);
      ctx.fillStyle = COLORS.uiTextDim;
      ctx.fillText(statLine, x, y + 38);
      if (buffBonus > 0) {
        const pre = statLine.slice(0, statLine.indexOf("(+"));
        ctx.fillStyle = "#7cfc7c";
        ctx.fillText(`(+${buffBonus})`, x + ctx.measureText(pre).width, y + 38);
        ctx.fillStyle = COLORS.uiTextDim;
      }
      const stance = this.stanceLabel(u);
      ctx.fillText(stance ? `${u.state} · ${stance}` : `State: ${u.state}`, x, y + 56);
      if (u.carrying) ctx.fillText(`Carrying ${u.carrying.amount} ${u.carrying.kind}`, x, y + 74);
      return;
    }
    if (buildings.length >= 1) {
      const b = buildings[0];
      ctx.fillText(b.def.label, x, y);
      ctx.fillStyle = COLORS.uiTextDim;
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.fillText(`HP ${Math.ceil(b.hp)}/${b.def.maxHp}`, x, y + 20);
      // Attack / supply / heal stats for the building.
      const stats: string[] = [];
      if (b.def.damage) {
        stats.push(`Atk ${b.def.damage}`);
        if (b.def.attackRange) stats.push(`Rng ${b.def.attackRange}`);
        if (b.def.attackCooldown) stats.push(`${b.def.attackCooldown.toFixed(1)}s`);
      }
      if (b.def.providesSupply) stats.push(`Supply +${b.def.providesSupply}`);
      if (b.def.healRadius) stats.push(`Heal r${b.def.healRadius}`);
      if (stats.length) ctx.fillText(stats.join(" · "), x, y + 38);
      if (b.state !== "complete") {
        ctx.fillText(`Building… ${Math.floor(b.construction * 100)}%`, x, y + 56);
      } else if (b.queue.length > 0) {
        ctx.fillText(`Training: ${b.queue.join(", ")}`, x, y + 56);
        ctx.fillText(`(${Math.ceil(b.productionTimer)}s)`, x, y + 74);
      } else if (!stats.length) {
        ctx.fillText(`Right-click to set rally point`, x, y + 38);
      }
    }
  }

  /** Fit a sprite into a box (preserve aspect, bottom-anchored). */
  private drawIcon(sprite: CanvasImageSource, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const sw = (sprite as HTMLCanvasElement).width || 1;
    const sh = (sprite as HTMLCanvasElement).height || 1;
    const s = Math.min(w / sw, h / sh);
    const dw = sw * s;
    const dh = sh * s;
    ctx.drawImage(sprite, x + (w - dw) / 2, y + (h - dh), dw, dh);
  }

  private renderButtons(): void {
    const ctx = this.ctx;
    for (const b of this.buttons) {
      const { x, y, w, h } = b.rect;
      // Raised stone button: vertical gradient + top highlight + dark base.
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      if (b.enabled) {
        g.addColorStop(0, "#3a4150");
        g.addColorStop(1, "#222730");
      } else {
        g.addColorStop(0, "#272a2f");
        g.addColorStop(1, "#191b1f");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.10)"; // top bevel
      ctx.fillRect(x, y, w, 1.5);
      ctx.fillStyle = "rgba(0,0,0,0.45)"; // bottom shade
      ctx.fillRect(x, y + h - 2, w, 2);
      ctx.strokeStyle = b.enabled ? COLORS.uiEmber : COLORS.uiPanelEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Icon: building/unit sprite, or a colored spell orb. Sits on the left.
      const a = b.action;
      let icon: CanvasImageSource | undefined;
      if (a.type === "build") icon = this.assets?.buildingSprite(a.kind);
      else if (a.type === "train") icon = this.assets?.unitSprite(a.kind);
      else if (a.type === "warcry") icon = this.assets?.warcryIcon;
      const iconBox = 30;
      ctx.save();
      if (!b.enabled) ctx.globalAlpha = 0.45;
      if (icon) {
        this.drawIcon(icon, x + 3, y + 3, iconBox, h - 6);
      } else if (a.type === "spell") {
        // Orb colour per spell: fire (amber), heal (green), freeze (blue).
        const inner = a.id === "fireball" ? "#ffe7b0" : a.id === "heal" ? "#d6ffcf" : "#dff0ff";
        const mid = a.id === "fireball" ? "#ff8a2e" : a.id === "heal" ? "#4fce5a" : "#5aa0ff";
        const outer = a.id === "fireball" ? "rgba(150,40,10,0)" : a.id === "heal" ? "rgba(30,120,40,0)" : "rgba(60,90,220,0)";
        const cx = x + 3 + iconBox / 2;
        const cy = y + h / 2;
        const grd = ctx.createRadialGradient(cx, cy, 1, cx, cy, 12);
        grd.addColorStop(0, inner);
        grd.addColorStop(0.5, mid);
        grd.addColorStop(1, outer);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const hasIcon = !!icon || a.type === "spell";
      if (hasIcon) {
        // Name + cost to the right of the icon.
        const tx = x + iconBox + 7;
        ctx.fillStyle = b.enabled ? COLORS.uiText : COLORS.uiTextDim;
        ctx.font = "bold 11px 'Segoe UI', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label.length > 9 ? b.label.slice(0, 8) + "…" : b.label, tx, y + h / 2 - 7);
        ctx.fillStyle = COLORS.uiTextDim;
        ctx.font = "10px 'Segoe UI', sans-serif";
        ctx.fillText(b.sub, tx, y + h / 2 + 8);
      } else {
        // No icon (Stop / Cancel): centered label + sub.
        ctx.fillStyle = b.enabled ? COLORS.uiText : COLORS.uiTextDim;
        ctx.font = "13px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.label, x + w / 2, y + h / 2 - 6);
        ctx.fillStyle = COLORS.uiTextDim;
        ctx.font = "11px 'Segoe UI', sans-serif";
        ctx.fillText(b.sub, x + w / 2, y + h / 2 + 9);
      }

      // Hotkey badge (top-left).
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x + 1, y + 1, 14, 13);
      ctx.fillStyle = COLORS.uiEmber;
      ctx.font = "bold 10px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.hotkey, x + 8, y + 8);

      // Autocast indicator: a pulsing arcane border + an "A" badge.
      if (b.autocast) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.006);
        ctx.strokeStyle = `rgba(120,180,255,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.fillStyle = "#4a86e8";
        ctx.beginPath();
        ctx.arc(x + w - 9, y + 9, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#eaf2ff";
        ctx.font = "bold 11px 'Segoe UI', sans-serif";
        ctx.fillText("A", x + w - 9, y + 9);
      }

      // Cooldown sweep (War Cry): a dark veil draining top→bottom + seconds left.
      if (b.cooldown !== undefined && b.cooldown > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(x + 1, y + 1, w - 2, (h - 2) * Math.min(1, b.cooldown));
        ctx.fillStyle = "#f4c46a";
        ctx.font = "bold 14px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.ceil(b.cooldown * this.warcryMax)}`, x + w / 2, y + h / 2);
      }
    }
  }

  /** How many of the player's workers are idle (matches the idle-worker hotkey). */
  idleWorkerCount(world: World, humanId: number): number {
    return world
      .unitsOf(humanId)
      .filter(
        (u) =>
          u.def.canGather &&
          u.state === "idle" &&
          !u.carrying &&
          !u.buildTarget &&
          u.path.length === 0 &&
          u.finalTarget === null,
      ).length;
  }

  /** Complete production buildings sitting with an empty queue — a macro nudge. */
  idleProductionCount(world: World, humanId: number): number {
    return world.buildings.filter(
      (b) =>
        b.playerId === humanId &&
        b.state === "complete" &&
        b.def.produces.length > 0 &&
        b.queue.length === 0,
    ).length;
  }

  /** "Atk 18 · Def 2 · Vet 1" — effective combat stats (veterancy + Forge bonus). */
  unitStatLine(u: Unit, atkBonus = 0): string {
    const eff = Math.round(u.def.damage * veterancyMult(u.kills)) + atkBonus;
    let s = `Atk ${eff}`;
    if (u.def.attackRange > 1) s += ` · Rng ${u.def.attackRange}`;
    if (u.def.armor) s += ` · Def ${u.def.armor}`;
    if (u.def.siegeMult && u.def.siegeMult > 1) s += ` · Siege ×${u.def.siegeMult}`;
    if (u.def.splash) s += " · Splash";
    s += ` · Pop ${u.def.supply}`;
    const rank = veterancyRank(u.kills);
    if (rank > 0) s += ` · Vet ${rank}`;
    return s;
  }

  /** Active stance label for a unit ("Holding" / "Patrolling"), or null. */
  stanceLabel(u: Unit): string | null {
    if (u.holdGround) return "Holding";
    if (u.patrolA && u.patrolB) return "Patrolling";
    return null;
  }

  /** "HP 240/360" — combined current/max health of a multi-unit selection. */
  groupHpLine(units: Unit[]): string {
    let cur = 0;
    let max = 0;
    for (const u of units) {
      cur += u.hp;
      max += u.def.maxHp;
    }
    return `HP ${Math.ceil(cur)}/${max}`;
  }

  /** "3 Footman · 2 Archer" — composition of a multi-unit selection, most first. */
  selectionSummary(units: Unit[]): string {
    const counts = new Map<string, number>();
    for (const u of units) counts.set(u.def.label, (counts.get(u.def.label) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => `${n} ${label}`)
      .join(" · ");
  }

  renderEndScreen(cam: Camera, won: boolean, elapsed = 0, kills = 0, razed = 0, peakArmy = 0): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // Framed gothic panel behind the result.
    const pw = 480;
    const ph = 286;
    const px = (cam.viewW - pw) / 2;
    const py = (cam.viewH - ph) / 2;
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, "#262318");
    pg.addColorStop(0.5, "#1b1810");
    pg.addColorStop(1, "#131009");
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw, ph);
    if (this.assets?.frameSprite) {
      draw9Slice(ctx, this.assets.frameSprite, { x: px - 6, y: py - 10, w: pw + 12, h: ph + 16 }, 0.17, 46);
    }
    const cx = cam.viewW / 2;

    ctx.fillStyle = won ? "#9affb0" : "#ff7b7b";
    ctx.font = "bold 54px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(won ? "⚔ VICTORY ⚔" : "☠ DEFEAT ☠", cx, py + 64);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);

    // Score rewards aggression + efficiency; a quick, decisive win scores highest.
    const speedBonus = won ? Math.max(0, 600 - Math.floor(elapsed)) : 0;
    const score = kills * 10 + razed * 30 + peakArmy * 5 + speedBonus;
    // Flavor verdict by score tier (and outcome).
    const verdict = !won
      ? score > 250
        ? "Fell with honor"
        : "Cut down"
      : score > 700
        ? "Warlord of the Wastes"
        : score > 400
          ? "Dread Commander"
          : "Victor";

    ctx.fillStyle = COLORS.uiEmber;
    ctx.font = "italic 20px 'Segoe UI', sans-serif";
    ctx.fillText(verdict, cx, py + 104);

    ctx.fillStyle = COLORS.uiText;
    ctx.font = "17px 'Segoe UI', sans-serif";
    ctx.fillText(
      `Time ${mins}m ${secs.toString().padStart(2, "0")}s    Slain ${kills}    Razed ${razed}    Peak army ${peakArmy}`,
      cx,
      py + 146,
    );
    ctx.fillStyle = "#f4c46a";
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillText(`Score ${score}`, cx, py + 188);

    ctx.fillStyle = COLORS.uiText;
    ctx.font = "18px 'Segoe UI', sans-serif";
    ctx.fillText("Press R to play again", cx, py + 232);
  }

  /** First-run controls card — a brief gothic panel of the essential inputs. */
  renderHints(cam: Camera, alpha = 1): void {
    const ctx = this.ctx;
    const lines = [
      ["WASD / Arrows", "pan the camera"],
      ["Left-drag", "select units"],
      ["Right-click", "move"],
      ["Ctrl + Right-click", "attack-move"],
      ["Esc", "menu, settings & key rebinds"],
    ];
    const pw = 380;
    const ph = 56 + lines.length * 26 + 22;
    const px = (cam.viewW - pw) / 2;
    const py = 80;
    ctx.save();
    ctx.globalAlpha = alpha;

    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, "#262318");
    pg.addColorStop(1, "#131009");
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw, ph);
    if (this.assets?.frameSprite) {
      draw9Slice(ctx, this.assets.frameSprite, { x: px - 5, y: py - 8, w: pw + 10, h: ph + 14 }, 0.17, 40);
    } else {
      ctx.strokeStyle = "rgba(217,138,50,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
    }

    ctx.fillStyle = COLORS.uiEmber;
    ctx.font = "bold 18px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("⚔  How to Command  ⚔", cam.viewW / 2, py + 30);

    let ly = py + 58;
    for (const [key, desc] of lines) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#f4c46a";
      ctx.font = "bold 14px 'Segoe UI', sans-serif";
      ctx.fillText(key, px + pw / 2 - 12, ly);
      ctx.textAlign = "left";
      ctx.fillStyle = COLORS.uiText;
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.fillText(desc, px + pw / 2, ly);
      ly += 26;
    }
    ctx.fillStyle = "#8a7e6a";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("(shown once — full controls live in the Esc menu)", cam.viewW / 2, ly + 4);

    // Close (×) button, top-right of the card.
    const cb: Rect = { x: px + pw - 26, y: py + 8, w: 18, h: 18 };
    this.hintsCloseRect = cb;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
    ctx.strokeStyle = "rgba(217,138,50,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
    ctx.fillStyle = "#f1ead8";
    ctx.font = "bold 14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×", cb.x + cb.w / 2, cb.y + cb.h / 2 + 1);
    ctx.restore();
  }
}
