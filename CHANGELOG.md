# Changelog / Version History

Snapshots of Warlords between major improvements. Each version is a tagged git
commit — to see them: `git tag`, to inspect one: `git show v0.3.0`, to roll the
working tree back to one: `git checkout v0.3.0` (and `git checkout main` to
return). The autonomous improvement loop bumps the minor version and tags a new
snapshot after each major change.

## v0.44.0 — Camera shake _(2026-06-07)_
- A building **collapse now jolts the camera** with a short, decaying screen
  shake (applied to the world layer only — the HUD and color grade stay put), for
  a heavier sense of impact. Verified headlessly: a collapse sets shake to 7 and
  it decays to 0 within ~0.5s.

## v0.43.0 — AI builds towers _(2026-06-07)_
- The AI now fortifies its base with up to two **Guard Towers**, but only from
  genuine surplus (gold ≥ 300, wood ≥ 120) as the lowest-priority structure — so
  it never starves its army or economy. Verified headlessly: a surplus base tick
  builds a tower, and a full game is unchanged (still wins ~6.5 min with 8
  fighters), confirming no offensive regression.

## v0.42.0 — Turret visual _(2026-06-07)_
- The Guard Tower now reads as a proper **crenellated stone turret** — a tall
  column with merlons, a team-colored trim band, and a flickering ember
  arrow-slit — instead of a generic stone tile and glyph. Verified headlessly:
  the turret's ember slit (12 warm px) is present on a tower and absent on a farm.

## v0.41.0 — Tower range ring _(2026-06-07)_
- Selecting a Guard Tower (or any defensive building) now shows its **attack
  range** as a dashed ember ring (iso-squashed to match the ground plane), so you
  can plan coverage and overlap. Verified headlessly: the ring renders for a
  selected tower but not for a selected farm.

## v0.40.0 — Guard Tower _(2026-06-07)_
- New defensive building: the **Guard Tower** (`T`, 120g/40w, 1×1) auto-fires
  arrows at the nearest enemy unit within 6 tiles — finally a way to fortify
  chokepoints and your economy (very They Are Billions). Verified headlessly:
  a tower kills an in-range enemy, ignores out-of-range enemies, and never hits
  friendly units.

## v0.39.0 — AI workers flee raids _(2026-06-07)_
- The AI is smarter on defense: its **workers now retreat to the town hall** when
  an enemy soldier comes within ~3.5 tiles, then return to gathering once the
  threat clears — so harassing its economy is no longer a free slaughter.
  Verified headlessly: a raided worker flees toward base and resumes when safe.

## v0.38.0 — Resource depletion visual _(2026-06-07)_
- Forests and goldmines now visibly **darken as they're harvested toward empty**
  (overlay ∝ 1 − resource/max), so you can spot dwindling nodes at a glance and
  plan expansions. Verified headlessly: a near-empty forest renders darker (lum
  29) than a full one (56).

## v0.37.0 — Banner flutter _(2026-06-07)_
- Building team pennants now **flutter in the wind** (phase-offset per building),
  bringing the banners — a core North-Star ownership cue — to life. Verified
  headlessly: the banner region animates between clock values.

## v0.36.0 — Idle breathing _(2026-06-07)_
- Resting units now gently bob (phase-offset per unit so they don't pulse in
  unison), completing the always-alive motion set with walk-bob and gather-swing.
  Verified headlessly: an idle unit's body animates between clock values.

## v0.35.0 — Gather-swing animation _(2026-06-07)_
- Threaded an animation clock into the renderer and used it for a **gather
  swing**: workers now rhythmically lurch toward the resource they're harvesting
  (chop/mine motion), instead of standing inert. Verified headlessly: a gathering
  worker's body animates between clock values while an idle worker stays still.

## v0.34.0 — Veterancy _(2026-06-07)_
- Units now earn **veterancy** from kills: 2 kills → rank 1 (+15% damage), 5 →
  rank 2 (+30%), shown as small ember chevron pips above the unit. Keeping a
  battle-hardened squad alive now matters. Applies to both sides. Verified
  headlessly: a knight (16 dmg) with 2 kills dealt 18.4 (×1.15).

## v0.33.0 — Construction scaffolding _(2026-06-07)_
- Buildings under construction now visibly **rise from the bottom** with wooden
  scaffold beams and poles over the unbuilt portion, instead of a plain dark
  fill — a clearer, more characterful "under construction" cue. Verified
  headlessly: a 30%-built barracks shows the dark unbuilt overlay plus a wood
  scaffold beam.

## v0.32.0 — Jump-to-base hotkey _(2026-06-07)_
- Press `Space` (rebindable) to snap the camera to your town hall — or to the
  latest attack location while you're under assault. Space is prevented from
  scrolling the page. Verified headlessly: the town hall centers exactly after a
  jump from off-screen.

## v0.31.0 — Select-army hotkey _(2026-06-07)_
- Press `Q` (rebindable) to select your whole army — all combat units
  (footmen/archers/knights), excluding workers — and center on them. Says "No
  army units" when you have none. Verified headlessly: selects the 3 combat units,
  excludes workers.

## v0.30.0 — Cancel queued unit _(2026-06-07)_
- A producing building now shows a **Cancel** button (`C`) that cancels the last
  queued unit and refunds its cost — the unit-queue counterpart to building
  cancel. Verified headlessly: cancelling refunds 90g per footman and clears the
  queue/timer.

## v0.29.0 — Production progress bar _(2026-06-07)_
- A building training a unit now shows an ember progress bar above it (filled by
  productionTimer/buildTime), so you can see how close the next unit is at a
  glance. Verified headlessly: a producing barracks shows a partially-filled
  ember bar matching its timer.

## v0.28.0 — Walk-bob animation _(2026-06-07)_
- Moving units now bob up and down a little (tied to distance travelled, so it
  stops cleanly when they halt) while their shadow and base ring stay planted —
  a touch of life in motion. Verified headlessly: a moving unit's body renders
  lifted above its ground point, no errors.

## v0.27.0 — Kill counter _(2026-06-07)_
- Death/collapse events now carry the killer, so the game tallies enemy units and
  buildings *you* destroyed and shows "Enemies slain: N" on the end screen
  alongside the time. Verified headlessly: a human knight's 2 kills counted; an
  enemy killing a human unit did not.

## v0.26.0 — Multi-select breakdown _(2026-06-07)_
- Selecting several units now shows the composition (e.g. "3 Footman · 2 Archer ·
  1 Worker") under the count, instead of just "N units selected". Verified
  headlessly: summary lists per-type counts, most numerous first.

## v0.25.0 — End-game polish _(2026-06-07)_
- Victory/defeat now plays a one-shot audio sting (triumphant rising chord / a
  somber descending dirge) and the end screen shows the **elapsed time**. Verified
  headlessly: the fanfare fires once on game end and the timer is tracked.

## v0.24.0 — AI economy balance _(2026-06-07)_
- Fixed the AI starving itself: it mined only gold (piling up unused) while wood
  sat near zero, so it couldn't afford farms — leaving it supply-capped (~13)
  with an army of ~5, below its own attack threshold, so it never attacked.
- Now ~a third of AI workers gather wood, army training runs every tick (no
  longer starved behind structure builds), and it can add a second barracks.
- Result, verified headlessly: wood 10→556, farms 2→4, supply 13→17, army to 8+,
  first attack wave ~3.5 min, and it destroys a passive opponent (a real threat
  again).

## v0.23.0 — Building collapse _(2026-06-07)_
- Destroyed buildings now **collapse** — an expanding dust cloud with scattered
  debris, sized to the footprint, plus a low rumble — instead of popping out with
  a tiny unit-style token. Verified headlessly: a destroyed barracks emitted a
  size-96 collapse and no unit death token.

## v0.22.0 — Floating resource gains _(2026-06-07)_
- Depositing gold/wood now pops a rising, fading **"+N"** in the resource's color
  (with an inked outline) above the drop-off — small but satisfying economy
  feedback. Verified headlessly: a wood deposit spawned a "+8" floater.

## v0.21.0 — Formation move _(2026-06-07)_
- Right-clicking empty ground with several units selected now spreads them into a
  centered grid instead of sending everyone to the exact same tile (where they'd
  shove for position). Resource/attack/build commands are unaffected. Verified
  headlessly: 5 units got 5 distinct destinations in a tidy grid.

## v0.20.0 — Idle-worker hotkey _(2026-06-07)_
- Press `.` (rebindable) to select every idle worker and snap the camera to one —
  the staple for keeping your economy busy. Shows "No idle workers" when there are
  none. Added as a rebindable action (also in the pause-menu controls list).
  Verified headlessly (selects idle workers, excludes busy ones).

## v0.19.0 — Minimap attack ping _(2026-06-07)_
- The "under attack" warning now also drops a **pulsing ember ping on the
  minimap** at the spot you're being hit, refreshed while the assault continues
  and fading after ~4s — so you can see *where* to respond. Verified headlessly
  (ping sets at the victim's location and ages out).

## v0.18.0 — AI fields a mixed army _(2026-06-07)_
- The enemy AI now builds a **Temple** and trains a rotating **mix of footmen,
  archers, and knights** (gated on wood/gold/tech) instead of only footmen — a
  more varied, threatening opponent. Verified headlessly: in a long sim the AI
  built a temple and produced archers alongside footmen.

## v0.17.0 — Gothic buildings (stone + banner) _(2026-06-07)_
- Buildings now render as **stone structures** with a heavy inked outline, a thin
  team-colored trim, and a **team banner on a pole** at the top for ownership —
  instead of flat team-colored diamonds. Matches the "team identity via
  banner/trim" art rule. Verified the body is stone and the banner is team color.

## v0.16.0 — Unit base rings + inked outlines _(2026-06-07)_
- Units now sit on a **team-colored ground ring** (ownership reads from the ring,
  per the art direction) and carry a **heavier dark inked outline** for the
  chunky gothic look. Forward-compatible with real sprites later (the ring keeps
  team identity even when bodies become painted art). Verified the ring renders
  in the player color.

## v0.15.0 — Double-click select-all-of-type _(2026-06-07)_
- Double-click a unit to select every friendly unit of that same kind currently
  in view — the standard RTS shortcut for grabbing your whole footman line or
  worker pool fast. Verified headlessly (selects the in-view peons, excludes the
  footman and off-screen units).

## v0.14.0 — "Under attack" alert _(2026-06-07)_
- When your units or buildings take damage you now get a throttled warning — an
  on-screen "⚔ Your forces are under attack!" message plus an ominous low
  two-tone Web Audio cue (6s cooldown so it doesn't spam). Pairs with the AI's
  new aggression so a base assault never goes unnoticed. Verified headlessly.

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
