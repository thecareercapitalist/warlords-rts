import type { Vec2 } from "./types.ts";

export interface DragBox {
  start: Vec2; // screen coords
  current: Vec2;
  active: boolean;
}

/**
 * Centralizes raw mouse/keyboard state. The Game loop polls this each frame and
 * consumes one-shot events (clicks, key presses) so systems stay declarative.
 */
export class Input {
  readonly keys = new Set<string>();
  mouse: Vec2 = { x: 0, y: 0 };
  /** False until the pointer has actually moved — guards edge-scroll from the default (0,0). */
  moved = false;
  leftDown = false;
  rightDown = false;

  // One-shot event queues, drained by the Game each frame.
  leftClicks: Vec2[] = [];
  // Right "clicks" carry the press origin too, so a press-drag-release can set a
  // formation facing direction (from → to).
  rightClicks: { x: number; y: number; fromX: number; fromY: number }[] = [];
  doubleClicks: Vec2[] = [];
  pressedKeys: string[] = [];
  private lastLeftUp: { t: number; x: number; y: number } | null = null;
  /** Accumulated mouse-wheel delta since last frame (negative = scroll up). */
  wheel = 0;

  drag: DragBox = { start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, active: false };
  shift = false;
  ctrl = false;

  private dragThreshold = 6;
  private leftDownAt: Vec2 | null = null;
  private rightDownAt: Vec2 | null = null;

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY;
        this.moved = true;
      },
      { passive: false },
    );

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.moved = true;
      // Arm the drag here too (not only in the window handler) so a box select
      // reliably starts regardless of which mousemove event fires first.
      if (this.leftDown && this.leftDownAt && !this.drag.active) {
        const d = Math.hypot(this.mouse.x - this.leftDownAt.x, this.mouse.y - this.leftDownAt.y);
        if (d > this.dragThreshold) this.drag.active = true;
      }
      if (this.drag.active) this.drag.current = { ...this.mouse };
    });

    canvas.addEventListener("mousedown", (e) => {
      this.shift = e.shiftKey;
      const r = canvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.button === 0) {
        this.leftDown = true;
        this.leftDownAt = { ...p };
        this.drag = { start: { ...p }, current: { ...p }, active: false };
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rightDownAt = { ...p };
      }
    });

    // Track drags even when the cursor leaves the canvas: update mouse and the
    // drag box from the window-level event so selection boxes stay correct.
    window.addEventListener("mousemove", (e) => {
      if (!this.leftDown || !this.leftDownAt) return;
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.moved = true;
      if (!this.drag.active) {
        const d = Math.hypot(this.mouse.x - this.leftDownAt.x, this.mouse.y - this.leftDownAt.y);
        if (d > this.dragThreshold) this.drag.active = true;
      }
      if (this.drag.active) this.drag.current = { ...this.mouse };
    });

    window.addEventListener("mouseup", (e) => {
      const r = canvas.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.button === 0) {
        if (!this.drag.active && this.leftDownAt) {
          const now = performance.now();
          if (
            this.lastLeftUp &&
            now - this.lastLeftUp.t < 350 &&
            Math.hypot(p.x - this.lastLeftUp.x, p.y - this.lastLeftUp.y) < 8
          ) {
            this.doubleClicks.push({ ...p });
          }
          this.lastLeftUp = { t: now, x: p.x, y: p.y };
          this.leftClicks.push({ ...p });
        }
        // If it was a drag, Game reads drag box before we clear it.
        this.leftDown = false;
        this.leftDownAt = null;
      } else if (e.button === 2) {
        const from = this.rightDownAt ?? p;
        this.rightClicks.push({ x: p.x, y: p.y, fromX: from.x, fromY: from.y });
        this.rightDown = false;
        this.rightDownAt = null;
      }
    });

    window.addEventListener("keydown", (e) => {
      // Track modifier state from the event itself so it can't get stuck.
      this.ctrl = e.ctrlKey;
      this.shift = e.shiftKey;
      // Stop Ctrl+1..9 from switching browser tabs, and Space from scrolling.
      if (e.ctrlKey && /^[1-9]$/.test(e.key)) e.preventDefault();
      if (e.key === " ") e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.pressedKeys.push(e.key.toLowerCase());
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === "Shift") this.shift = false;
      if (e.key === "Control") this.ctrl = false;
    });
  }

  /** Was the drag box released this frame? Returns it and clears the active flag. */
  consumeDragRelease(): DragBox | null {
    if (this.drag.active && !this.leftDown) {
      const box = { ...this.drag, start: { ...this.drag.start }, current: { ...this.drag.current } };
      this.drag.active = false;
      return box;
    }
    return null;
  }

  clearOneShots(): void {
    this.leftClicks.length = 0;
    this.rightClicks.length = 0;
    this.doubleClicks.length = 0;
    this.pressedKeys.length = 0;
    this.wheel = 0;
  }
}
