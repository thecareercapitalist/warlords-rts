# Changelog / Version History

Snapshots of Warlords between major improvements. Each version is a tagged git
commit — to see them: `git tag`, to inspect one: `git show v0.3.0`, to roll the
working tree back to one: `git checkout v0.3.0` (and `git checkout main` to
return). The autonomous improvement loop bumps the minor version and tags a new
snapshot after each major change.

## v0.13.0 — Building repair _(2026-06-07)_
- Right-click a damaged friendly building with worker(s) selected to **repair**
  it: assigned workers restore ~28 HP/sec each (up to 3) for a small gold cost
  (0.2 gold/HP), stopping when full or out of gold and then returning to idle.
  Verified headlessly (680→800 HP, 24 gold spent, worker released).

## v0.12.0 — Gothic HUD theming _(2026-06-07)_
- Recolored the HUD to the art North Star: dark stone-brown panels, ember accent
  lines on the resource/command bars, ember-bordered command buttons, gold/ember
  resource readouts, and parchment text. Verified the bar fills and ember accents
  render in the new palette. Added a reusable UI palette to `constants.ts`.

## v0.11.0 — Gothic color grade _(2026-06-07)_
- First step toward the art North Star: a world color grade — a faint cool gloom
  wash plus a vignette that darkens the edges and focuses the centre, drawn over
  the world but under the UI (HUD stays crisp). Reversible overlay. Verified the
  vignette darkens edges vs. centre. More visual cohesion (palette, sprites) to
  follow.

## v0.10.0 — Save / Load _(2026-06-07)_
- **Save Game / Load Game** buttons in the Esc pause menu. State persists to
  localStorage: resources, every unit (kind/pos/HP/carried load), every building
  (kind/footprint/state/construction/HP/queue/rally), terrain resource amounts,
  and the explored fog mask. Transient orders/targets reset to idle on load so a
  save can never hold a dangling reference. Verified headlessly via the menu
  buttons (save → mutate → load restores exactly).

## v0.9.0 — AI base defense _(2026-06-07)_
- The enemy AI now **defends**: when your units come within ~12 tiles of any of
  its buildings, it pulls its whole army home (interrupting an offensive wave) to
  meet the threat, then resumes attacking once the area is clear. Sieging the AI
  while its army marches at you is no longer free. Verified headlessly (an
  away-marching wave redirects home when attackers appear at the base).

## v0.8.0 — Control groups _(2026-06-07)_
- **Ctrl+1…9** assigns the current unit selection to a numbered control group;
  **1…9** recalls it. Dead units are pruned on recall. Standard RTS muscle
  memory for managing armies. Verified headlessly (assign → recall → prune).

## v0.7.0 — Terrain variety _(2026-06-07)_
- Each terrain tile now picks a stable, hashed variant cell from its SBS sheet
  (18 variations per sheet) instead of always cell (0,0), so the ground reads as
  varied natural terrain rather than one repeated tile. No new assets; the
  variant is deterministic per tile coordinate (no flicker).

## v0.6.0 — Sound, zoom & launcher _(2026-06-07)_
- **Procedural sound effects** via the Web Audio API (no audio files): sword
  clang, arrow whoosh, build-complete chime, death, UI click — synthesized in
  code and driven off the `World.events` bus. AudioContext unlocks on first
  input; `M` toggles mute (persisted); a 🔊/🔇 indicator shows state.
- **Mouse-wheel zoom** toward the cursor, clamped (0.35×–1.8×).
- **`Play Warlords.cmd`** — one-click launcher that installs deps if needed,
  starts the dev server, and opens the browser. Make a desktop shortcut to it.

## v0.5.0 — Combat juice _(2026-06-07)_
- Added a presentation event bus (`World.events`) drained each frame into an
  `Effects` layer — gameplay stays decoupled from visuals.
- **Projectiles**: ranged attackers (archers) loose an arrow that arcs to the
  target with an arrowhead.
- **Attack lunge**: units nudge toward their target on each strike.
- **Hit flash**: units and buildings flash white when they take damage.
- **Death fade**: slain units leave a fading, rising token instead of vanishing.
- All verified headlessly (projectile/flash/lunge/death FX fire) and on-screen.

## v0.4.0 — Isometric renderer _(2026-06-07)_
- Rendering is now **isometric**, drawing real pixel-art terrain from the CC0
  Screaming Brain Studios Overworld tiles (grass/water/forest) in `public/tiles`.
- The simulation is untouched — it still runs on a square world grid; only
  rendering and click/drag picking project to/from the iso plane (see
  `render/iso.ts`). Round-trips are exact, so the game stays fully playable.
- Camera, selection, fog, minimap viewport, and build preview are all iso-aware;
  tiles are drawn clipped to their diamond so the no-alpha tile backgrounds
  never leak.
- Fixes: edge-scroll no longer drags the camera into the corner before the mouse
  has moved; the camera now reliably centers on the town hall once the viewport
  has real dimensions.
- Buildings and units are still flat colored shapes (projected) — unit/building
  sprites are a future pass.

## v0.3.0 — QoL pass _(2026-06-07)_
- Camera can pan past the map edges (one tile each side, HUD-height at the
  bottom) so the command bar no longer hides the bottom map rows.
- `Esc` pause menu: pauses the simulation, offers Resume/Restart, and lets you
  rebind the camera/attack-move/stop keys — saved to localStorage.

## v0.2.0 — Feature pass _(2026-06-07)_
- Cancel an unfinished building (full refund, tiles freed, workers released).
- Right-click an under-construction building to send workers to help build it.
- **Sawmill** — a wood drop-off; drop-off routing is now resource-aware.
- **Temple** tech building unlocks the **Knight** unit at the Barracks.

## v0.1.0 — Playable vertical slice _(2026-06-07)_
- Procedural tile map (grass/water/forest/rock/goldmines).
- 8-direction A* pathfinding + unit separation.
- Click/box selection, right-click context commands, attack-move.
- Resource gathering loop, building placement + construction, production queues,
  farm supply cap.
- Combat (melee + ranged, units and buildings), fog of war.
- Build-order-driven enemy AI with attack waves.
- HUD, minimap, win/loss + restart.

---
_History begins at v0.3.0; earlier entries document the lineage that led to the
first committed snapshot._
