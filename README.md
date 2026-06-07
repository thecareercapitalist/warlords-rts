# Warlords — a Warcraft I-style RTS

A from-scratch real-time strategy game in the spirit of the original *Warcraft:
Orcs & Humans* (1994). Built in TypeScript on a hand-rolled HTML5 Canvas engine —
no game framework, no third-party assets, no Blizzard IP. All art is programmer
art (coloured shapes + glyphs).

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
| Move / gather / attack | Right-click (context-sensitive) |
| Attack-move | Press `A`, then left-click a location |
| Build (with a worker selected) | `F` Farm · `B` Barracks · `W` Sawmill · `E` Temple · `H` Town Hall, then click to place |
| Help build / assign worker | Right-click an unfinished building with worker(s) selected |
| Cancel a building (full refund) | Select the unfinished building, click Cancel (`C`) |
| Stop | `S` |
| Set building rally point | Select the building, right-click a spot |
| Scroll the map | Arrow keys (rebindable) or push the screen edge |
| Jump the camera | Click/right-click the minimap |
| Pause / open menu | `Esc` |
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
- **Temple** is a tech building — once built, it unlocks **Knights** (heavy
  melee) at the Barracks.
- The **enemy AI** grows its economy, builds a barracks, and sends attack waves
  once its army is big enough.

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

1. Archers/ranged kiting and proper projectile visuals.
2. AI: defensive response when attacked, second-base expansion, scouting.
3. A second visually distinct faction (the `grunt` unit already exists in
   `defs.ts`, just not yet produced by any building).
4. Control groups (`Ctrl+1`…`9`) and double-click "select all of type".
5. Save/load and a map seed picker.
