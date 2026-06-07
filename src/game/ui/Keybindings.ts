// Remappable key bindings for player actions. Persisted to localStorage so the
// player's choices survive reloads. Contextual HUD hotkeys (build/train) stay
// data-driven elsewhere; this covers the global controls worth rebinding.

export type ActionId =
  | "scrollUp"
  | "scrollDown"
  | "scrollLeft"
  | "scrollRight"
  | "attackMove"
  | "stop"
  | "idleWorker"
  | "selectArmy"
  | "jumpBase"
  | "patrol";

export interface ActionInfo {
  id: ActionId;
  label: string;
}

export const ACTION_ORDER: ActionInfo[] = [
  { id: "scrollUp", label: "Scroll Up" },
  { id: "scrollDown", label: "Scroll Down" },
  { id: "scrollLeft", label: "Scroll Left" },
  { id: "scrollRight", label: "Scroll Right" },
  { id: "attackMove", label: "Attack-Move" },
  { id: "stop", label: "Stop" },
  { id: "idleWorker", label: "Idle Workers" },
  { id: "selectArmy", label: "Select Army" },
  { id: "jumpBase", label: "Jump to Base" },
  { id: "patrol", label: "Patrol" },
];

const DEFAULTS: Record<ActionId, string> = {
  scrollUp: "arrowup",
  scrollDown: "arrowdown",
  scrollLeft: "arrowleft",
  scrollRight: "arrowright",
  attackMove: "a",
  stop: "s",
  idleWorker: ".",
  selectArmy: "q",
  jumpBase: " ",
  patrol: "p",
};

const STORAGE_KEY = "warlords.keybindings.v1";

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
