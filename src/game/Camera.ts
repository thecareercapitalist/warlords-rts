import type { Vec2 } from "./types.ts";
import { MAP_W, MAP_H, TILE } from "./constants.ts";
import { clamp, toTile } from "./util/math.ts";
import { project, unproject, ISO_TILE_W } from "./render/iso.ts";

/**
 * Camera over the isometric plane. `x`/`y` are the top-left of the viewport in
 * iso-plane coordinates. World↔screen goes through the iso projection so all
 * picking (clicks, drags) reuses the same transform the renderer draws with.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 0;
  viewH = 0;

  // Extra slack (iso px) the camera may pan past the map so the HUD bar doesn't
  // permanently hide bottom rows and edge tiles aren't flush to the screen edge.
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

  /** Iso-plane bounding box of the whole map, padded by a tile of margin. */
  private isoBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const wpx = MAP_W * TILE;
    const hpx = MAP_H * TILE;
    const margin = ISO_TILE_W; // keep edge diamonds fully on the plane
    return {
      minX: -hpx * (ISO_TILE_W / (2 * TILE)) - margin,
      maxX: wpx * (ISO_TILE_W / (2 * TILE)) + margin,
      minY: 0 - margin,
      maxY: (wpx + hpx) * (128 / (2 * TILE)) + margin,
    };
  }

  private clampToWorld(): void {
    const b = this.isoBounds();
    const minX = b.minX - this.padLeft;
    const minY = b.minY - this.padTop;
    const maxX = Math.max(minX, b.maxX - this.viewW / this.zoom + this.padRight);
    const maxY = Math.max(minY, b.maxY - this.viewH / this.zoom + this.padBottom);
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(this.y, minY, maxY);
  }

  move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clampToWorld();
  }

  /** Zoom by `factor` while keeping the world point under (sx,sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const isoX = sx / this.zoom + this.x;
    const isoY = sy / this.zoom + this.y;
    this.zoom = clamp(this.zoom * factor, Camera.MIN_ZOOM, Camera.MAX_ZOOM);
    this.x = isoX - sx / this.zoom;
    this.y = isoY - sy / this.zoom;
    this.clampToWorld();
  }

  private static readonly MIN_ZOOM = 0.35;
  private static readonly MAX_ZOOM = 1.8;

  centerOn(p: Vec2): void {
    const iso = project(p.x, p.y);
    this.x = iso.x - this.viewW / this.zoom / 2;
    this.y = iso.y - this.viewH / this.zoom / 2;
    this.clampToWorld();
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    const iso = project(wx, wy);
    return { x: (iso.x - this.x) * this.zoom, y: (iso.y - this.y) * this.zoom };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    const ix = sx / this.zoom + this.x;
    const iy = sy / this.zoom + this.y;
    return unproject(ix, iy);
  }

  /**
   * Tile range to iterate for rendering: the visible screen rectangle maps to a
   * diamond in tile space, so we take the bounding tile-rect of its corners and
   * pad generously.
   */
  visibleTileRange(): { x0: number; y0: number; x1: number; y1: number } {
    const corners = [
      this.screenToWorld(0, 0),
      this.screenToWorld(this.viewW, 0),
      this.screenToWorld(0, this.viewH),
      this.screenToWorld(this.viewW, this.viewH),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of corners) {
      const t = toTile(c.x, c.y);
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x);
      maxY = Math.max(maxY, t.y);
    }
    const pad = 2;
    return {
      x0: Math.max(0, minX - pad),
      y0: Math.max(0, minY - pad),
      x1: Math.min(MAP_W - 1, maxX + pad),
      y1: Math.min(MAP_H - 1, maxY + pad),
    };
  }
}
