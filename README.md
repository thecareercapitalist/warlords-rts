# Warlords — a Warcraft I-style RTS

A from-scratch real-time strategy game in the spirit of the original *Warcraft:
Orcs & Humans* (1994). Built in TypeScript on a hand-rolled HTML5 Canvas engine —
no game framework, no Blizzard IP. Terrain uses CC0 isometric tiles from
[Screaming Brain Studios](https://screamingbrainstudios.itch.io/); buildings and
units are still programmer art (coloured shapes + glyphs) for now.

Rendering is **isometric**, but the simulation runs on a plain square grid — only
drawing and picking project to/from the iso plane (`src/game/render/iso.ts`).

This is a **playable vertical slice**: gather resources, build a base, train an
army, and destroy an AI opponent that does the same.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build    # outputs to dist/
npm run preview
```

> **Note:** the game uses `requestAnimationFrame`, which browsers pause in
> hidden/background tabs — so the game only runs while its tab is visible and
> focused. That's intentional (it pauses when you tab away).

## How to play

You start with a Town Hall and 4 workers (auto-sent to mine gold).

| Action | Control |
| --- | --- |
| Select a unit/building | Left-click |
| Select multiple units | Left-drag a box |
| Add to selection | Shift + click |
| Select all of a type in view | Double-click a unit |
| Move / gather / attack | Right-click (context-sensitive) |
| Attack-move | Press `A`, then left-click a location |
| Build (with a worker selected) | `F` Farm · `B` Barracks · `W` Sawmill · `E` Temple · `T` Guard Tower · `H` Town Hall, then click to place |
| Help build / assign worker | Right-click an unfinished building with worker(s) selected |
| Repair a building | Right-click a damaged friendly building with worker(s) selected |
| Cancel a building (full refund) | Select the unfinished building, click Cancel (`C`) |
| Stop | `S` |
| Assign / recall control group | `Ctrl+1…9` to assign · `1…9` to recall |
| Select idle workers | `.` (rebindable) |
| Select whole army | `Q` (rebindable) |
| Jump to base / latest attack | `Space` (rebindable) |
| Set building rally point | Select the building, right-click a spot |
| Scroll the map | Arrow keys (rebindable) or push the screen edge |
| Zoom in / out | Mouse wheel (toward the cursor) |
| Mute / unmute sound | `M` |
| Jump the camera | Click/right-click the minimap |
| Pause / open menu | `Esc` (Save Game / Load Game live here) |
| Rebind keys | `Esc`, then click a control's key box and press a new key (saved automatically) |
| Restart (after win/loss) | `R` |

**Goal:** wipe out the enemy (red). You lose if you have no buildings *and* no
workers left to rebuild.

### The loop
- **Workers** mine gold from goldmines (`$`) and chop wood from forests, hauling
  loads back to the nearest drop-off.
- **Town Hall** accepts gold *and* wood and trains workers.
- **Sawmill** accepts wood — build one near a forest to shorten lumber trips.
- **Farms** raise your supply cap; you can't train past it.
- **Barracks** train Footmen (melee) and Archers (ranged, cost wood).
- **Temple** is a tech building — once built, it unlocks **Knights** (heavy,
  **armored** melee that shrug off part of every hit) at the Barracks.
- **Guard Tower** is a cheap defensive building that auto-fires at enemies in
  range — fortify your chokepoints and resource lines.
- The **enemy AI** grows its economy, builds a barracks, and sends attack waves
  once its army is big enough.
- **Veterancy:** units gain rank from kills (ember chevrons) — rank 1 at 2 kills
  (+15% damage), rank 2 at 5 (+30%). Keep your veterans alive.

## Art direction — the visual North Star

**Grim gothic fantasy RTS:** *Warcraft* × *They Are Billions* × *Darkest Dungeon*.

- **Warcraft** — chunky, readable, characterful fantasy units; clear silhouettes.
- **They Are Billions** — dark, dense, gritty survival mood; muted, slightly
  desaturated world; lots of small units that still read at a glance.
- **Darkest Dungeon** — high-contrast, hand-painted/inked look; heavy black
  outlines and dramatic shadow; desaturated palette with *selective* accent
  color; gothic grimness; warm torch/ember highlights against cold gloom.

Practical rules:
- Heavy dark outlines + strong rim light so units pop on terrain.
- Muted earthy base palette (mossy greens, cold stone greys, rust, bone);
  restrained, deliberate accent colors only.
- **Team identity via banners / trim / a colored base ring — not a full-body
  recolor** (keeps the painted look while staying readable).
- Everything must read at small isometric scale; favor silhouette over detail.
- UI/HUD follows suit: dark stone panels, inked borders, ember accents.

This applies to generated art, procedural/code-drawn art, and UI theming alike.

## Architecture

Plain TypeScript, no engine. Systems operate over a central `World`.

```
src/
  main.ts                 entry point
  game/
    Game.ts               orchestrator: loop, input handling, selection, win/loss
    World.ts              all game state (map, players, units, buildings)
    Camera.ts             world↔screen transforms, clamping, culling
    Input.ts              raw mouse/keyboard → one-shot events + drag box
    constants.ts          all tunables (balance, colours, sizes)
    types.ts              shared types/enums
    map/TileMap.ts        procedural terrain (lakes, forests, rock, goldmines)
    pathfinding/astar.ts  8-direction A* with a binary heap, no corner-cutting
    entities/
      defs.ts             unit & building stats (one place to balance)
      Unit.ts, Building.ts
    systems/
      movement.ts         path-following + boids-style separation
      orders.ts           issuing commands + path/adjacency helpers
      gather.ts           mine→carry→deposit→repeat state machine
      production.ts       construction + unit production queues + supply
      combat.ts           target acquisition, chase, melee/ranged, death
      placement.ts        building placement validation
      fog.ts              per-tile visibility (hidden/explored/visible)
      ai.ts               build-order driven skirmish AI
      selection.ts        hit-testing for clicks and drag boxes
    render/Renderer.ts    terrain, entities, fog, HUD overlays
    ui/Hud.ts             resource bar, command buttons, minimap, end screen
```

Run `npm run typecheck` for a strict type pass (the project builds clean under
`strict` + `noUnusedLocals`/`noUnusedParameters`).

## What's intentionally not here (yet)

Honest scope notes for whoever picks this up next:

- **Multiplayer.** Deliberately out of scope — deterministic lockstep netcode is
  months of work. Single-player skirmish only.
- **Sound, animation, real art.** Everything is shapes + glyphs.
- **Campaign / mission scripting.** It's a single skirmish vs. one AI.
- **Tech tree / upgrades / spellcasters.** Two production buildings, three
  combat units, one worker.
- **Smarter AI.** The AI follows a fixed build order and throws attack waves; it
  doesn't scout, defend reactively, expand to new bases, or micro.
- **Flow-field pathfinding.** A* per unit + separation works for these counts
  but large armies will still jostle in chokepoints.

## Good next steps

### Code-generated — no external assets needed (loop tackles these)
1. **Combat & motion animations**: attack lunge/recoil, hit flashes, death
   fade-out, walk bob, construction scaffolding, gather swing.
2. **Projectiles**: arrows/spears that fly from archer to target with an arc +
   impact puff.
3. **Procedural sound** via the Web Audio API: sword clang, arrow whoosh, click,
   build-complete chime, death — synthesized in code, no audio files. Optional
   ambient/music bed.
4. **Procedurally-drawn unit sprites**: replace flat circles with shaded,
   team-coloured little soldiers/workers drawn + animated in code.
5. **UI theming**: beautify the HUD and pause menu (panels, gradients, on-theme
   framing) — all canvas drawing.
6. Building sprites from the **SBS Town pack** (real pixel art we already have in
   `pixel packs/`, 64×96), plus terrain-tile variety (each sheet has 18 cells).

### Gameplay
7. AI: defensive response when attacked, second-base expansion, scouting.
8. Control groups (`Ctrl+1`…`9`) and double-click "select all of type".
9. Save/load and a map seed picker.
10. A second visually distinct faction (the `grunt` unit already exists in `defs.ts`).

### Needs an asset source or image-gen hookup
11. Hand-quality **pixel-art unit sprites + frame animations**: not producible by
    the in-environment tools (no text-to-image). Options: wire up an image-gen
    API/MCP, source more CC0 art, or stick with the procedural sprites from (4).
