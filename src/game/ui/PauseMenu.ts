import type { Camera } from "../Camera.ts";
import type { Vec2 } from "../types.ts";
import { type Rect, rectContains } from "../util/math.ts";
import { ACTION_ORDER, type ActionId, type Keybindings } from "./Keybindings.ts";
import type { SlotMeta } from "../systems/persistence.ts";
import { draw9Slice } from "./frame.ts";

export type MenuResult =
  | { type: "resume" }
  | { type: "restart" }
  | { type: "save" }
  | { type: "loadSlot"; slot: number }
  | { type: "reset" }
  | { type: "toggleEdgeScroll" }
  | { type: "toggleMusic" }
  | { type: "toggleFullscreen" }
  | { type: "setPanSpeed"; value: number }
  | { type: "setVolume"; value: number }
  | { type: "setDifficulty"; value: Difficulty }
  | { type: "rebind"; action: ActionId };

/** Skirmish difficulty levels, easiest → hardest, with player-facing labels. */
export type Difficulty = "easy" | "normal" | "hard";
const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Recruit" },
  { id: "normal", label: "Soldier" },
  { id: "hard", label: "Warlord" },
];

/** Pan-speed slider range (× base camera speed). */
const PAN_MIN = 0.5;
const PAN_MAX = 3.0;

type Tab = "game" | "controls";

interface Layout {
  panel: Rect;
  resume: Rect;
  restart: Rect;
  tabGame: Rect;
  tabControls: Rect;
  // Game tab
  save: Rect;
  slots: Rect[];
  edgeToggle: Rect;
  musicToggle: Rect;
  fullscreenToggle: Rect;
  panSlider: Rect;
  volSlider: Rect;
  diff: Rect[];
  // Controls tab
  reset: Rect;
  rows: { action: ActionId; label: string; keyBox: Rect }[];
}

/**
 * The Escape pause menu: a tabbed panel — "Game" (resume/restart, save/load
 * slots, toggles) and "Controls" (the rebindable key list) — to cut clutter.
 */
export class PauseMenu {
  awaiting: ActionId | null = null;
  activeTab: Tab = "game";

  private layoutFor(cam: Camera): Layout {
    const pw = 470;
    const ph = this.activeTab === "game" ? 504 : 196 + ACTION_ORDER.length * 34 + 54;
    const px = (cam.viewW - pw) / 2;
    const py = (cam.viewH - ph) / 2;
    const panel: Rect = { x: px, y: py, w: pw, h: ph };

    const btn = (x: number, y: number, w: number, h = 34): Rect => ({ x, y, w, h });
    const halfW = (pw - 60 - 14) / 2;
    const resume = btn(px + 30, py + 56, halfW);
    const restart = btn(px + pw - 30 - halfW, py + 56, halfW);
    // Tab strip.
    const tabGame = btn(px + 30, py + 98, halfW, 30);
    const tabControls = btn(px + pw - 30 - halfW, py + 98, halfW, 30);

    // --- Game tab ---
    const save = btn(px + 30, py + 158, pw - 60, 32);
    const thirdW = (pw - 60 - 20) / 3;
    const slots = [0, 1, 2].map((i) => btn(px + 30 + (thirdW + 10) * i, py + 198, thirdW, 46));
    const edgeToggle = btn(px + 30, py + 258, thirdW, 30);
    const musicToggle = btn(px + 30 + thirdW + 10, py + 258, thirdW, 30);
    const fullscreenToggle = btn(px + 30 + (thirdW + 10) * 2, py + 258, thirdW, 30);
    const panSlider = btn(px + 30, py + 318, pw - 60, 16);
    const volSlider = btn(px + 30, py + 364, pw - 60, 16);
    // Difficulty selector: three equal segments.
    const diffW = (pw - 60 - 16) / 3;
    const diff = [0, 1, 2].map((i) => btn(px + 30 + (diffW + 8) * i, py + 416, diffW, 32));

    // --- Controls tab ---
    const rows: Layout["rows"] = [];
    let ry = py + 144;
    for (const a of ACTION_ORDER) {
      rows.push({ action: a.id, label: a.label, keyBox: { x: px + pw - 150, y: ry, w: 110, h: 26 } });
      ry += 34;
    }
    const reset = btn(px + 30, ry + 6, pw - 60);

    return { panel, resume, restart, tabGame, tabControls, save, slots, edgeToggle, musicToggle, fullscreenToggle, panSlider, volSlider, diff, reset, rows };
  }

  hitTest(cam: Camera, p: Vec2): MenuResult | null {
    const l = this.layoutFor(cam);
    if (rectContains(l.resume, p)) return { type: "resume" };
    if (rectContains(l.restart, p)) return { type: "restart" };
    // Tab switches are handled internally (no result bubbles to the game).
    if (rectContains(l.tabGame, p)) {
      this.activeTab = "game";
      return null;
    }
    if (rectContains(l.tabControls, p)) {
      this.activeTab = "controls";
      return null;
    }
    if (this.activeTab === "game") {
      if (rectContains(l.save, p)) return { type: "save" };
      for (let i = 0; i < l.slots.length; i++) {
        if (rectContains(l.slots[i], p)) return { type: "loadSlot", slot: i };
      }
      if (rectContains(l.edgeToggle, p)) return { type: "toggleEdgeScroll" };
      if (rectContains(l.musicToggle, p)) return { type: "toggleMusic" };
      if (rectContains(l.fullscreenToggle, p)) return { type: "toggleFullscreen" };
      // Pan-speed slider: clickable along the track (with a generous vertical band).
      const s = l.panSlider;
      if (p.x >= s.x - 6 && p.x <= s.x + s.w + 6 && p.y >= s.y - 12 && p.y <= s.y + s.h + 12) {
        const f = Math.max(0, Math.min(1, (p.x - s.x) / s.w));
        return { type: "setPanSpeed", value: PAN_MIN + f * (PAN_MAX - PAN_MIN) };
      }
      const vs = l.volSlider;
      if (p.x >= vs.x - 6 && p.x <= vs.x + vs.w + 6 && p.y >= vs.y - 12 && p.y <= vs.y + vs.h + 12) {
        return { type: "setVolume", value: Math.max(0, Math.min(1, (p.x - vs.x) / vs.w)) };
      }
      for (let i = 0; i < l.diff.length; i++) {
        if (rectContains(l.diff[i], p)) return { type: "setDifficulty", value: DIFFICULTIES[i].id };
      }
    } else {
      if (rectContains(l.reset, p)) return { type: "reset" };
      for (const row of l.rows) {
        if (rectContains(row.keyBox, p)) return { type: "rebind", action: row.action };
      }
    }
    return null;
  }

  render(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    kb: Keybindings,
    edgeScroll = false,
    musicOn = true,
    slots: (SlotMeta | null)[] = [],
    frame?: CanvasImageSource,
    panSpeed = 1,
    difficulty: Difficulty = "normal",
    volume = 1,
  ): void {
    const l = this.layoutFor(cam);

    // Dim the whole screen.
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // Panel fill — beveled gothic stone.
    const pg = ctx.createLinearGradient(0, l.panel.y, 0, l.panel.y + l.panel.h);
    pg.addColorStop(0, "#262318");
    pg.addColorStop(0.5, "#1b1810");
    pg.addColorStop(1, "#131009");
    ctx.fillStyle = pg;
    ctx.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);
    ctx.fillStyle = "rgba(255,244,214,0.07)";
    ctx.fillRect(l.panel.x + 4, l.panel.y + 4, l.panel.w - 8, 2);

    // Ornate gothic frame overlay.
    if (frame) {
      draw9Slice(ctx, frame, { x: l.panel.x - 6, y: l.panel.y - 10, w: l.panel.w + 12, h: l.panel.h + 16 }, 0.17, 46);
    } else {
      ctx.strokeStyle = "rgba(217,138,50,0.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(l.panel.x + 3, l.panel.y + 3, l.panel.w - 6, l.panel.h - 6);
    }

    ctx.fillStyle = "#f3ead2";
    ctx.font = "bold 26px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚔ Paused ⚔", cam.viewW / 2, l.panel.y + 28);

    this.button(ctx, l.resume, "Resume", true);
    this.button(ctx, l.restart, "Restart", true);

    // Tab strip.
    this.tab(ctx, l.tabGame, "Game", this.activeTab === "game");
    this.tab(ctx, l.tabControls, "Controls", this.activeTab === "controls");

    if (this.activeTab === "game") {
      this.renderGameTab(ctx, l, edgeScroll, musicOn, slots, panSpeed, difficulty, volume);
    } else {
      this.renderControlsTab(ctx, l, kb);
    }

    ctx.fillStyle = "#7e8a98";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Esc to resume", cam.viewW / 2, l.panel.y + l.panel.h - 12);
  }

  private renderGameTab(
    ctx: CanvasRenderingContext2D,
    l: Layout,
    edgeScroll: boolean,
    musicOn: boolean,
    slots: (SlotMeta | null)[],
    panSpeed: number,
    difficulty: Difficulty,
    volume: number,
  ): void {
    // SAVE / LOAD heading.
    ctx.fillStyle = "#cdbb95";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SAVE  /  LOAD", l.panel.x + 30, l.save.y - 8);

    this.button(ctx, l.save, "💾  Save Game", true);

    for (let i = 0; i < l.slots.length; i++) {
      const m = slots[i] ?? null;
      const r = l.slots[i];
      this.button(ctx, r, "", !!m);
      ctx.textAlign = "center";
      if (m) {
        ctx.fillStyle = "#f1ead8";
        ctx.font = "bold 14px 'Segoe UI', sans-serif";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`💾 Slot ${i + 1}`, r.x + r.w / 2, r.y + 20);
        ctx.fillStyle = "#cdbb95";
        ctx.font = "10px 'Segoe UI', sans-serif";
        ctx.fillText(this.fmtClock(m.savedAt), r.x + r.w / 2, r.y + 35);
      } else {
        ctx.fillStyle = "#8a7e6a";
        ctx.font = "13px 'Segoe UI', sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillText(`Slot ${i + 1}`, r.x + r.w / 2, r.y + r.h / 2 - 6);
        ctx.font = "10px 'Segoe UI', sans-serif";
        ctx.fillText("— empty —", r.x + r.w / 2, r.y + r.h / 2 + 9);
      }
    }

    const isFs = typeof document !== "undefined" && !!document.fullscreenElement;
    this.button(ctx, l.edgeToggle, `Edge: ${edgeScroll ? "ON" : "OFF"}`, true);
    this.button(ctx, l.musicToggle, `Music: ${musicOn ? "ON" : "OFF"}`, true);
    this.button(ctx, l.fullscreenToggle, `Fullscr: ${isFs ? "ON" : "OFF"}`, true);

    // Camera pan-speed slider.
    const s = l.panSlider;
    ctx.fillStyle = "#cdbb95";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`CAMERA PAN SPEED  ·  ${panSpeed.toFixed(1)}×`, s.x, s.y - 8);
    // Track.
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(s.x, s.y + s.h / 2 - 3, s.w, 6);
    ctx.strokeStyle = "rgba(150,170,200,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x, s.y + s.h / 2 - 3, s.w, 6);
    // Filled portion + knob.
    const f = Math.max(0, Math.min(1, (panSpeed - PAN_MIN) / (PAN_MAX - PAN_MIN)));
    const kx = s.x + f * s.w;
    ctx.fillStyle = "rgba(217,138,50,0.8)";
    ctx.fillRect(s.x, s.y + s.h / 2 - 3, f * s.w, 6);
    ctx.fillStyle = "#f4c46a";
    ctx.fillRect(kx - 4, s.y - 1, 8, s.h + 2);
    ctx.strokeStyle = "#15110d";
    ctx.strokeRect(kx - 4, s.y - 1, 8, s.h + 2);

    // Master volume slider.
    const vsl = l.volSlider;
    ctx.fillStyle = "#cdbb95";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`VOLUME  ·  ${Math.round(volume * 100)}%`, vsl.x, vsl.y - 8);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(vsl.x, vsl.y + vsl.h / 2 - 3, vsl.w, 6);
    ctx.strokeStyle = "rgba(150,170,200,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(vsl.x, vsl.y + vsl.h / 2 - 3, vsl.w, 6);
    const vf = Math.max(0, Math.min(1, volume));
    const vkx = vsl.x + vf * vsl.w;
    ctx.fillStyle = "rgba(217,138,50,0.8)";
    ctx.fillRect(vsl.x, vsl.y + vsl.h / 2 - 3, vf * vsl.w, 6);
    ctx.fillStyle = "#f4c46a";
    ctx.fillRect(vkx - 4, vsl.y - 1, 8, vsl.h + 2);
    ctx.strokeStyle = "#15110d";
    ctx.strokeRect(vkx - 4, vsl.y - 1, 8, vsl.h + 2);

    // Difficulty selector — three segmented buttons, active one lit.
    ctx.fillStyle = "#cdbb95";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("DIFFICULTY", l.diff[0].x, l.diff[0].y - 8);
    for (let i = 0; i < l.diff.length; i++) {
      const r = l.diff[i];
      const active = DIFFICULTIES[i].id === difficulty;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, active ? "#4a3a22" : "#23272f");
      g.addColorStop(1, active ? "#2c2110" : "#191b1f");
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = active ? "rgba(217,138,50,0.95)" : "rgba(120,130,150,0.5)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = active ? "#f4c46a" : "#9aa3b0";
      ctx.font = `${active ? "bold " : ""}14px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(DIFFICULTIES[i].label, r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  private renderControlsTab(ctx: CanvasRenderingContext2D, l: Layout, kb: Keybindings): void {
    ctx.fillStyle = "#9fb2c2";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Click a key to rebind", l.panel.x + 30, l.rows[0].keyBox.y - 10);

    for (const row of l.rows) {
      ctx.fillStyle = "#dfe6ee";
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(row.label, l.panel.x + 30, row.keyBox.y + row.keyBox.h / 2);

      const awaiting = this.awaiting === row.action;
      ctx.fillStyle = awaiting ? "rgba(255,220,100,0.25)" : "rgba(60,70,90,0.95)";
      ctx.fillRect(row.keyBox.x, row.keyBox.y, row.keyBox.w, row.keyBox.h);
      ctx.strokeStyle = awaiting ? "#ffdc64" : "rgba(150,170,200,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(row.keyBox.x, row.keyBox.y, row.keyBox.w, row.keyBox.h);
      ctx.fillStyle = "#eef2f7";
      ctx.font = "13px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        awaiting ? "press a key…" : kb.display(row.action),
        row.keyBox.x + row.keyBox.w / 2,
        row.keyBox.y + row.keyBox.h / 2,
      );
    }

    this.button(ctx, l.reset, "Reset to Defaults", true);
  }

  /** "6/7 19:05" — short month/day + 24h time of a save's timestamp. */
  private fmtClock(ms: number): string {
    const d = new Date(ms);
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  }

  private tab(ctx: CanvasRenderingContext2D, r: Rect, label: string, active: boolean): void {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, active ? "#4a3a22" : "#22252c");
    g.addColorStop(1, active ? "#2c2110" : "#15171b");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? "rgba(217,138,50,0.95)" : "rgba(120,130,150,0.5)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = active ? "#f4c46a" : "#9aa3b0";
    ctx.font = `${active ? "bold " : ""}15px 'Segoe UI', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }

  private button(ctx: CanvasRenderingContext2D, r: Rect, label: string, enabled: boolean): void {
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, enabled ? "#3c4350" : "#2a2c31");
    g.addColorStop(1, enabled ? "#23272f" : "#191b1f");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(r.x, r.y, r.w, 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
    ctx.strokeStyle = "rgba(217,138,50,0.65)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (label) {
      ctx.fillStyle = enabled ? "#f1ead8" : "#6b6356";
      ctx.font = "15px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
    }
  }
}
