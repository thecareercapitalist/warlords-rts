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

**Easiest (Windows):** double-click **`Play Warlords.cmd`** — it starts a local
server and opens the game in your browser. Keep that window open while you play.

From a terminal:

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build    # outputs to dist/  (relative paths; serve over http)
npm run preview  # serves the built bundle over http
```

### Play with no server (single file)

```bash
npm run build:offline   # writes Warlords.html at the repo root
```

`Warlords.html` is fully self-contained (JS + terrain tiles inlined), so you can
**double-click it** to play straight from disk — no server needed.

> **Heads-up:** you can't just double-click `dist/index.html`. Browsers block
> ES-module loading over `file://`, so it'd hang on "Loading Warlords…". Use the
> launcher, `npm run preview`, or the single-file `Warlords.html` above.

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
| Queue move waypoints | `Shift` + right-click open ground |
| Attack-move | Press `A`, then left-click a location |
| Patrol | Press `P`, then left-click a point (marches back and forth) |
| Hold position | Press `Z` to toggle (selected units fire in range but never chase) |
| Build (with a worker selected) | `F` Farm · `B` Barracks · `W` Sawmill · `E` Temple · `G` Forge · `T` Guard Tower · `L` Wall · `H` Town Hall, then click to place |
| Help build / assign worker | Right-click an unfinished building with worker(s) selected |
| Repair a building | Right-click a damaged friendly building with worker(s) selected |
| Cancel a building (full refund) | Select the unfinished building, click Cancel (`C`) |
| Stop | `S` |
| Assign / recall control group | `Ctrl+1…9` assign · `Shift+1…9` add · `1…9` recall (double-tap to center camera) |
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
  **armored** melee that shrug off part of every hit) at the Barracks, and it
  slowly **heals friendly units standing nearby**.
- **Guard Tower** is a cheap defensive building that auto-fires at enemies in
  range — fortify your chokepoints and resource lines.
- **Forge** is a tech building — while it stands, all your units gain +2 attack,
  and it unlocks the **Catapult** (slow siege unit; 4× damage to buildings) at
  the Barracks.
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

## What's here now

Beyond the vertical slice, the autonomous improvement loop (see `CHANGELOG.md`,
tagged `v0.3.0`→) has layered on a lot:

- **Economy & tech:** gold + wood, Farms (supply), Sawmill, Temple (unlocks
  Knights), **Forge** (+attack upgrade while it stands), **Guard Towers** (auto-
  firing defense). Cancel/refund for buildings *and* queued units.
- **Combat depth:** armor (Knights shrug off part of each hit), **veterancy**
  (kills → rank → +damage, with a gold elite aura), projectiles, ranged towers,
  and a Forge-gated **Catapult** siege unit (4× damage to buildings, plus splash
  to clustered enemies).
- **Command suite:** control groups (Ctrl-assign / Shift-add / double-tap to
  center), drag-select, double-click select-all-of-type, select-army, idle-worker
  jump, formation move, **shift-click waypoint queues**, **patrol**, attack-move,
  **hold-position stance**, jump-to-base, rebindable keys, save/load. Colored
  move/attack-move destination rings.
- **Game feel:** procedural Web-Audio SFX (incl. a deep siege thud + unit-ready
  chime) + victory/defeat stings, walk-bob, idle breathing, gather-swing, banner
  flutter, construction scaffolding, hit sparks, muzzle flashes, building collapse
  + camera shake, death decals, damage smoke, Forge embers + Town Hall hearth glow,
  Temple heal aura, rim-lit units & buildings, health-graded bars, under-attack
  screen pulse.
- **Faction identity:** the enemy host reads apart by silhouette (orcish cleavers,
  bone bows, horned knights, bone tools, ragged banners) while staying
  team-coloured — not a full recolour.
- **Smarter AI:** balanced wood economy, mixed army (footmen/archers/knights/
  catapults), defends its base, **workers flee raids**, **repairs** and **finishes
  stalled buildings** (2 builders), keeps a small **home guard** during attack
  waves, and spends surplus on Forges and Towers.

## What's intentionally not here (yet)

- **Multiplayer.** Out of scope — deterministic lockstep netcode is months of
  work. Single-player skirmish only.
- **Hand-quality pixel-art sprites & frame animation.** Units/buildings are
  procedural code-art (shaded shapes, glyphs, rim light); buildings like the Forge
  and Tower have bespoke silhouettes, but there are no drawn sprite sheets yet.
- **Campaign / mission scripting.** A single skirmish vs. one AI.
- **Spellcasters / abilities.** Combat is stat-based (damage/armor/veterancy); no
  active abilities yet.
- **Flow-field pathfinding.** A* per unit + separation works for these counts but
  large armies still jostle in chokepoints.

## Good next steps

1. **Real unit sprites + frame animations** — the big remaining art lift. Needs an
   image-gen hookup (the Pixelcut MCP is wired but loads only at session start +
   needs auth) or more CC0 art; otherwise keep refining the procedural look.
2. **A second visually distinct faction** — the `grunt` unit already exists in
   `defs.ts`; give the AI side its own units/trim for real Orcs-vs-Humans flavor.
3. **Smarter AI still:** scouting, second-base expansion, focus-fire micro,
   difficulty levels.
4. **More units/abilities:** a ranged-siege unit, a healer, or a caster with one
   active ability.
5. **Flow-field / formation pathing** for big armies; map seed picker UI.
