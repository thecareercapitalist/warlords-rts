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
  rightClicks: Vec2[] = [];
  pressedKeys: string[] = [];

  drag: DragBox = { start: { x: 0, y: 0 }, current: { x: 0, y: 0 }, active: false };
  shift = false;

  private dragThreshold = 6;
  private leftDownAt: Vec2 | null = null;

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.moved = true;
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
          this.leftClicks.push({ ...p });
        }
        // If it was a drag, Game reads drag box before we clear it.
        this.leftDown = false;
        this.leftDownAt = null;
      } else if (e.button === 2) {
        this.rightClicks.push({ ...p });
        this.rightDown = false;
      }
    });

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      this.pressedKeys.push(e.key.toLowerCase());
      if (e.key === "Shift") this.shift = true;
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === "Shift") this.shift = false;
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
    this.pressedKeys.length = 0;
  }
}
