// Remappable key bindings for player actions. Persisted to localStorage so the
// player's choices survive reloads. Contextual HUD hotkeys (build/train) stay
// data-driven elsewhere; this covers the global controls worth rebinding.

export type ActionId =
  | "scrollUp"
  | "scrollDown"
  | "scrollLeft"
  | "scrollRight"
  | "moveCmd"
  | "attackMove"
  | "stop"
  | "idleWorker"
  | "selectArmy"
  | "jumpBase"
  | "patrol"
  | "holdGround";

export interface ActionInfo {
  id: ActionId;
  label: string;
}

export const ACTION_ORDER: ActionInfo[] = [
  { id: "scrollUp", label: "Pan Up" },
  { id: "scrollLeft", label: "Pan Left" },
  { id: "scrollDown", label: "Pan Down" },
  { id: "scrollRight", label: "Pan Right" },
  { id: "moveCmd", label: "Move" },
  { id: "attackMove", label: "Attack-Move" },
  { id: "stop", label: "Stop" },
  { id: "holdGround", label: "Hold Position" },
  { id: "patrol", label: "Patrol" },
  { id: "selectArmy", label: "Select Army" },
  { id: "idleWorker", label: "Idle Workers" },
  { id: "jumpBase", label: "Jump to Base" },
];

// Defaults built around WSAD camera panning (arrow keys also pan, hard-wired).
const DEFAULTS: Record<ActionId, string> = {
  scrollUp: "w",
  scrollLeft: "a",
  scrollDown: "s",
  scrollRight: "d",
  moveCmd: "m",
  attackMove: "q",
  stop: "x",
  idleWorker: ".",
  selectArmy: "e",
  jumpBase: " ",
  patrol: "r",
  holdGround: "h",
};

const STORAGE_KEY = "warlords.keybindings.v2"; // v2: WSAD camera scheme

export class Keybindings {
  private map: Record<ActionId, string> = { ...DEFAULTS };

  constructor() {
    this.load();
  }

  get(action: ActionId): string {
    return this.map[action];
  }

  /** Assign a key to an action, clearing it from any other action first. */
  set(action: ActionId, key: string): void {
    const k = key.toLowerCase();
    for (const id of Object.keys(this.map) as ActionId[]) {
      if (this.map[id] === k) this.map[id] = ""; // avoid duplicate bindings
    }
    this.map[action] = k;
    this.save();
  }

  reset(): void {
    this.map = { ...DEFAULTS };
    this.save();
  }

  /** Human-readable label for a bound key (e.g. "arrowup" → "↑"). */
  display(action: ActionId): string {
    const k = this.map[action];
    if (!k) return "—";
    const pretty: Record<string, string> = {
      arrowup: "↑",
      arrowdown: "↓",
      arrowleft: "←",
      arrowright: "→",
      " ": "Space",
    };
    return pretty[k] ?? k.toUpperCase();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Record<ActionId, string>>;
      for (const id of Object.keys(this.map) as ActionId[]) {
        if (typeof parsed[id] === "string") this.map[id] = parsed[id]!;
      }
    } catch {
      // Corrupt/blocked storage — fall back to defaults silently.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.map));
    } catch {
      // Storage unavailable (private mode etc.) — bindings just won't persist.
    }
  }
}
