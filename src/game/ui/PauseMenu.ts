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
  | { type: "rebind"; action: ActionId };

interface Layout {
  panel: Rect;
  resume: Rect;
  restart: Rect;
  save: Rect;
  load: Rect;
  edgeToggle: Rect;
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
    const edgeToggle = btn(px + 30, py + 140, pw - 60);

    const rows: Layout["rows"] = [];
    let ry = py + 202;
    for (const a of ACTION_ORDER) {
      rows.push({ action: a.id, label: a.label, keyBox: { x: px + pw - 150, y: ry, w: 110, h: 28 } });
      ry += 40;
    }
    const reset = btn(px + 30, ry + 6, pw - 60);
    return { panel, resume, restart, save, load, edgeToggle, reset, rows };
  }

  hitTest(cam: Camera, p: Vec2): MenuResult | null {
    const l = this.layoutFor(cam);
    if (rectContains(l.resume, p)) return { type: "resume" };
    if (rectContains(l.restart, p)) return { type: "restart" };
    if (rectContains(l.save, p)) return { type: "save" };
    if (rectContains(l.load, p)) return { type: "load" };
    if (rectContains(l.edgeToggle, p)) return { type: "toggleEdgeScroll" };
    if (rectContains(l.reset, p)) return { type: "reset" };
    for (const row of l.rows) {
      if (rectContains(row.keyBox, p)) return { type: "rebind", action: row.action };
    }
    return null;
  }

  render(ctx: CanvasRenderingContext2D, cam: Camera, kb: Keybindings, edgeScroll = false): void {
    const l = this.layoutFor(cam);

    // Dim the whole screen.
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    // Panel.
    ctx.fillStyle = "rgba(22,24,32,0.98)";
    ctx.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);
    ctx.strokeStyle = "rgba(150,170,200,0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);

    ctx.fillStyle = "#eef2f7";
    ctx.font = "bold 26px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Paused", cam.viewW / 2, l.panel.y + 28);

    this.button(ctx, l.resume, "Resume", true);
    this.button(ctx, l.restart, "Restart", true);
    this.button(ctx, l.save, "Save Game", true);
    this.button(ctx, l.load, "Load Game", true);
    this.button(ctx, l.edgeToggle, `Edge-scroll camera: ${edgeScroll ? "ON" : "OFF"}`, true);

    // Controls header.
    ctx.fillStyle = "#9fb2c2";
    ctx.font = "13px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("CONTROLS — click a key to rebind", l.panel.x + 30, l.panel.y + 140);

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
    ctx.fillStyle = enabled ? "rgba(60,70,90,0.95)" : "rgba(45,45,55,0.7)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "rgba(150,170,200,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#eef2f7";
    ctx.font = "15px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
}
