# Changelog / Version History

Snapshots of Warlords between major improvements. Each version is a tagged git
commit — to see them: `git tag`, to inspect one: `git show v0.3.0`, to roll the
working tree back to one: `git checkout v0.3.0` (and `git checkout main` to
return). The autonomous improvement loop bumps the minor version and tags a new
snapshot after each major change.

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
