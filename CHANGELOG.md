# Changelog / Version History

Snapshots of Warlords between major improvements. Each version is a tagged git
commit — to see them: `git tag`, to inspect one: `git show v0.3.0`, to roll the
working tree back to one: `git checkout v0.3.0` (and `git checkout main` to
return). The autonomous improvement loop bumps the minor version and tags a new
snapshot after each major change.

## v0.139.0 — Top-bar overhaul + corner posts _(2026-06-07)_
- **Fixed the top-bar overlap:** transient messages now render as a centered banner
  *below* the bars instead of colliding with the idle indicators.
- **Idle indicators are clickable pills** (right-aligned): clicking **idle workers**
  selects all of them and centers the camera; clicking **idle buildings** cycles the
  camera through them one per click.
- **Control-group chips (1–0)** strip under the resource bar — shows each active
  group's number + unit count; click a chip to recall it (double-click centers).
- **Wall corners fixed:** runs stay continuous, and a bend/T/cross is now capped by
  a crenellated **stone corner post** (a fortified turret) instead of two walls
  overlapping into a lump.

## v0.138.0 — Hand-painted iso walls _(2026-06-07)_
- Replaced the code-art walls with a **generated gothic stone rampart** (Gemini),
  rendered at the two isometric diagonals — the sprite as-drawn is a N–S wall, and
  it's mirrored for E–W. Corners draw both, overlapping into an L. Segments are
  scaled to overlap so a run reads as one continuous battlemented wall. Matches the
  tower/building art quality.

## v0.137.0 — Proper stone walls + no box in build mode _(2026-06-07)_
- **Walls look good again:** replaced the flat slab "beams" with real isometric
  **volumes** — a lit top face, two shaded side faces, an inked outline, rim light,
  and 3D crenellated merlons along the top. They still auto-connect into runs and
  corners along the grid.
- **No selection box while building:** the drag-select rectangle is suppressed
  whenever a building is being placed, so dragging a wall line no longer flashes a
  green selection box.

## v0.136.0 — Bigger spells + iso walls + drag-build _(2026-06-07)_
- **Spell FX ~4× bigger:** the blast radius was computed in world-units-as-pixels,
  rendering far smaller than the actual AoE. Now sized in screen space so the
  Fireball/Freeze explosions cover (and slightly exceed) their tile footprint —
  with a rolling shock ring, more/larger embers, a double frost ring, and shards.
- **Walls are now isometric + auto-connecting:** the generated wall sprite was
  front-facing and read wrong on the diamond grid. Walls are drawn as raised
  crenellated stone beams that run along the iso grid and connect to neighbors
  (straight runs + corners).
- **Drag to build walls:** in wall-build mode, click-drag to lay a straight run of
  walls (snapped to the dominant axis) in one gesture.
- **Auto-continue construction:** a builder that finishes a building automatically
  moves to the nearest unfinished friendly building nearby — so a dragged wall-line
  gets built end to end by one worker without re-tasking. Verified: peon finishes
  wall, walks to the next, repeats.

## v0.135.0 — Build reveal + drag fix + sawmill auto-chop _(2026-06-07)_
- **Buildings now rise as they build:** instead of a dark floor-fill + scaffolding,
  the building sprite itself is the progress bar — a faint ghost of the finished
  structure with the solid art revealed bottom→top and a glowing "mason's line" at
  the build front.
- **Drag-select fixed properly:** selection now tests **screen-space** containment.
  Previously two screen corners were converted to a world-space axis-aligned rect,
  but an axis-aligned screen box maps to a *rotated* quad in the iso world, so the
  selected region didn't match the visible box — the real cause of the finicky
  drag. Verified: a box over 6 of 8 units selects exactly those 6.
- **Sawmill auto-chop:** a worker that finishes a Sawmill automatically starts
  chopping the nearest forest instead of going idle.

## v0.134.0 — New grass + water tiles _(2026-06-07)_
- Replaced the terrain tiles with **lush hand-painted ground**: a They-Are-Billions
  / Warcraft-style **grass** texture (deep green with subtle dirt paths, moss, and
  pebbles) and **moody rippling water** (dark teal with foam), both generated via
  Gemini and clipped per isometric diamond. The map now reads as a continuous
  green field rather than a noisy checkerboard. Offline packer sniffs PNG/JPEG mime
  so the inlined tiles decode correctly.

## v0.133.0 — UI polish + fixes _(2026-06-07)_
- **Gold/Wood always show as integers** (floored on display) — no more
  `1912.8000000…097` floating-point drift.
- **Cooler HUD + menus:** the top resource bar and bottom command bar now use a
  beveled stone gradient with an ember edge + highlight/shadow lips and section
  dividers; command buttons are raised-stone (gradient + bevel + ember border);
  the **pause menu** is reskinned (gradient panel, double ember/ink frame, titled
  "⚔ Paused ⚔" with an underline, beveled buttons).
- **Fixed HP-bar clipping:** tall building sprites (e.g. the Enclave) had their HP
  bar drawn across the middle; it now sits above the actual sprite top.

## v0.132.0 — Spell system: Fireball, Freeze, mana, autocast _(2026-06-07)_
- The Mage now has **mana** (120, regen 7/s; shown as a blue bar) and two spells:
  - **Fireball** (35 mana) — a targeted **area blast** (2-tile radius, 34 dmg) with
    a fiery explosion FX (expanding flame ring, embers, core flash) + a camera jolt.
  - **Freeze** (30 mana) — a targeted **frost nova** (2.6-tile radius) that **slows**
    enemies to half speed for 4s and **tints them blue** (an icy ring + shards).
- **Casting:** select a mage, **left-click** a spell (or its hotkey) → click a target
  to cast. **Right-click** a spell button toggles **autocast** — the mage keeps
  casting it at the nearest enemy in range until out of mana — shown by a pulsing
  blue border + an "A" badge on the icon.
- Slowed units move at half speed (movement) and render with a frost tint.
- Art for the mage + enclave was generated via **Gemini (Composio)** last pass.
  Verified in-game: fireball damages a cluster + spawns a fire blast; freeze slows
  and chills four enemies; mana drains and gates on cooldown.

## v0.131.0 — First spellcaster: Mage + Mage's Enclave _(2026-06-07)_
- New **Mage** unit — a robed arcane caster that hurls a **glowing blue bolt** (a
  proper magic projectile, not an arrow) with small **splash**; trained at the new
  **Mage's Enclave** tower (`C` to build, 180g/80w). Strong ranged damage (16),
  range 5, 50 HP. Gated behind the Enclave.
- Art generated via **Gemini (Nano-Banana Pro) through Composio** — the new image
  pipeline: a hooded mage and a runed arcane tower, magenta-keyed and sliced like
  the Pixelcut sheets. Shared by both factions (team identity stays on ring/banner).
- Verified in-game: mage + enclave sprites load and render; the arcane bolt draws
  as a glowing orb.

## v0.130.0 — Drag-select fix + bigger arrows _(2026-06-07)_
- **Fast drag-select fixed:** a quick flick could fire mousedown→mouseup with no
  mousemove between, so the box never armed and it registered as a click (clearing
  the selection). Mouseup now treats any release past the drag threshold as a box
  select. This is the real cause behind "drag doesn't work half the time, esp.
  fast."
- **Bigger arrows:** archer/tower projectiles are larger and clearer — inked shaft
  with a wood highlight, a steel head, and red fletching. Siege stones bigger too.

## v0.129.0 — Procedural animation polish _(2026-06-07)_
- Richer life on the single sprites (no new art): a fuller **walk cycle** (bigger
  footfall bob + gentle side-to-side sway) and a **hit-react flinch** — units drop
  and compress for an instant when struck (folded into the squash/stretch). Builds
  on the v0.128 attack lunge.

## v0.128.0 — Attack lunge + squash _(2026-06-07)_
- Attacking units now play a real **strike**: a melee unit lunges ~0.5 tile toward
  its target (ranged units recoil back) on an out-and-back swing, with a squash/
  stretch for weight. The old lunge was 6 world-units — invisible under the bigger
  sprites, so attackers looked frozen (the "grunt doesn't move while attacking"
  bug). Verified: a mid-swing footman renders clearly displaced + stretched vs an
  idle one.

## v0.127.0 — Forest map: lush grass, mountains, lakes _(2026-06-07)_
- **Ground is now mostly lush grass** (They-Are-Billions vibe): grass tiles favour
  the greenest sheet variants (n² bias over the patch-noise), with only occasional
  dry/rocky patches — far less random-looking.
- **Forest map:** generation is forest-heavy now (forest blobs 10–16 → 20–30,
  larger), with **bigger lakes** (radius 3–7, 4–7 of them).
- **Mountains drawn:** rock tiles render generated **isometric mountain sprites**
  (peak / hill / cliff / boulders), so rock clusters read as mountain ranges
  instead of flat grey.
- **Resource floaters 75% larger again** (46→80px).

## v0.126.0 — Auto-attack, vision, bars, terrain regions _(2026-06-07)_
- **Auto-attack aggro:** idle/moving combat units now engage enemies within a
  generous radius (visionRadius + 3; +2 while attack-moving), so troops — and the
  AI — defend themselves instead of standing idle next to a foe. Verified: two idle
  enemy footmen 2 tiles apart both engage on their own.
- **+30% view distance:** all vision radii raised ~30% (e.g. footman 4→5, archer
  6→8, Town Hall 6→8, Tower 7→9), revealing more of the map.
- **Bar sizing fix:** HP-bar thickness is now capped (≤10px) so big buildings no
  longer get giant bars; the Town Hall bar is also narrowed + centered. Small
  buildings/units unchanged.
- **Resource floaters doubled again** (24→46px).
- **Terrain regions:** tile variants are chosen from a low-frequency value-noise
  field, so the ground forms **coherent patches** (an area of grass, then dry, then
  stone) instead of per-tile static.

## v0.125.0 — Formations + drag-to-face _(2026-06-07)_
- **Group moves now form up** as a rectangle facing the direction of travel —
  **melee in the front ranks, archers and catapults in the back** — instead of a
  loose blob.
- **Drag-to-face:** right-click and **hold, then drag** a direction with a group
  selected → the squad arranges into a battle line facing that way (press point =
  formation centre, drag = facing). Single right-clicks and worker orders behave as
  before.
- **Command queueing:** shift + right-click still queues movement waypoints
  (visited in order); combat units queue as attack-moves.
- Verified: an 8-unit order placed 4 footmen in the front row and the knight +
  archers + catapult in the back row, facing east.

## v0.124.0 — Bigger-army economy _(2026-06-07)_
- The game is now tuned for **roughly double-size armies**: combat units cost
  **~50% less gold/wood** (footman 90→45, grunt 90→45, archer 80→40 +15w, knight
  140→70, catapult 160→80 +30w) and **supply is doubled** at the source — Town Hall
  5→10, Farm 4→8 — so the cap and affordability both scale up. Workers (peon)
  unchanged. Applies to the AI too, so battles get bigger on both sides.

## v0.123.0 — Proportionate floaters + 3D bars _(2026-06-07)_
- Floating resource "+N" text is now **~2× larger** (and rises further) so it reads
  at play scale.
- **HP bars and the production bar are thicker and 3D**: inked border, recessed
  track, top→bottom gradient fill, and a glossy highlight. Unit HP bars are now
  sized to the sprite and sit above it (not the tiny body radius).

## v0.122.0 — Scale/ring/control polish _(2026-06-07)_
- **Units +20%, buildings −20%** for a better size ratio; **base/selection rings
  now scale with the sprite** (tied to its footprint width) instead of the tiny
  body radius, so they read clearly under the bigger troops.
- **Right-click = attack-move** for combat units (engage en route); workers still
  just walk/gather. Red destination ring when the order is aggressive.
- **Edge-of-screen camera scrolling is now off by default**, with an **"Edge-scroll
  camera: ON/OFF"** toggle in the Esc pause menu (persisted to localStorage).
- **Drag-select reliability fix:** the selection box now arms from the canvas
  mousemove handler too (not only the window one), so box-select starts
  consistently. Verified: footman right-click → attackMove, worker → plain move;
  edge-scroll defaults off.

## v0.121.0 — Orc enemy faction + map props (Pixelcut) _(2026-06-07)_
- The **enemy is now a distinct orc horde**: generated orc unit sprites
  (peon/grunt/archer/warlord) and orc building sprites (stronghold, war barracks,
  hide farm, lumber pit, blood altar, war forge, watchtower, catapult, spiked wall),
  selected by `isEnemy` in the renderer. The two sides read apart instantly beyond
  the team ring/banner.
- **Map decoration props**: forests now render generated **pine / dead-tree**
  sprites and gold mines a generated **ore-outcrop** (replacing the "$" glyph), via
  `assets.propSprite` + `drawTileProp`. Boulders/ruins/logs/rubble/graves/stump are
  in the prop sheet too, ready for future placement.
- All five generated sheets are inlined into the offline `Warlords.html`. Verified
  in-game (`screenshots/factions_props.png`): orc faction, trees, and gold mine all
  render.

## v0.120.0 — Bigger units
- Doubled the unit sprite scale again (6.6→13 × radius) per playtest feedback; troops now read clearly at the default play zoom.

## v0.119.0 — Sprite scale + facing polish _(2026-06-07)_
- **Units are ~2× larger** (sprite height 3.3→6.6 × unit radius) so they're clearly
  readable next to buildings; building overhang trimmed 1.18→1.05 to rebalance the
  unit↔building size ratio.
- **Left/right facing:** unit sprites now mirror horizontally to face their
  movement target (or attack aim), tracked via `Unit.faceLeft`. Verified two
  footmen given opposite targets render as clean mirror images.
- **Sawmill is now 2×2** (footprint 3→2).

## v0.118.0 — Generated building sprites (Pixelcut) _(2026-06-07)_
- All eight buildings (Town Hall, Barracks, Farm, Sawmill, Temple, Forge, Guard
  Tower, Wall) now render as **generated gothic isometric sprites** from a single
  3×3 sheet, matching the unit art. The loader magenta-keys and slices each cell as
  a trimmed sprite, dropping the generator's baked-in text label via a bottom-band
  trim; the catapult cell routes to the unit sprites. `drawBuildingSprite` scales
  each onto its footprint with the team banner kept for ownership. CC0 roofs +
  code-art remain the fallback. Verified in-game (`screenshots/base_sprited2.png`):
  all 8 building sprites + the catapult load and render.

## v0.117.0 — Generated unit sprites (Pixelcut) _(2026-06-07)_
- Peon, Footman, Archer, and Knight now render as **real generated gothic sprites**
  (Pixelcut / Nano-Banana, one 2×2 sheet). The loader magenta-keys the flat
  background and slices each figure to a tight transparent sprite; `drawUnit` blits
  it, feet anchored to the team base ring (ownership stays on the ring; the sprite
  is faction-neutral). Code-art figures remain the fallback (and still draw the
  catapult). Verified in-game via screenshot (`screenshots/units_sprited.png`):
  all four sprites load, slice, and render with correct team rings.

## v0.116.0 — Unit figures (code-art, fallback) _(2026-06-07)_
- Units now draw as small **figures** (head + torso + legs, hooded) with the team
  colour on the base ring and a kind-specific weapon, replacing the disc + letter
  glyph; the catapult is a wheeled wooden engine. This is the free code-art
  fallback ahead of real generated unit sprites. Verified via captured screenshots
  (`screenshots/units_figures.png`).

## v0.115.0 — Real building sprites (CC0 roof set) _(2026-06-07)_
- Buildings (Farm, Barracks, Sawmill, Temple, Town Hall) now draw **real CC0
  isometric roof sprites** from the SBS Town pack instead of code-art — scaled onto
  each footprint, **chroma-keyed** (the sheet ships with a flat teal backdrop) and
  darkened/desaturated toward the gothic palette. The code-drawn `drawStructure`
  stays as a fallback if the sheet fails to load. Asset loader now slices a sprite
  sheet (`assets.sheet("roofs")`) and the offline single-file build inlines it too.
  Verified via captured screenshots (saved to `screenshots/`): sprites render on
  the terrain with the teal background removed.
- Forge, Guard Tower, and Wall keep their bespoke code-art silhouettes.

## v0.114.0 — Real building structures (no more glyph blocks) _(2026-06-07)_
- Replaced the flat "colored diamond + 2-letter glyph" placeholders with proper
  **raised, code-drawn isometric structures** for Farm, Barracks, Sawmill, Temple,
  and Town Hall: extruded stone walls (lit/shadowed faces, inked outlines) plus a
  per-building roof and emblem —
  - **Farm/Barracks:** pitched gable roof (thatch / timber); Barracks adds an arched
    doorway + crossed-blades, Farm a chimney with an ember.
  - **Sawmill:** plank roof with a toothed circular saw blade + a log pile.
  - **Temple:** pale-stone columns, a tall spire, and a glowing arched window.
  - **Town Hall:** slate keep with a crenellated parapet (merlons) + hearth glow.
  Glyph labels now only show while a building is under construction. Verified by
  direct-render pixel sampling (the preview window here is 15px wide, so live
  screenshots aren't possible): all five render a raised mass with distinct roof
  colors and no errors; temple spire-glow confirmed.

## v0.113.0 — Portable build + offline single-file _(2026-06-07)_
- Fixed "stuck on Loading Warlords…" when opening the build directly: the
  production bundle now uses **relative asset paths** (`base: "./"`), so it works
  from `npm run preview`, a static host, or any subpath — not just the server root.
- Added **`npm run build:offline`** → generates a self-contained **`Warlords.html`**
  at the repo root (bundled JS inlined as an inline module, terrain tiles inlined
  as base64). It runs by **double-click** with no server. `Assets.loadAll` now
  prefers inlined `window.__TILES` when present (guarded; no change to dev/normal
  builds). Verified: the offline file boots clean over http (loading overlay
  hidden, no console errors, production bundle confirmed).
- README "Run it" now explains the launcher, `preview`, and the offline file, and
  warns that double-clicking `dist/index.html` can't work (browsers block ES
  modules over `file://`).

## v0.112.0 — Temple heal ring when selected _(2026-06-07)_
- Selecting a **Temple** now shows its **green heal-aura ring** (matching the Guard
  Tower's range ring on selection), so you can see its coverage at any time, not
  just while placing. Verified headlessly: a selected Temple draws the green ring;
  a selected Farm draws none.

## v0.111.0 — Wall stone silhouette _(2026-06-07)_
- The Wall now draws as a **low crenellated stone block** (mortar courses, inked
  outline) instead of a glyph, and flies **no banner** — it reads as a barrier, not
  a building. Verified headlessly: a wall renders ~429 stone px with zero banner
  pixels, while a farm flies its team banner (286).

## v0.110.0 — Walls _(2026-06-07)_
- New cheap **Wall** building (`L`, 20g/10w, 1×1, 350 HP) — a pure barrier to seal
  chokepoints and screen your base; pair with Guard Towers behind it. Siege
  (Catapult ×4) is the counter. Verified headlessly: placing a wall flips its tile
  from walkable to blocked (A* routes around), and the build button appears
  ("20g 10w", hotkey L).

## v0.109.0 — Escalating AI attack waves _(2026-06-07)_
- Each attack wave the AI commits now **raises the muster threshold for the next**
  (6 → 8 → 10 … capped at 14), so its assaults grow larger and more dangerous as a
  game drags on instead of staying a steady trickle of six. Verified headlessly:
  with 0 waves sent it attacks at 6 fighters; after 2 waves it holds until 10
  (won't launch at 8).

## v0.108.0 — Temple heal-radius preview _(2026-06-07)_
- Placing a **Temple** now shows its **green heal-aura ring** (like the Guard
  Tower's range ring), so you can position it to cover your front line before
  committing. The heal radius now lives on the building def (5 tiles), unifying
  sim + preview. Verified headlessly: the Temple preview draws a green ring (18/18
  sampled points greener) that a Farm preview lacks.

## v0.107.0 — Muster spark on unit ready _(2026-06-07)_
- When your unit finishes training, a **spark bursts at the building** (paired with
  the ready chime) so reinforcements are visible, not just audible. Verified
  headlessly: a human unit completing spawns one impact at the building; an AI
  unit completing spawns none.

## v0.106.0 — Selection acknowledgement blip _(2026-06-07)_
- Selecting your own units (single-click or drag) now plays a **soft select blip**
  — a crisp RTS acknowledgement; clicking enemy units stays silent. Verified
  headlessly (sfx spy): own-unit pick fires select once, enemy pick fires zero.

## v0.105.0 — Splash in selection panel _(2026-06-07)_
- The selection panel now shows **"· Splash"** for area-damage units, so the
  Catapult's anti-cluster role is legible alongside its siege multiplier. Verified
  headlessly: a catapult reads "Atk 12 · Siege ×4 · Splash", a footman has neither.

## v0.104.0 — Siege dust shockwave _(2026-06-07)_
- A Catapult's shot now kicks up a **dusty crater shockwave** on impact (atop the
  spark burst + screen jolt), giving the splash a readable area-blast. Verified
  headlessly: a catapult hit spawns a dust effect, an archer's does not.

## v0.103.0 — Catapult splash damage _(2026-06-07)_
- The Catapult's shot now deals **splash damage** (0.6× its base) to enemy units
  within 1.5 tiles of the impact — so massing infantry against siege is punished,
  giving the Catapult a real anti-cluster role beyond wall-breaking. Verified
  headlessly: two footmen beside the target both take splash (200→193) while one
  outside the radius is untouched.

## v0.102.0 — README accuracy refresh _(2026-06-07)_
- Updated the README "What's here now" to match ~30 versions of additions:
  Catapult siege unit, hold-position stance, colored move markers, Forge embers /
  Town Hall hearth / Temple heal, veteran aura, the distinct enemy-faction
  silhouettes, and the AI's home-guard / stalled-build handling. Keeps the front
  door (and the loop's own reference) honest. No game-behavior change.

## v0.101.0 — Veteran aura _(2026-06-07)_
- Battle-hardened units now carry a faint **gold halo ring** (brighter at rank 2),
  so your elites stand out in a packed melee — a selective ember-gold accent atop
  the existing rank chevrons. Verified headlessly: a 5-kill veteran renders ~520
  gold-aura px and differs 714 px from a rookie in the body-ring band.

## v0.100.0 — AI builds critical structures fast (cramped-seed fix) _(2026-06-07)_
- The AI now puts **up to 2 workers on an unfinished building**, and only places
  sites with a **walkable adjacent tile** (a builder can always reach them). This
  fixes the cramped-base weak economy flagged in v0.99: a lone builder crawling on
  a corner base left the AI supply-starved. Verified headlessly (build-first):
  **seed 7 supply cap 9→17 and army 1→9**; seed 1337 stays strong (cap 25, army
  12). The earlier "soft-lock" was really slow construction, now resolved.

## v0.99.0 — AI resumes stalled construction _(2026-06-07)_
- The AI now **assigns a worker to any building site that's lost its builder**
  (e.g. one pulled away to gather or flee a raid), fixing a class of economy
  soft-lock where a half-built farm left the AI supply-capped. Verified headlessly:
  the AI assigns a builder to a stalled site; a healthy seed (1337) is unaffected
  (supply cap reaches 25, army 11).
- _Known issue:_ on some cramped seeds (e.g. seed 7) the AI can still stall at
  supply 9 when a farm site is **unreachable** — a placement/pathing fix for a
  future pass.

## v0.98.0 — Enemy worker tool (faction set complete) _(2026-06-07)_
- The enemy **peon** now wields a crude dark bone pick vs the human's wood-handled
  steel tool — completing distinct enemy silhouettes across **every** unit (worker,
  footman/grunt, archer, knight) plus buildings. Verified post-build via direct
  draw calls: all four unit types differ enemy-vs-friendly (peon 181, footman 359,
  archer 559, knight 509 px), retiring earlier verification doubt.

## v0.97.0 — Enemy banner + verify-order fix _(2026-06-07)_
- Enemy **buildings now fly a ragged forked (swallowtail) pennant** vs the human's
  clean triangular one — extending faction identity onto structures. Verified
  headlessly (post-build): `drawBuilding` rendered enemy-vs-friendly differs 234 px
  (the banner is the only isEnemy-dependent draw for a full-HP building).
- Process fix: confirmed the preview serves the **built bundle**, so verification
  now runs **after `npm run build`**, not before. (No game-behavior change.)

## v0.96.0 — Enemy archer bone bow _(2026-06-07)_
- The enemy **archer** now carries a longer, pale **bone recurve** instead of the
  human wooden bow — completing the enemy faction's combat silhouette set (cleaver
  · horns · bone bow). Verified headlessly: the bow region differs 596 px and reads
  less brown (910 vs 1190) than the human's.

## v0.95.0 — Enemy knight horns _(2026-06-07)_
- Extending the faction look: **enemy knights wear dark curved horns** in place of
  the human gold crest, so the enemy army reads as its own host across melee and
  champions. Verified headlessly: a friendly knight's crest region shows 122 gold
  px, the enemy 0 (horns), region differs 522 px.

## v0.94.0 — Enemy faction cleaver _(2026-06-07)_
- A first step toward faction identity: **enemy melee carry a broad, dark orcish
  cleaver** while your footmen wield a steel blade — so the two armies read apart
  by silhouette, not just team colour (North-Star "team identity via trim"). Keyed
  on side, so it scales to any non-human player. Verified headlessly: the same
  footman's weapon region differs 373 px rendered as enemy vs friendly.

## v0.93.0 — Buildings-razed stat _(2026-06-07)_
- The end screen now reports **Slain** (enemy units) and **Razed** (enemy
  buildings) as separate tallies, where before razings were lumped into the kill
  count. Verified headlessly: a collapse event bumps `razed`, a death bumps
  `kills`, independently.

## v0.92.0 — Stance in selection panel _(2026-06-07)_
- A single selected unit's panel now appends its **stance** ("Holding" /
  "Patrolling") to the state line, so orders are legible without watching the
  field. Verified headlessly: stanceLabel returns null/Holding/Patrolling for
  plain/held/patrolling units.

## v0.91.0 — Hold-stance indicator _(2026-06-07)_
- Units on **Hold Position** now show a **steel-blue anchor bracket** beneath them,
  so you can see at a glance which troops are holding. Verified headlessly: toggling
  hold changes ~62 px below the unit (all bluer), absent otherwise.

## v0.90.0 — Hold-position stance _(2026-06-07)_
- New **Hold Position** stance (`Z` to toggle): held units fire at anything in
  range but **never chase or advance** — keep archers and Catapults safely back,
  hold a defensive line, stop your siege from wandering into melee. Cleared by any
  move/attack-move order; AI behavior untouched (default off). Verified headlessly:
  a held archer advances 0px at an out-of-range foe while a free one closes in.

## v0.89.0 — Town Hall hearth glow _(2026-06-07)_
- The completed **Town Hall now glows with a flickering hearth window** — home-fire
  warmth at the heart of the base, a selective ember accent against the gothic
  gloom. Verified headlessly: ~300 warm px at the hall (flickering across the
  clock), zero on a farm.

## v0.88.0 — Attack-move marker _(2026-06-07)_
- Attack-move (A + click) now drops a **red** destination ring, distinct from the
  **green** plain-move ring, so aggressive vs passive orders read at a glance.
  Verified headlessly: the plain-move marker carries attack=false, the attack-move
  marker attack=true.

## v0.87.0 — Move-order marker _(2026-06-07)_
- Right-clicking open ground to move now drops a **quick expanding ring** at the
  destination, so orders read clearly (classic RTS feedback). Only plain moves get
  it — attack/gather/build have their own cues. Verified headlessly: a move spawns
  exactly one marker; an attack command spawns none.

## v0.86.0 — Forge ember sparks _(2026-06-07)_
- The Forge now throws **rising ember sparks** that drift up and fade — warm motes
  against the gothic gloom, making your war-furnace feel alive (and easy to spot).
  Verified headlessly: ~50 warm-ember px render above the furnace and the region
  animates (217 px diff) across the clock.

## v0.85.0 — Group HP readout _(2026-06-07)_
- A multi-unit selection now shows **combined HP** ("HP 140/170") under the count
  and composition, so you can gauge a squad's health at a glance. Verified
  headlessly: the line sums current/max across the selection correctly.

## v0.84.0 — "Unit ready" chime _(2026-06-07)_
- A trained unit emerging from a building now plays a soft two-note **"ready"
  chime** (your side only), so you notice reinforcements without watching the
  queue. Verified headlessly (sfx spy): a human unit completing fires the chime
  once; an AI unit stays silent.

## v0.83.0 — AI keeps a home guard _(2026-06-07)_
- The AI no longer commits **its entire army** to every attack wave — it now holds
  **2 fighters back to guard the base** (the ones nearest home), so dodging the
  wave and counter-attacking is no longer a free win. Reactive defense still pulls
  everyone home on a real threat. Verified headlessly: with 8 fighters, 6 are sent
  on the wave and 2 remain on guard.

## v0.82.0 — Siege thud sound _(2026-06-07)_
- The Catapult now fires with a **deep wooden counterweight "thud"** (low sawtooth
  + filtered noise) instead of an arrow whoosh, completing its distinct identity
  across visuals, impact, and audio. Verified headlessly (sfx spy): a catapult
  shot routes to `siegeThud` while an archer routes to `whoosh`.

## v0.81.0 — Heal glow _(2026-06-07)_
- Units mending in a **Temple's aura** now show a soft pulsing **green halo + a
  rising plus mote**, so the heal radius is finally legible (selective accent
  against the gloom). Verified headlessly: a unit in range gets a heal flag (0.3)
  while one out of range stays 0, and the glow adds ~196 green px vs none.

## v0.80.0 — Siege stat + balance check _(2026-06-07)_
- The selection panel now shows a **"Siege ×N"** line for siege units, so the
  Catapult's role (4× vs buildings) is legible. Verified headlessly: a catapult
  reads "Atk 12 · Siege ×4", a footman has no siege line.
- Ran a full self-play to confirm the recent combat additions (Catapult in the AI
  rotation, Temple heal) didn't regress the AI: it still techs up and wins in
  **~400s** (matching the long-standing ~392s baseline), first strike at ~232s,
  peak army 8 — no pacing or competitiveness regression, no rebalance needed.

## v0.79.0 — Lobbed siege stone _(2026-06-07)_
- A Catapult's projectile now **flies as a dark stone on a high arc** rather than
  an arrow, so siege reads at a glance both in flight and on impact. Verified
  headlessly: the `heavy` flag is carried on the projectile, and a heavy shot
  renders 273 px differently from an arrow at mid-flight.

## v0.78.0 — Siege impact feel _(2026-06-07)_
- A Catapult's shot now **lands with weight**: an impact burst at the target plus a
  screen-shake jolt, so siege reads differently from an arrow. Threaded a `heavy`
  flag through the projectile event. Verified headlessly: a catapult hit drives
  shake to 4 while an archer's hit leaves it at 0.

## v0.77.0 — AI fields catapults _(2026-06-07)_
- Once the AI owns a **Forge** (and has the gold/wood), it now mixes **Catapults**
  into its army rotation alongside footmen/archers/knights — so it can siege the
  human's towers and walls instead of just throwing bodies at them. Verified
  headlessly: with a complete Forge + Temple + supply, the rotation enqueues all
  four combat types evenly (catapult included).

## v0.76.0 — Catapult siege unit _(2026-06-07)_
- New **Catapult** unit: a slow, long-range (6 tiles) siege engine that's modest
  vs troops but does **4× damage to buildings**, unlocked at the Barracks once you
  own a **Forge**. Gives the human a real way to crack a fortified, tower-walled
  base. Drawn with a wooden throwing-arm silhouette. Verified headlessly: it hits
  a building for 48 vs a unit for 12 (4×), and its train button is gated
  "needs Forge" until a Forge stands. (AI doesn't field catapults yet — next.)

## v0.75.0 — Idle-production indicator _(2026-06-07)_
- The resource bar now shows a **"⚑ N idle bldg"** count when complete production
  buildings (Town Hall, Barracks) sit with an empty queue — a macro nudge so you
  don't forget to keep training, mirroring the idle-worker indicator. Verified
  headlessly: an idle barracks counts 1, drops to 0 once a unit is queued.

## v0.74.0 — Worker tool silhouette _(2026-06-07)_
- Workers now carry a **wooden-handled tool**, completing the per-type silhouette
  set (worker tool · footman/grunt blade · archer bow · knight crest) so every
  unit reads by role at a glance. Verified headlessly: a peon shows a brown tool
  (62 px) a footman lacks (0).

## v0.73.0 — Per-type weapon silhouettes _(2026-06-07)_
- Units now read by **role silhouette**, not just a letter: archers carry a wooden
  bow, footmen/grunts a steel blade, knights a gold helm crest (peons stay plain).
  A step toward the North Star's "favor silhouette over detail." Verified
  headlessly (on a contrast background): the bow is archer-only (113 px vs 0 on a
  footman) and the crest knight-only (82 px vs 0).

## v0.72.0 — Temple healing aura _(2026-06-07)_
- The **Temple now heals friendly units within ~5 tiles** (~3 HP/s) — so it's no
  longer just a Knight tech-gate but a position worth fighting around and pulling
  wounded troops back to. Applies to both sides; enemies aren't healed. Verified
  headlessly: a wounded friendly in range climbs 20→32 HP over ~4s; one out of
  range stays at 20.

## v0.71.0 — README accuracy refresh _(2026-06-07)_
- Brought the README in line with reality: added a "What's here now" summary of
  everything the loop has layered on (tech buildings, towers, armor/veterancy,
  the command suite, the juice/animation set, the smarter AI), and rewrote the
  stale "not here / next steps" lists (which still claimed sound, animation,
  control groups, save/load, and a defensive AI were missing). Keeps the docs —
  which the loop itself consults for direction — honest.

## v0.70.0 — AI repairs its buildings _(2026-06-07)_
- The AI now **pulls workers to repair its most-damaged building** (up to 2, gold
  permitting), so its base mends under siege instead of crumbling for free —
  another step toward a defending opponent. Verified headlessly: a damaged AI
  town hall (480 HP) gets a repairer assigned and climbs to 759.

## v0.69.0 — Unaffordable-action feedback _(2026-06-07)_
- Clicking a **disabled** build/train button now surfaces *why* it's unavailable
  (its cost or prerequisite, e.g. "Farm: 80g 20w" or "Knight: needs Temple")
  instead of doing nothing. Verified headlessly: a disabled Farm button returns a
  denied action and posts the cost message.

## v0.68.0 — Under-attack screen pulse _(2026-06-07)_
- When your forces take damage, the **screen edges now flash crimson** (fading
  over ~1.5s, re-triggered on each hit) — a visceral urgency cue layered on the
  existing alert sound and minimap ping. Verified headlessly: the screen edge
  reddens under a fresh attack ping and is neutral otherwise.

## v0.67.0 — Guaranteed start forests _(2026-06-07)_
- Map generation now plants a **forest near each start corner** (mirroring the
  guaranteed goldmines), so neither side spawns wood-starved — wood is the key
  economic bottleneck, so this is a fairness fix. Verified headlessly: across 6
  seeds, both starts have a forest within 8 tiles.

## v0.66.0 — Patrol route display _(2026-06-07)_
- A selected patrolling unit now shows its **beat as a cyan dashed line** between
  the two endpoints, so you can see and adjust guard routes. Verified headlessly:
  the line renders along the endpoints when patrolling, absent otherwise.

## v0.65.0 — Patrol command _(2026-06-07)_
- New **Patrol** order (`P`, then click): combat units march back and forth
  between their spot and the target, attack-moving so they engage anything that
  wanders into the route — ideal for guarding chokepoints and flanks. Any
  explicit order cancels it. Verified headlessly: a unit walks to its far
  endpoint and back, repeating.

## v0.64.0 — Append to control group _(2026-06-07)_
- **Shift + 1…9** now adds the current selection to an existing control group
  (deduped), instead of replacing it — standard RTS muscle memory alongside
  Ctrl-assign. Verified headlessly: a 2-unit group grows to 3 on Shift-add and
  stays 3 when the same unit is re-added.

## v0.63.0 — Damage smoke _(2026-06-07)_
- Buildings below 35% HP now belch a **rising smoke plume with an ember fleck**,
  so a base under siege visibly burns — clear damage feedback and grimdark decay.
  Verified headlessly: a 20%-HP barracks shows ~433 px of smoke a full-HP one
  doesn't.

## v0.62.0 — Build-preview range ring _(2026-06-07)_
- Placing a Guard Tower now shows its **attack-range ring on the build preview**,
  so you can plan coverage and overlap before committing the spot. Verified
  headlessly: the tower preview draws a range ring; a farm preview doesn't.

## v0.61.0 — Scouted-base memory _(2026-06-07)_
- Enemy buildings you've **scouted now linger as dimmed ghosts** in fogged areas
  (last-known positions), brightening only when back in vision — units still
  vanish into the fog. A proper Warcraft-style memory that rewards scouting.
  Verified headlessly: enemy building lum 173 visible → 142 ghost → 11 hidden.

## v0.60.0 — Effective attack readout _(2026-06-07)_
- The selection panel's Atk now reflects **effective** damage — base × veterancy
  rank + Forge bonus — instead of just the base stat, so upgrades are visible.
  Verified headlessly: a knight reads Atk 16, →18 with a Forge; a 2-kill veteran
  reads 18, →20 with a Forge.

## v0.59.0 — Forge furnace visual _(2026-06-07)_
- The Forge now reads as a **dark furnace with a glowing, flickering ember mouth**
  rather than a generic stone tile — leaning into the North Star's warm
  ember-against-gloom. Verified headlessly: the forge shows 60 warm ember pixels;
  a farm shows 0.

## v0.58.0 — AI builds a Forge _(2026-06-07)_
- The AI now invests surplus into a **Forge** (after its temple, before towers) to
  buff its whole army's attack — so in longer games it tech-escalates instead of
  just massing bodies. Verified headlessly: the AI builds a Forge from a surplus
  base state, and a full game still resolves unchanged (no offensive regression).

## v0.57.0 — The Forge _(2026-06-07)_
- New tech building: the **Forge** (`G`, 150g/60w). While you own a completed
  Forge, **all your units gain +2 attack** — an army-wide weapon upgrade and a
  reason to invest economy into power. Verified headlessly: a footman deals 8
  normally, 10 with a Forge, and 8 when only the enemy owns one.

## v0.56.0 — Muzzle flash _(2026-06-07)_
- Ranged attacks (archers, Guard Towers) now throw a brief **muzzle-flash spark**
  at the shooter as the projectile launches, complementing the impact sparks at
  the target. Verified headlessly: an archer's shot spawns a spark at its own
  position.

## v0.55.0 — Double-tap to center _(2026-06-07)_
- Pressing a control-group number **twice quickly** now snaps the camera to that
  group (first tap selects, second jumps) — standard RTS muscle memory. Verified
  headlessly: the first recall leaves the group off-screen, the quick second
  recall centers it exactly.

## v0.54.0 — Building rim light _(2026-06-07)_
- Buildings now carry the same painted depth as units: a **warm rim light** on
  their upper edges and a **shadow** on the lower edges. Verified headlessly: a
  building's upper edge (lum 268) is far brighter than its shadowed lower edge
  (34).

## v0.53.0 — Unit rim light _(2026-06-07)_
- Units now get a **warm rim light** along their upper-left edge and a soft shadow
  on the lower-right, for the dramatic top-lit, painted look the North Star calls
  for. Verified headlessly: upper-left edge is far brighter than the shadowed
  lower-right.

## v0.52.0 — Waypoint route display _(2026-06-07)_
- A selected unit with queued waypoints now shows its **planned route** as a
  dashed line with node dots (current leg + each queued point), so shift-click
  routes are visible. Verified headlessly: the route line renders along the
  queued path and is absent when there are no waypoints.

## v0.51.0 — Waypoint queue _(2026-06-07)_
- Hold **Shift + right-click** on open ground to queue a series of move
  waypoints; units walk them in order (great for scouting routes or skirting
  danger). Any fresh, non-shift command clears the queue. Verified headlessly: 3
  shift-clicks queued 3 points, the unit visited all in sequence, and a normal
  order cleared the queue.

## v0.50.0 — Selection combat stats _(2026-06-07)_
- The single-unit selection panel now shows an **Atk / Def / Vet** line, surfacing
  damage, armor, and veterancy rank at a glance. Verified headlessly: footman
  "Atk 8", knight "Atk 16 · Def 2", veteran knight adds "· Vet 1".

## v0.49.0 — Idle-worker indicator _(2026-06-07)_
- The resource bar now shows **"⚒ N idle"** whenever you have idle workers, so a
  stalled economy is obvious at a glance (pairs with the `.` select-idle hotkey).
  Verified headlessly: the count reflects only truly-idle workers (excludes
  gatherers, builders, and non-workers).

## v0.48.0 — Death decals _(2026-06-07)_
- The fallen now leave **lingering stains** — dark dried-blood/scorch splotches on
  the ground that fade over ~7 seconds — so a battlefield carries the marks of the
  fight (grimdark, Darkest-Dungeon mood). Drawn under units, capped at 120.
  Verified headlessly: a death leaves a decal that outlasts the brief death poof.

## v0.47.0 — Armor _(2026-06-07)_
- Units can now have **armor** — a flat reduction on every incoming hit (at least
  1 damage always lands). **Knights** get armor 2, making them genuinely tanky
  front-liners worth teching to. Applies to melee and tower fire. Verified
  headlessly: a footman deals 6 to a Knight (8−2) vs 8 to an unarmored footman.

## v0.46.0 — Health-graded HP bars _(2026-06-07)_
- HP bars are now **colored by health** — green when healthy, amber when hurt, red
  when near death — so wounded units pop at a glance (ownership still reads from
  the team base ring). Verified headlessly: a full bar samples green, a 15%
  bar samples red.

## v0.45.0 — Hit-impact sparks _(2026-06-07)_
- Every hit (melee, arrow, or tower shot) now throws a short burst of **impact
  sparks** at the point of contact, so blows land with a visible crack. Capped at
  80 live so a big melee can't pile up. Verified headlessly: hits spawn impact
  effects and the target takes damage.

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
