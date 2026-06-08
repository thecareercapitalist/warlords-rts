import type { Camera } from "../Camera.ts";
import type { Vec2 } from "../types.ts";
import { type Rect, rectContains } from "../util/math.ts";
import { ACTION_ORDER, type ActionId, type Keybindings } from "./Keybindings.ts";

export type MenuResult =
  | { type: "resume" }
  | { type: "restart" }
  | { type: "save" }
  | { type: "load" }
  | { type: "reset" }
  | { type: "toggleEdgeScroll" }
  | { type: "toggleMusic" }
  | { type: "rebind"; action: ActionId };

interface Layout {
  panel: Rect;
  resume: Rect;
  restart: Rect;
  save: Rect;
  load: Rect;
  edgeToggle: Rect;
  musicToggle: Rect;
  reset: Rect;
  rows: { action: ActionId; label: string; keyBox: Rect }[];
}

/**
 * The Escape pause menu: resume/restart plus a rebindable controls list.
 * Stateless except for which action is currently awaiting a new key.
 */
export class PauseMenu {
  awaiting: ActionId | null = null;

  private layoutFor(cam: Camera): Layout {
    const pw = 460;
    const ph = 208 + ACTION_ORDER.length * 40 + 70;
    const px = (cam.viewW - pw) / 2;
    const py = (cam.viewH - ph) / 2;
    const panel: Rect = { x: px, y: py, w: pw, h: ph };

    const btn = (x: number, y: number, w: number): Rect => ({ x, y, w, h: 34 });
    const resume = btn(px + 30, py + 56, 180);
    const restart = btn(px + pw - 210, py + 56, 180);
    const save = btn(px + 30, py + 98, 180);
    const load = btn(px + pw - 210, py + 98, 180);
    const halfW = (pw - 72) / 2;
    const edgeToggle = btn(px + 30, py + 140, halfW);
    const musicToggle = btn(px + 30 + halfW + 12, py + 140, halfW);

    const rows: Layout["rows"] = [];
    let ry = py + 202;
    for (const a of ACTION_ORDER) {
      rows.push({ action: a.id, label: a.label, keyBox: { x: px + pw - 150, y: ry, w: 110, h: 28 } });
      ry += 40;
    }
    const reset = btn(px + 30, ry + 6, pw - 60);
    return { panel, resume, restart, save, load, edgeToggle, musicToggle, reset, rows };
  }

  hitTest(cam: Camera, p: Vec2): MenuResult | null {
    const l = this.layoutFor(cam);
    if (rectContains(l.resume, p)) return { type: "resume" };
    if (rectContains(l.restart, p)) return { type: "restart" };
    if (rectContains(l.save, p)) return { type: "save" };
    if (rectContains(l.load, p)) return { type: "load" };
    if (rectContains(l.edgeToggle, p)) return { type: "toggleEdgeScroll" };
    if (rectContains(l.musicToggle, p)) return { type: "toggleMusic" };
    if (rectContains(l.reset, p)) return { type: "reset" };
    for (const row of l.rows) {
      if (rectContains(row.keyBox, p)) return { type: "rebind", action: row.action };
    }
    return null;
  }

  render(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    kb: Keybindings,
    edgeScroll = false,
    musicOn = true,
  ): void {
    const l = this.layoutFor(cam);

    // Dim the whole screen.
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // Panel — beveled gothic stone with a double (ember + ink) border.
    const pg = ctx.createLinearGradient(0, l.panel.y, 0, l.panel.y + l.panel.h);
    pg.addColorStop(0, "#262318");
    pg.addColorStop(0.5, "#1b1810");
    pg.addColorStop(1, "#131009");
    ctx.fillStyle = pg;
    ctx.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);
    ctx.strokeStyle = "#15110d";
    ctx.lineWidth = 4;
    ctx.strokeRect(l.panel.x - 1, l.panel.y - 1, l.panel.w + 2, l.panel.h + 2);
    ctx.strokeStyle = "rgba(217,138,50,0.85)"; // ember frame
    ctx.lineWidth = 2;
    ctx.strokeRect(l.panel.x + 3, l.panel.y + 3, l.panel.w - 6, l.panel.h - 6);
    ctx.fillStyle = "rgba(255,244,214,0.07)"; // top highlight
    ctx.fillRect(l.panel.x + 4, l.panel.y + 4, l.panel.w - 8, 2);

    ctx.fillStyle = "#f3ead2";
    ctx.font = "bold 28px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚔ Paused ⚔", cam.viewW / 2, l.panel.y + 30);
    ctx.strokeStyle = "rgba(217,138,50,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cam.viewW / 2 - 90, l.panel.y + 46);
    ctx.lineTo(cam.viewW / 2 + 90, l.panel.y + 46);
    ctx.stroke();

    this.button(ctx, l.resume, "Resume", true);
    this.button(ctx, l.restart, "Restart", true);
    this.button(ctx, l.save, "Save Game", true);
    this.button(ctx, l.load, "Load Game", true);
    this.button(ctx, l.edgeToggle, `Edge-scroll: ${edgeScroll ? "ON" : "OFF"}`, true);
    this.button(ctx, l.musicToggle, `Music: ${musicOn ? "ON" : "OFF"}`, true);

    // Controls header.
    ctx.fillStyle = "#9fb2c2";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("CONTROLS — click a key to rebind", l.panel.x + 30, l.panel.y + 188);

    for (const row of l.rows) {
      ctx.fillStyle = "#dfe6ee";
      ctx.font = "15px 'Segoe UI', sans-serif";
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
      ctx.font = "14px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        awaiting ? "press a key…" : kb.display(row.action),
        row.keyBox.x + row.keyBox.w / 2,
        row.keyBox.y + row.keyBox.h / 2,
      );
    }

    this.button(ctx, l.reset, "Reset to Defaults", true);

    ctx.fillStyle = "#7e8a98";
    ctx.font = "12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Esc to resume", cam.viewW / 2, l.panel.y + l.panel.h - 12);
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
    ctx.fillStyle = "#f1ead8";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
}
