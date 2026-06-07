import { Game } from "./game/Game.ts";
import type { World } from "./game/World.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Missing #game canvas");

const game = new Game(canvas);
game.start();

// Dev-only: expose the instance so the loop can be pumped manually in headless
// preview contexts where requestAnimationFrame is paused (hidden tab).
if (import.meta.env.DEV) {
  (window as unknown as { __game: Game }).__game = game;
  void import("./debug.ts").then((m) =>
    m.attachDebug(game, () => (game as unknown as { world: World }).world),
  );
}
