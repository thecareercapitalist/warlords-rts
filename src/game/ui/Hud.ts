import type { World } from "../World.ts";
import type { Camera } from "../Camera.ts";
import type { Unit } from "../entities/Unit.ts";
import { veterancyRank, veterancyMult } from "../entities/Unit.ts";
import type { Building } from "../entities/Building.ts";
import type { BuildingKind, UnitKind, Vec2 } from "../types.ts";
import { MAP_W, MAP_H, TILE, COLORS } from "../constants.ts";
import { UNIT_DEFS, BUILDING_DEFS } from "../entities/defs.ts";
import { clamp, type Rect, rectContains } from "../util/math.ts";

export type HudAction =
  | { type: "build"; kind: BuildingKind }
  | { type: "train"; kind: UnitKind }
  | { type: "cancel" }
  | { type: "cancelUnit" }
  | { type: "stop" }
  | { type: "denied"; label: string; reason: string };

interface Button {
  rect: Rect;
  label: string;
  sub: string;
  hotkey: string;
  action: HudAction;
  enabled: boolean;
}

const BAR_H = 150;

export class Hud {
  private buttons: Button[] = [];
  minimapRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  barRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private attackPing: { x: number; y: number; t: number } | null = null;

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
      // Explicit hotkeys to avoid first-letter collisions (Stop=S, Town Hall=H).
      const builds: { kind: BuildingKind; key: string }[] = [
        { kind: "farm", key: "F" },
        { kind: "barracks", key: "B" },
        { kind: "sawmill", key: "W" },
        { kind: "temple", key: "E" },
        { kind: "forge", key: "G" },
        { kind: "tower", key: "T" },
        { kind: "wall", key: "L" },
        { kind: "townhall", key: "H" },
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
        sub: "S",
        hotkey: "S",
        action: { type: "stop" },
        enabled: true,
      });
      return;
    }

    // Single production building selected → train buttons.
    const prod = buildings.find((b) => b.def.produces.length > 0 && b.state === "complete");
    if (prod) {
      prod.def.produces.forEach((kind, i) => {
        const d = UNIT_DEFS[kind];
        const techOk = !d.requiresBuilding || completedKinds.has(d.requiresBuilding);
        const sub = !techOk
          ? `needs ${BUILDING_DEFS[d.requiresBuilding!].label}`
          : `${d.costGold}g${d.costWood ? " " + d.costWood + "w" : ""}`;
        this.buttons.push({
          rect: place(i),
          label: d.label,
          sub,
          hotkey: d.label[0].toUpperCase(),
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
  ): void {
    const ctx = this.ctx;
    const p = world.player(humanId);
    this.attackPing = attackPing;

    // Top resource bar — dark stone with an ember underline.
    ctx.fillStyle = COLORS.uiPanel;
    ctx.fillRect(0, 0, cam.viewW, 34);
    ctx.fillStyle = COLORS.uiEmber;
    ctx.fillRect(0, 33, cam.viewW, 1.5);
    ctx.font = "16px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.uiGold;
    ctx.fillText(`⛂ Gold ${p.gold}`, 16, 17);
    ctx.fillStyle = COLORS.uiWood;
    ctx.fillText(`🌲 Wood ${p.wood}`, 170, 17);
    ctx.fillStyle = p.supplyUsed >= p.supplyCap ? "#c0492f" : COLORS.uiText;
    ctx.fillText(`👤 Supply ${p.supplyUsed}/${p.supplyCap}`, 320, 17);
    const idle = this.idleWorkerCount(world, humanId);
    if (idle > 0) {
      ctx.fillStyle = COLORS.uiEmber;
      ctx.fillText(`⚒ ${idle} idle`, 500, 17);
    }
    const idleProd = this.idleProductionCount(world, humanId);
    if (idleProd > 0) {
      ctx.fillStyle = COLORS.uiEmber;
      ctx.fillText(`⚑ ${idleProd} idle bldg`, 610, 17);
    }

    if (message) {
      ctx.fillStyle = COLORS.uiEmber;
      ctx.textAlign = "center";
      ctx.fillText(message, cam.viewW / 2, 17);
    }

    // Bottom command bar — dark stone with an ember top edge.
    ctx.fillStyle = COLORS.uiPanel;
    ctx.fillRect(this.barRect.x, this.barRect.y, this.barRect.w, this.barRect.h);
    ctx.fillStyle = COLORS.uiEmber;
    ctx.fillRect(this.barRect.x, this.barRect.y, this.barRect.w, 1.5);

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
      ctx.fillText(this.unitStatLine(u, forgeBonus), x, y + 38);
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
      if (b.state !== "complete") {
        ctx.fillText(`Building… ${Math.floor(b.construction * 100)}%`, x, y + 38);
      } else if (b.queue.length > 0) {
        ctx.fillText(`Training: ${b.queue.join(", ")}`, x, y + 38);
        ctx.fillText(`(${Math.ceil(b.productionTimer)}s)`, x, y + 56);
      } else {
        ctx.fillText(`Right-click to set rally point`, x, y + 38);
      }
    }
  }

  private renderButtons(): void {
    const ctx = this.ctx;
    for (const b of this.buttons) {
      ctx.fillStyle = b.enabled ? COLORS.uiBtn : COLORS.uiBtnDisabled;
      ctx.fillRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
      ctx.strokeStyle = b.enabled ? COLORS.uiEmber : COLORS.uiPanelEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h);
      ctx.fillStyle = b.enabled ? COLORS.uiText : COLORS.uiTextDim;
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 - 6);
      ctx.fillStyle = COLORS.uiTextDim;
      ctx.font = "11px 'Segoe UI', sans-serif";
      ctx.fillText(b.sub, b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2 + 9);
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
    if (u.def.armor) s += ` · Def ${u.def.armor}`;
    if (u.def.siegeMult && u.def.siegeMult > 1) s += ` · Siege ×${u.def.siegeMult}`;
    if (u.def.splash) s += " · Splash";
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

  renderEndScreen(cam: Camera, won: boolean, elapsed = 0, kills = 0, razed = 0): void {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    ctx.fillStyle = won ? "#9affb0" : "#ff7b7b";
    ctx.font = "bold 56px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(won ? "VICTORY" : "DEFEAT", cam.viewW / 2, cam.viewH / 2 - 30);
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    ctx.fillStyle = COLORS.uiEmber;
    ctx.font = "18px 'Segoe UI', sans-serif";
    ctx.fillText(
      `Time: ${mins}m ${secs.toString().padStart(2, "0")}s    Slain: ${kills}    Razed: ${razed}`,
      cam.viewW / 2,
      cam.viewH / 2 + 20,
    );
    ctx.fillStyle = COLORS.uiText;
    ctx.font = "20px 'Segoe UI', sans-serif";
    ctx.fillText("Press R to play again", cam.viewW / 2, cam.viewH / 2 + 56);
  }
}
