import type { Vec2 } from "./types.ts";
import { MAP_W, MAP_H, TILE } from "./constants.ts";
import { clamp } from "./util/math.ts";

/** Translates between world (pixel) space and screen space, with clamping. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  // Extra world-space the camera may pan into beyond the map edges, so the HUD
  // bar doesn't permanently hide the bottom rows and edges aren't flush.
  padTop = 0;
  padRight = 0;
  padBottom = 0;
  padLeft = 0;

  setPadding(top: number, right: number, bottom: number, left: number): void {
    this.padTop = top;
    this.padRight = right;
    this.padBottom = bottom;
    this.padLeft = left;
    this.clampToWorld();
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clampToWorld();
  }

  private clampToWorld(): void {
    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    const minX = -this.padLeft;
    const minY = -this.padTop;
    const maxX = Math.max(minX, worldW - this.viewW / this.zoom + this.padRight);
    const maxY = Math.max(minY, worldH - this.viewH / this.zoom + this.padBottom);
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(this.y, minY, maxY);
  }

  move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clampToWorld();
  }

  centerOn(p: Vec2): void {
    this.x = p.x - this.viewW / this.zoom / 2;
    this.y = p.y - this.viewH / this.zoom / 2;
    this.clampToWorld();
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }

  /** Visible tile range, padded by one, for culling. */
  visibleTileBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const x0 = Math.max(0, Math.floor(this.x / TILE) - 1);
    const y0 = Math.max(0, Math.floor(this.y / TILE) - 1);
    const x1 = Math.min(MAP_W - 1, Math.ceil((this.x + this.viewW / this.zoom) / TILE) + 1);
    const y1 = Math.min(MAP_H - 1, Math.ceil((this.y + this.viewH / this.zoom) / TILE) + 1);
    return { x0, y0, x1, y1 };
  }
}
