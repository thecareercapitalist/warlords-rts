import { World, HUMAN_PLAYER, AI_PLAYER } from "./World.ts";
import { Camera } from "./Camera.ts";
import { Input } from "./Input.ts";
import { Renderer, type RenderState } from "./render/Renderer.ts";
import { Assets } from "./render/assets.ts";
import { Effects } from "./render/effects.ts";
import { Sfx } from "./audio/Sfx.ts";
import { Hud, type HudAction } from "./ui/Hud.ts";
import { Keybindings } from "./ui/Keybindings.ts";
import { PauseMenu } from "./ui/PauseMenu.ts";
import { Fog } from "./systems/fog.ts";
import { AIController } from "./systems/ai.ts";
import { Unit } from "./entities/Unit.ts";
import { Building } from "./entities/Building.ts";
import type { BuildingKind, Vec2 } from "./types.ts";
import { BUILDING_DEFS } from "./entities/defs.ts";
import { CAMERA_SPEED, EDGE_SCROLL_MARGIN, MAP_W, MAP_H, TILE } from "./constants.ts";
import { tileCenter, toTile, normalizeRect, clamp } from "./util/math.ts";
import { updateMovement } from "./systems/movement.ts";
import { updateGather } from "./systems/gather.ts";
import { updateCombat } from "./systems/combat.ts";
import { updateSpells, castSpell, SPELLS, type SpellId } from "./systems/spells.ts";
import { updateProduction, enqueueUnit, cancelQueuedUnit } from "./systems/production.ts";
import { placeBuilding, canPlace, cancelBuilding } from "./systems/placement.ts";
import {
  orderMove,
  orderAttack,
  orderAttackMove,
  orderGather,
  orderBuild,
  nearestWalkable,
  updateWaypoints,
  updatePatrol,
} from "./systems/orders.ts";
import { entityAt, unitAt } from "./systems/selection.ts";
import { saveGame, loadGame } from "./systems/persistence.ts";

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cam: Camera;
  private readonly input: Input;
  private readonly renderer: Renderer;
  private readonly assets = new Assets();
  private readonly effects = new Effects();
  private readonly sfx = new Sfx();
  private readonly hud: Hud;
  private readonly kb: Keybindings;
  private readonly pauseMenu = new PauseMenu();
  private paused = false;
  // Edge-of-screen camera scrolling, off by default (a setting in the pause menu).
  private edgeScroll = ((): boolean => {
    try {
      return localStorage.getItem("warlords.edgeScroll") === "1";
    } catch {
      return false;
    }
  })();

  private world!: World;
  private fog!: Fog;
  private ai!: AIController;

  private selUnits: Unit[] = [];
  private selBuildings: Building[] = [];
  /** Ctrl+1..9 control groups → recall with 1..9. */
  private controlGroups = new Map<number, Unit[]>();
  private idleBuildingIdx = 0; // round-robin cursor for the idle-building pill
  private lastRecall: { n: number; t: number } | null = null; // for double-tap-to-center

  private buildMode: BuildingKind | null = null;
  private builder: Unit | null = null;
  private attackMoveMode = false;
  private castMode: SpellId | null = null; // armed spell awaiting a target click
  private patrolMode = false;

  private message: string | null = null;
  private messageTimer = 0;
  private attackAlertCd = 0; // throttles the "under attack" warning
  private attackPing: { x: number; y: number; t: number } | null = null;

  private gameOver: "won" | "lost" | null = null;
  private elapsed = 0; // seconds of active play
  private shake = 0; // screen-shake magnitude (px), decays each frame
  private kills = 0; // enemy units slain by the human
  private razed = 0; // enemy buildings destroyed by the human
  private endFanfarePlayed = false;
  private pendingCenter: Vec2 | null = null; // centred once the viewport is real
  private lastTime = 0;
  private readonly humanId = HUMAN_PLAYER;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.cam = new Camera();
    this.input = new Input();
    this.input.attach(canvas);
    this.renderer = new Renderer(this.ctx, this.cam, this.assets);
    this.hud = new Hud(this.ctx);
    this.kb = new Keybindings();

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.startNewGame(1337);
  }

  async start(): Promise<void> {
    await this.assets.loadAll();
    this.hud.assets = this.assets; // command buttons can now show sprite icons
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // --- Setup --------------------------------------------------------------

  private startNewGame(seed: number): void {
    this.world = new World(seed);
    this.fog = new Fog(this.humanId);
    this.ai = new AIController(AI_PLAYER);
    this.selUnits = [];
    this.selBuildings = [];
    this.buildMode = null;
    this.builder = null;
    this.attackMoveMode = false;
    this.patrolMode = false;
    this.gameOver = null;
    this.elapsed = 0;
    this.kills = 0;
    this.razed = 0;
    this.shake = 0;
    this.endFanfarePlayed = false;
    this.paused = false;
    this.effects.clear();
    this.controlGroups.clear();
    this.attackPing = null;

    this.spawnBase(this.humanId, { x: 4, y: 4 }, { x: 8, y: 8 }, true);
    this.spawnBase(AI_PLAYER, { x: MAP_W - 7, y: MAP_H - 7 }, { x: MAP_W - 9, y: MAP_H - 9 }, false);

    this.world.recomputeSupply();
    this.fog.update(this.world);

    // Defer centring until the viewport has real dimensions (see frame()).
    const th = this.world.buildingsOf(this.humanId).find((b) => b.kind === "townhall");
    this.pendingCenter = th ? th.center() : tileCenter(5, 5);
  }

  private spawnBase(playerId: number, thTile: Vec2, minePref: Vec2, human: boolean): void {
    const th = new Building("townhall", playerId, thTile, true);
    this.world.addBuilding(th);

    // Pick the goldmine nearest the requested preference.
    let mine = this.world.map.goldmines[0];
    let bestD = Infinity;
    for (const g of this.world.map.goldmines) {
      const d = (g.x - minePref.x) ** 2 + (g.y - minePref.y) ** 2;
      if (d < bestD) {
        bestD = d;
        mine = g;
      }
    }

    for (let i = 0; i < 4; i++) {
      const spot =
        nearestWalkable(this.world, thTile.x - 1 + i, thTile.y + 3, 5) ??
        nearestWalkable(this.world, thTile.x + i, thTile.y + 3, 8);
      if (!spot) continue;
      const u = new Unit("peon", playerId, tileCenter(spot.x, spot.y));
      this.world.addUnit(u);
      // Bootstrap the economy: start every worker mining the home gold.
      orderGather(this.world, u, mine);
    }
    void human;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cam.resize(w, h);
    this.hud.layout(this.cam);
    // Let the camera pan a bit past the map: a tile of slack on each side, and
    // enough at the bottom that the HUD bar never permanently hides map rows.
    this.cam.setPadding(TILE, TILE, this.hud.barHeight + TILE, TILE);
  }

  // --- Main loop ----------------------------------------------------------

  private frame(now: number): void {
    // Self-correct sizing: the very first resize() can run before the window
    // reports real dimensions (and in some headless contexts never gets a
    // resize event), so reconcile against the live window size each frame.
    if (window.innerWidth !== this.cam.viewW || window.innerHeight !== this.cam.viewH) {
      if (window.innerWidth > 0 && window.innerHeight > 0) this.resize();
    }
    // Apply the deferred camera centre once the viewport is real.
    if (this.pendingCenter && this.cam.viewW > 0) {
      this.cam.centerOn(this.pendingCenter);
      this.pendingCenter = null;
    }

    const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = now;

    this.handleInput(dt);
    if (!this.gameOver && !this.paused) this.update(dt);
    this.render();

    this.input.clearOneShots();
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = null;
    }
    this.elapsed += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22); // decay shake
    if (this.attackAlertCd > 0) this.attackAlertCd -= dt;
    if (this.attackPing) {
      this.attackPing.t += dt;
      if (this.attackPing.t > 4) this.attackPing = null;
    }

    this.ai.update(this.world, dt);
    updateProduction(this.world, dt);
    updateGather(this.world, dt);
    updateCombat(this.world, dt);
    updateSpells(this.world, dt);
    updateMovement(this.world, dt);
    updateWaypoints(this.world);
    updatePatrol(this.world);

    // Drain gameplay events into the presentation layer (before cleanup so
    // death positions are still valid), then advance effect animations.
    for (const e of this.world.events) {
      if (e.type === "projectile") {
        this.effects.spawnProjectile(e.from, e.to, e.heavy, e.magic, e.fire);
        this.effects.spawnImpact(e.from.x, e.from.y); // muzzle flash at the shooter
        if (e.heavy) {
          // Siege shot lands with weight: a spark burst, a dust shockwave, a jolt.
          this.effects.spawnImpact(e.to.x, e.to.y);
          this.effects.spawnCollapse(e.to.x, e.to.y, 22); // dusty crater puff
          this.shake = Math.max(this.shake, 4);
        }
        if (e.fire) {
          // Dragon breath bursts into flame where it lands.
          this.effects.spawnBlast(e.to.x, e.to.y, "fire", 0.5);
          this.effects.spawnImpact(e.to.x, e.to.y);
          this.sfx.firebolt();
        }
      }
      else if (e.type === "death") {
        this.effects.spawnDeath(e.x, e.y, e.color, e.glyph);
        this.effects.spawnDecal(e.x, e.y); // lingering grimdark stain
        this.sfx.death();
        if (e.by === this.humanId) this.kills++;
      } else if (e.type === "collapse") {
        this.effects.spawnCollapse(e.x, e.y, e.size);
        this.sfx.collapse();
        this.shake = Math.max(this.shake, 7); // jolt the camera on a collapse
        if (e.by === this.humanId) this.razed++;
      } else if (e.type === "attack") this.sfx.attack(e.ranged, e.heavy);
      else if (e.type === "build") this.sfx.build();
      else if (e.type === "trained" && e.playerId === this.humanId) {
        this.sfx.ready();
        this.effects.spawnImpact(e.x, e.y); // muster spark at the building
      }
      else if (e.type === "gain" && e.playerId === this.humanId) {
        this.effects.spawnFloater(e.x, e.y, `+${e.amount}`, e.kind === "gold" ? "#e8c060" : "#b07a45");
      }
      else if (e.type === "damaged") {
        this.effects.spawnImpact(e.x, e.y); // spark burst at the point of impact
        if (e.playerId === this.humanId) {
          this.attackPing = { x: e.x, y: e.y, t: 0 }; // keep ping fresh during an assault
          if (this.attackAlertCd <= 0) {
            this.setMessage("⚔ Your forces are under attack!");
            this.sfx.alert();
            this.attackAlertCd = 6;
          }
        }
      }
      else if (e.type === "spell") {
        this.effects.spawnBlast(e.x, e.y, e.spell === "fireball" ? "fire" : "frost");
        if (e.spell === "fireball") {
          this.shake = Math.max(this.shake, 3);
          this.sfx.spellFire();
        } else {
          this.sfx.spellFrost();
        }
      }
    }
    this.world.events.length = 0;
    this.effects.update(dt);

    this.world.cleanupDead();
    this.world.recomputeSupply();
    this.pruneSelection();
    this.fog.update(this.world);
    this.checkWinLoss();

    // One-shot end-game fanfare.
    if (this.gameOver && !this.endFanfarePlayed) {
      this.endFanfarePlayed = true;
      if (this.gameOver === "won") this.sfx.victory();
      else this.sfx.defeat();
    }
  }

  // --- Input --------------------------------------------------------------

  private handleInput(dt: number): void {
    const k = this.input.keys;

    // Restart on the end screen.
    if (this.gameOver && this.input.pressedKeys.includes("r")) {
      this.startNewGame((Math.floor(performance.now()) % 100000) + 1);
      return;
    }

    // Any input is a user gesture — unlock audio (browsers require this).
    if (this.input.leftClicks.length || this.input.rightClicks.length || this.input.pressedKeys.length) {
      this.sfx.unlock();
    }
    if (this.input.pressedKeys.includes("m")) this.sfx.toggleMute();

    // Escape: cancel a pending action, or toggle the pause menu.
    if (this.input.pressedKeys.includes("escape")) this.onEscape();

    // While paused, all input goes to the menu and the world is frozen.
    if (this.paused) {
      this.handleMenuInput();
      return;
    }

    // Camera: bound scroll keys + edge scroll.
    let cdx = 0;
    let cdy = 0;
    if (k.has(this.kb.get("scrollLeft"))) cdx -= 1;
    if (k.has(this.kb.get("scrollRight"))) cdx += 1;
    if (k.has(this.kb.get("scrollUp"))) cdy -= 1;
    if (k.has(this.kb.get("scrollDown"))) cdy += 1;
    // Edge scroll only once the pointer has actually moved into the window, so
    // the default (0,0) position doesn't drag the camera into the corner.
    const m = this.input.mouse;
    if (this.edgeScroll && this.input.moved) {
      if (m.x < EDGE_SCROLL_MARGIN) cdx -= 1;
      if (m.x > this.cam.viewW - EDGE_SCROLL_MARGIN) cdx += 1;
      if (m.y < EDGE_SCROLL_MARGIN) cdy -= 1;
      if (m.y > this.cam.viewH - EDGE_SCROLL_MARGIN && !this.hud.isOverUi(m)) cdy += 1;
    }
    if (cdx || cdy) this.cam.move(cdx * CAMERA_SPEED * dt, cdy * CAMERA_SPEED * dt);

    // Mouse-wheel zoom toward the cursor (scroll up = zoom in).
    if (this.input.wheel !== 0) {
      const factor = this.input.wheel < 0 ? 1.12 : 1 / 1.12;
      this.cam.zoomAt(this.input.mouse.x, this.input.mouse.y, factor);
    }

    // Keyboard commands (bound actions first, then contextual HUD hotkeys).
    for (const key of this.input.pressedKeys) {
      if (key === "escape") continue; // handled above
      if (/^[1-9]$/.test(key)) {
        const n = Number(key);
        if (this.input.ctrl) this.assignControlGroup(n);
        else if (this.input.shift) this.addToControlGroup(n);
        else this.recallControlGroup(n);
        continue;
      }
      if (key === this.kb.get("attackMove") && this.selUnits.some((u) => u.def.damage > 0)) {
        this.attackMoveMode = true;
      } else if (key === this.kb.get("patrol") && this.selUnits.some((u) => u.def.damage > 0)) {
        this.patrolMode = true;
      } else if (key === this.kb.get("holdGround") && this.selUnits.some((u) => u.def.damage > 0)) {
        const fighters = this.selUnits.filter((u) => u.def.damage > 0 && u.playerId === this.humanId);
        const turnOn = fighters.some((u) => !u.holdGround); // toggle as a group
        for (const u of fighters) {
          u.holdGround = turnOn;
          if (turnOn) u.attackTarget = null; // stop any current chase immediately
        }
        this.setMessage(turnOn ? "Holding position" : "Hold released");
        this.sfx.click();
      } else if (key === this.kb.get("stop") && this.selUnits.length > 0) {
        for (const u of this.selUnits) u.stop();
      } else if (key === this.kb.get("idleWorker")) {
        this.selectIdleWorkers();
      } else if (key === this.kb.get("selectArmy")) {
        this.selectArmy();
      } else if (key === this.kb.get("jumpBase")) {
        this.jumpToBase();
      } else {
        const action = this.hud.hotkeyAction(key);
        if (action) this.applyHudAction(action);
      }
    }

    // Left clicks.
    for (const click of this.input.leftClicks) {
      this.onLeftClick(click);
    }
    // Double-clicks: select all visible units of the clicked unit's type.
    for (const click of this.input.doubleClicks) {
      this.onDoubleClick(click);
    }

    // Drag release: drag-build a wall line in wall mode, otherwise box-select.
    const drag = this.input.consumeDragRelease();
    if (drag && !this.hud.isOverUi(drag.start)) {
      if (this.buildMode === "wall") this.placeWallLine(drag.start, drag.current);
      else if (!this.buildMode) this.onBoxSelect(drag.start, drag.current);
    }

    // Right clicks (a press-drag-release with a group sets a facing formation).
    for (const rc of this.input.rightClicks) {
      const dragLen = Math.hypot(rc.x - rc.fromX, rc.y - rc.fromY);
      const movers = this.selUnits.filter((u) => u.playerId === this.humanId);
      const overUi = this.hud.isOverUi({ x: rc.fromX, y: rc.fromY }) || this.hud.isOverUi(rc);
      if (dragLen > 24 && movers.length >= 2 && !overUi) {
        this.commandFormationDrag(rc, movers);
      } else {
        this.onRightClick(rc);
      }
    }
  }

  /** Press-drag-release with a group: place a facing formation (melee front). */
  private commandFormationDrag(
    rc: { x: number; y: number; fromX: number; fromY: number },
    movers: Unit[],
  ): void {
    this.sfx.click();
    const anchor = this.cam.screenToWorld(rc.fromX, rc.fromY);
    const end = this.cam.screenToWorld(rc.x, rc.y);
    let fx = end.x - anchor.x;
    let fy = end.y - anchor.y;
    const len = Math.hypot(fx, fy) || 1;
    fx /= len;
    fy /= len;
    for (const u of movers) {
      u.waypoints = [];
      u.patrolA = null;
      u.patrolB = null;
    }
    this.effects.spawnMoveMarker(anchor.x, anchor.y, true);
    this.formationOrders(movers, anchor, { x: fx, y: fy });
  }

  /**
   * Arrange `movers` in a rectangle centred on `anchor`, facing `face` (unit
   * vector). Melee fill the front rows; archers/catapults sit in the back.
   */
  private formationOrders(movers: Unit[], anchor: Vec2, face: Vec2): void {
    const isRanged = (u: Unit): boolean => u.kind === "archer" || u.kind === "catapult";
    const order = movers.slice().sort((a, b) => (isRanged(a) ? 1 : 0) - (isRanged(b) ? 1 : 0));
    const n = order.length;
    const cols = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(n * 1.7))));
    const sp = 30; // spacing in world units (~0.9 tile)
    const perp = { x: -face.y, y: face.x };
    order.forEach((u, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = (col - (cols - 1) / 2) * sp;
      const back = row * sp; // row 0 = front (toward `face`); later rows fall back
      const pt = {
        x: anchor.x + perp.x * cx - face.x * back,
        y: anchor.y + perp.y * cx - face.y * back,
      };
      if (u.def.damage > 0 && !u.def.canGather) orderAttackMove(this.world, u, pt);
      else orderMove(this.world, u, pt);
    });
  }

  private onLeftClick(p: Vec2): void {
    // Top-bar widgets: idle pills + control-group chips.
    const top = this.hud.topHit(p);
    if (top) {
      if (top.type === "idleWorkers") this.selectIdleWorkers();
      else if (top.type === "idleBuildings") this.cycleIdleBuilding();
      else this.recallControlGroup(top.n);
      return;
    }
    if (this.hud.isOverUi(p)) {
      if (this.hud.isOverMinimap(p)) {
        this.cam.centerOn(this.hud.minimapToWorld(p));
        return;
      }
      const action = this.hud.hitTestCommand(p);
      if (action) this.applyHudAction(action);
      return;
    }

    const world = this.cam.screenToWorld(p.x, p.y);

    // Casting an armed spell at the clicked point (first mage with mana fires).
    if (this.castMode) {
      const sp = SPELLS[this.castMode];
      const caster = this.selUnits.find((u) => u.kind === "mage" && u.playerId === this.humanId && u.mana >= sp.cost && u.castCd <= 0);
      if (caster) castSpell(this.world, caster, sp, world);
      else this.setMessage("Not enough mana");
      this.castMode = null;
      return;
    }

    // Placing a building.
    if (this.buildMode) {
      this.tryPlaceBuilding(world);
      return;
    }

    // Attack-move targeting.
    if (this.attackMoveMode) {
      for (const u of this.selUnits) if (u.def.damage > 0) orderAttackMove(this.world, u, world);
      this.effects.spawnMoveMarker(world.x, world.y, true);
      this.attackMoveMode = false;
      return;
    }

    // Patrol: set a route between the unit's current spot and the clicked point.
    if (this.patrolMode) {
      for (const u of this.selUnits) {
        if (u.def.damage <= 0 || u.playerId !== this.humanId) continue;
        u.patrolA = { ...u.pos };
        u.patrolB = { ...world };
        orderAttackMove(this.world, u, world);
      }
      this.patrolMode = false;
      this.sfx.click();
      return;
    }

    // Selection.
    const ent = entityAt(this.world, world);
    if (!this.input.shift) this.clearSelection();
    if (ent) {
      this.addToSelection(ent);
      if (ent.playerId === this.humanId) this.sfx.select(); // own-unit ack
    }
  }

  /** Snap the camera to the latest attack (if active) or the town hall. */
  private jumpToBase(): void {
    if (this.attackPing) {
      this.cam.centerOn({ x: this.attackPing.x, y: this.attackPing.y });
      return;
    }
    const own = this.world.buildingsOf(this.humanId);
    const th = own.find((b) => b.kind === "townhall") ?? own[0];
    if (th) this.cam.centerOn(th.center());
  }

  /** Select all combat units (non-workers) and center on their midpoint. */
  private selectArmy(): void {
    const army = this.world
      .unitsOf(this.humanId)
      .filter((u) => !u.def.canGather && u.def.damage > 0);
    if (army.length === 0) {
      this.setMessage("No army units");
      return;
    }
    this.clearSelection();
    let sx = 0;
    let sy = 0;
    for (const u of army) {
      u.selected = true;
      this.selUnits.push(u);
      sx += u.pos.x;
      sy += u.pos.y;
    }
    this.selBuildings = [];
    this.rebuildHudButtons();
    this.cam.centerOn({ x: sx / army.length, y: sy / army.length });
    this.sfx.click();
  }

  /** Select all idle workers and center the camera on one. */
  private selectIdleWorkers(): void {
    const idle = this.world.unitsOf(this.humanId).filter(
      (u) =>
        u.def.canGather &&
        u.state === "idle" &&
        !u.carrying &&
        !u.buildTarget &&
        u.path.length === 0 &&
        u.finalTarget === null,
    );
    if (idle.length === 0) {
      this.setMessage("No idle workers");
      return;
    }
    this.clearSelection();
    for (const u of idle) {
      u.selected = true;
      this.selUnits.push(u);
    }
    this.selBuildings = [];
    this.rebuildHudButtons();
    this.cam.centerOn(idle[0].pos);
    this.sfx.click();
  }

  /** Cycle the camera through idle production buildings (empty queue), one per click. */
  private cycleIdleBuilding(): void {
    const idle = this.world
      .buildingsOf(this.humanId)
      .filter((b) => b.state === "complete" && b.def.produces.length > 0 && b.queue.length === 0);
    if (idle.length === 0) {
      this.setMessage("No idle buildings");
      return;
    }
    if (this.idleBuildingIdx >= idle.length) this.idleBuildingIdx = 0;
    const b = idle[this.idleBuildingIdx];
    this.idleBuildingIdx++;
    this.clearSelection();
    b.selected = true;
    this.selBuildings = [b];
    this.cam.centerOn(b.center());
    this.rebuildHudButtons();
    this.sfx.click();
  }

  private onDoubleClick(p: Vec2): void {
    if (this.hud.isOverUi(p)) return;
    const world = this.cam.screenToWorld(p.x, p.y);
    const u = unitAt(this.world, world);
    if (!u || u.playerId !== this.humanId) return;
    // Select every friendly unit of the same kind currently in view.
    const r = this.cam.visibleTileRange();
    this.clearSelection();
    for (const o of this.world.units) {
      if (o.dead || o.playerId !== this.humanId || o.kind !== u.kind) continue;
      const t = o.tile();
      if (t.x < r.x0 || t.x > r.x1 || t.y < r.y0 || t.y > r.y1) continue;
      o.selected = true;
      this.selUnits.push(o);
    }
    this.selBuildings = [];
    this.rebuildHudButtons();
  }

  private onBoxSelect(a: Vec2, b: Vec2): void {
    // Test SCREEN-space containment: the drag box is axis-aligned on screen, but an
    // axis-aligned screen rect maps to a rotated quad in the iso world, so a
    // world-space rect test mis-selects. Project each unit to screen and compare.
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const picked = this.world.unitsOf(this.humanId).filter((u) => {
      const s = this.cam.worldToScreen(u.pos.x, u.pos.y);
      return s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY;
    });
    if (!this.input.shift) this.clearSelection();
    if (picked.length > 0) {
      for (const u of picked) {
        if (!this.selUnits.includes(u)) {
          u.selected = true;
          this.selUnits.push(u);
        }
      }
      this.selBuildings = [];
      this.sfx.select(); // acknowledge the drag-selected squad
    }
    this.rebuildHudButtons();
  }

  private onRightClick(p: Vec2): void {
    if (this.hud.isOverUi(p)) {
      // Right-click a spell button → toggle autocast for selected mages.
      const spellId = this.hud.spellButtonAt(p);
      if (spellId) {
        const mages = this.selUnits.filter((u) => u.kind === "mage" && u.playerId === this.humanId);
        const turnOn = !mages.every((m) => m.autocast === spellId);
        for (const m of mages) m.autocast = turnOn ? spellId : null;
        this.sfx.click();
        this.setMessage(`${SPELLS[spellId].label} autocast ${turnOn ? "ON" : "OFF"}`);
        this.rebuildHudButtons();
        return;
      }
      if (this.hud.isOverMinimap(p)) this.commandTo(this.hud.minimapToWorld(p));
      return;
    }
    if (this.castMode) {
      this.castMode = null; // right-click cancels an armed spell
      return;
    }
    if (this.buildMode) {
      this.buildMode = null;
      return;
    }
    if (this.attackMoveMode) {
      this.attackMoveMode = false;
      return;
    }
    if (this.patrolMode) {
      this.patrolMode = false;
      return;
    }
    const world = this.cam.screenToWorld(p.x, p.y);
    this.commandTo(world);
  }

  /** Issue a context-sensitive command to the current selection. */
  private commandTo(worldPt: Vec2): void {
    if (this.selUnits.length > 0 || this.selBuildings.length === 1) this.sfx.click();
    // Rally point for a single selected production building.
    if (this.selUnits.length === 0 && this.selBuildings.length === 1) {
      const b = this.selBuildings[0];
      if (b.playerId === this.humanId && b.def.produces.length > 0) b.rally = { ...worldPt };
      return;
    }
    if (this.selUnits.length === 0) return;

    const target = entityAt(this.world, worldPt);
    const tile = toTile(worldPt.x, worldPt.y);
    const node = this.world.map.at(tile.x, tile.y);

    // Right-clicking one's own building with workers: build it if unfinished,
    // or repair it if it's complete but damaged.
    const ownBuilding =
      target && target.etype === "building" && target.playerId === this.humanId ? target : null;
    const workTarget =
      ownBuilding && (ownBuilding.state !== "complete" || ownBuilding.hp < ownBuilding.def.maxHp)
        ? ownBuilding
        : null;

    const isEnemyTarget = !!(target && target.playerId !== this.humanId);
    const isResource =
      !!node && node.resource > 0 && (node.terrain === "forest" || node.terrain === "goldmine");
    const movers = this.selUnits.filter((u) => u.playerId === this.humanId);
    const plainMove = !workTarget && !isEnemyTarget && !isResource;

    // Shift + right-click on open ground queues a waypoint instead of replacing
    // the current order; units visit queued points in sequence.
    if (plainMove && this.input.shift) {
      for (const u of movers) u.waypoints.push({ ...worldPt });
      return;
    }
    // A fresh (non-queued) command clears any pending waypoints and patrol.
    for (const u of movers) {
      u.waypoints = [];
      u.patrolA = null;
      u.patrolB = null;
    }

    // Combat units treat a right-click on open ground as attack-move (engage
    // anything en route); workers just walk. Red marker when aggressive.
    const isFighter = (u: Unit): boolean => u.def.damage > 0 && !u.def.canGather;
    const aggressive = movers.some(isFighter);
    if (plainMove) this.effects.spawnMoveMarker(worldPt.x, worldPt.y, aggressive);

    // Plain group move → form up facing the direction of travel (melee front,
    // ranged/siege behind), so the squad arrives as a battle line.
    if (plainMove && movers.length > 1) {
      let cx = 0;
      let cy = 0;
      for (const u of movers) {
        cx += u.pos.x;
        cy += u.pos.y;
      }
      cx /= movers.length;
      cy /= movers.length;
      let fx = worldPt.x - cx;
      let fy = worldPt.y - cy;
      const len = Math.hypot(fx, fy) || 1;
      this.formationOrders(movers, worldPt, { x: fx / len, y: fy / len });
      return;
    }

    for (const u of this.selUnits) {
      if (u.playerId !== this.humanId) continue;

      if (workTarget && u.def.canBuild) {
        orderBuild(this.world, u, workTarget);
      } else if (target && target.playerId !== this.humanId) {
        orderAttack(this.world, u, target);
      } else if (u.def.canGather && node && node.resource > 0 &&
        (node.terrain === "forest" || node.terrain === "goldmine")) {
        orderGather(this.world, u, tile);
      } else if (isFighter(u)) {
        orderAttackMove(this.world, u, worldPt); // combat units engage en route
      } else {
        orderMove(this.world, u, worldPt);
      }
    }
  }

  // --- Pause menu ---------------------------------------------------------

  private onEscape(): void {
    if (this.paused) {
      if (this.pauseMenu.awaiting) this.pauseMenu.awaiting = null; // cancel rebind
      else this.setPaused(false);
      return;
    }
    if (this.buildMode) {
      this.buildMode = null;
      return;
    }
    if (this.attackMoveMode) {
      this.attackMoveMode = false;
      return;
    }
    if (this.patrolMode) {
      this.patrolMode = false;
      return;
    }
    this.setPaused(true);
  }

  private setPaused(value: boolean): void {
    this.paused = value;
    this.pauseMenu.awaiting = null;
  }

  private doLoad(): void {
    const res = loadGame();
    if (!res) {
      this.setMessage("No saved game");
      return;
    }
    this.world = res.world;
    this.fog = new Fog(this.humanId);
    this.fog.importExplored(res.explored);
    this.ai = new AIController(AI_PLAYER);
    this.selUnits = [];
    this.selBuildings = [];
    this.controlGroups.clear();
    this.buildMode = null;
    this.builder = null;
    this.attackMoveMode = false;
    this.patrolMode = false;
    this.effects.clear();
    this.attackPing = null;
    this.gameOver = null;
    this.elapsed = 0;
    this.kills = 0;
    this.razed = 0;
    this.shake = 0;
    this.endFanfarePlayed = false;
    this.world.recomputeSupply();
    this.fog.update(this.world);
    const th = this.world.buildingsOf(this.humanId).find((b) => b.kind === "townhall");
    this.pendingCenter = th ? th.center() : tileCenter(5, 5);
    this.rebuildHudButtons();
    this.setPaused(false);
    this.setMessage("Game loaded");
  }

  private handleMenuInput(): void {
    // Capture the next key press as a new binding.
    if (this.pauseMenu.awaiting) {
      for (const key of this.input.pressedKeys) {
        if (key === "escape") break; // handled by onEscape (cancels)
        this.kb.set(this.pauseMenu.awaiting, key);
        this.pauseMenu.awaiting = null;
        break;
      }
    }
    for (const click of this.input.leftClicks) {
      const res = this.pauseMenu.hitTest(this.cam, click);
      if (!res) continue;
      if (res.type === "resume") this.setPaused(false);
      else if (res.type === "restart") {
        this.setPaused(false);
        this.startNewGame((Math.floor(performance.now()) % 100000) + 1);
      } else if (res.type === "save") {
        const ok = saveGame(this.world, this.fog.exportExplored());
        this.setMessage(ok ? "Game saved" : "Save failed");
      } else if (res.type === "load") {
        this.doLoad();
      } else if (res.type === "reset") this.kb.reset();
      else if (res.type === "toggleEdgeScroll") {
        this.edgeScroll = !this.edgeScroll;
        try {
          localStorage.setItem("warlords.edgeScroll", this.edgeScroll ? "1" : "0");
        } catch {
          /* storage blocked */
        }
      } else if (res.type === "toggleMusic") {
        this.sfx.toggleMusic();
      } else if (res.type === "toggleFullscreen") {
        try {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
        } catch {
          /* fullscreen unavailable */
        }
      } else if (res.type === "rebind") this.pauseMenu.awaiting = res.action;
    }
  }

  // --- Commands -----------------------------------------------------------

  private applyHudAction(action: HudAction): void {
    if (action.type === "denied") {
      this.setMessage(`${action.label}: ${action.reason}`);
      return;
    }
    this.sfx.click();
    if (action.type === "stop") {
      for (const u of this.selUnits) u.stop();
      return;
    }
    if (action.type === "spell") {
      // Left-click a spell → arm targeting; the next map click casts it.
      this.castMode = action.id;
      this.buildMode = null;
      this.attackMoveMode = false;
      this.setMessage(`${SPELLS[action.id].label}: click a target`);
      return;
    }
    if (action.type === "cancel") {
      const b = this.selBuildings[0];
      if (b && b.playerId === this.humanId && cancelBuilding(this.world, b)) {
        this.clearSelection();
      }
      return;
    }
    if (action.type === "build") {
      const worker = this.selUnits.find((u) => u.def.canBuild);
      if (!worker) return;
      this.builder = worker;
      this.buildMode = action.kind;
      return;
    }
    if (action.type === "cancelUnit") {
      const b = this.selBuildings.find((b) => b.def.produces.length > 0 && b.queue.length > 0);
      if (b) cancelQueuedUnit(this.world, b);
      this.rebuildHudButtons();
      return;
    }
    if (action.type === "train") {
      const b = this.selBuildings.find((b) => b.def.produces.includes(action.kind));
      if (!b) return;
      const err = enqueueUnit(this.world, b, action.kind);
      if (err) this.setMessage(err);
      else this.rebuildHudButtons();
    }
  }

  private tryPlaceBuilding(worldPt: Vec2): void {
    const kind = this.buildMode!;
    const fp = BUILDING_DEFS[kind].footprint;
    const t = toTile(worldPt.x, worldPt.y);
    const tx = t.x - Math.floor(fp / 2);
    const ty = t.y - Math.floor(fp / 2);
    const result = placeBuilding(this.world, this.humanId, kind, tx, ty, this.builder ?? undefined);
    if (typeof result === "string") {
      this.setMessage(result);
    } else {
      this.buildMode = null;
      this.builder = null;
      this.rebuildHudButtons();
    }
  }

  /** Drag-build a straight run of walls between two screen points. */
  private placeWallLine(aScreen: Vec2, bScreen: Vec2): void {
    const wa = this.cam.screenToWorld(aScreen.x, aScreen.y);
    const wb = this.cam.screenToWorld(bScreen.x, bScreen.y);
    const ta = toTile(wa.x, wa.y);
    const tb = toTile(wb.x, wb.y);
    const dx = tb.x - ta.x;
    const dy = tb.y - ta.y;
    // Snap to a single straight axis (the dominant one).
    const tiles: { x: number; y: number }[] = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      const step = Math.sign(dx) || 1;
      for (let x = ta.x; step > 0 ? x <= tb.x : x >= tb.x; x += step) tiles.push({ x, y: ta.y });
    } else {
      const step = Math.sign(dy) || 1;
      for (let y = ta.y; step > 0 ? y <= tb.y : y >= tb.y; y += step) tiles.push({ x: ta.x, y });
    }
    let placed = 0;
    let builderAssigned = false;
    for (const t of tiles) {
      const builder = !builderAssigned ? (this.builder ?? undefined) : undefined;
      const res = placeBuilding(this.world, this.humanId, "wall", t.x, t.y, builder);
      if (typeof res !== "string") {
        placed++;
        if (builder) builderAssigned = true;
      }
    }
    if (placed > 0) {
      this.sfx.build();
      this.buildMode = null;
      this.builder = null;
      this.rebuildHudButtons();
    } else {
      this.setMessage("Cannot build wall there");
    }
  }

  // --- Control groups -----------------------------------------------------

  private assignControlGroup(n: number): void {
    const units = this.selUnits.filter((u) => !u.dead && u.playerId === this.humanId);
    if (units.length === 0) return;
    this.controlGroups.set(n, [...units]);
    this.sfx.click();
  }

  /** Shift+digit: add the current selection to an existing group (dedup). */
  private addToControlGroup(n: number): void {
    const sel = this.selUnits.filter((u) => !u.dead && u.playerId === this.humanId);
    if (sel.length === 0) return;
    const grp = (this.controlGroups.get(n) ?? []).filter((u) => !u.dead);
    for (const u of sel) if (!grp.includes(u)) grp.push(u);
    this.controlGroups.set(n, grp);
    this.sfx.click();
  }

  private recallControlGroup(n: number): void {
    const grp = this.controlGroups.get(n);
    if (!grp) return;
    const alive = grp.filter((u) => !u.dead);
    this.controlGroups.set(n, alive); // prune dead
    if (alive.length === 0) return;
    this.clearSelection();
    for (const u of alive) {
      u.selected = true;
      this.selUnits.push(u);
    }
    this.selBuildings = [];
    this.rebuildHudButtons();
    this.sfx.click();
    // Double-tap the same group quickly → center the camera on it.
    if (this.lastRecall && this.lastRecall.n === n && this.elapsed - this.lastRecall.t < 0.4) {
      let sx = 0;
      let sy = 0;
      for (const u of alive) {
        sx += u.pos.x;
        sy += u.pos.y;
      }
      this.cam.centerOn({ x: sx / alive.length, y: sy / alive.length });
    }
    this.lastRecall = { n, t: this.elapsed };
  }

  // --- Selection helpers --------------------------------------------------

  private clearSelection(): void {
    for (const u of this.selUnits) u.selected = false;
    for (const b of this.selBuildings) b.selected = false;
    this.selUnits = [];
    this.selBuildings = [];
    this.rebuildHudButtons();
  }

  private addToSelection(ent: Unit | Building): void {
    if (ent.etype === "unit") {
      ent.selected = true;
      this.selUnits.push(ent);
      this.selBuildings = [];
    } else {
      // Buildings select singly.
      this.clearSelection();
      ent.selected = true;
      this.selBuildings = [ent];
    }
    this.rebuildHudButtons();
  }

  private pruneSelection(): void {
    const beforeU = this.selUnits.length;
    const beforeB = this.selBuildings.length;
    this.selUnits = this.selUnits.filter((u) => !u.dead);
    this.selBuildings = this.selBuildings.filter((b) => !b.dead);
    if (this.selUnits.length !== beforeU || this.selBuildings.length !== beforeB) {
      this.rebuildHudButtons();
    }
  }

  private rebuildHudButtons(): void {
    this.hud.rebuildButtons(this.world, this.humanId, this.selUnits, this.selBuildings);
  }

  private setMessage(text: string): void {
    this.message = text;
    this.messageTimer = 2.5;
  }

  // --- Win / loss ---------------------------------------------------------

  private checkWinLoss(): void {
    for (const p of this.world.players) {
      if (p.defeated) continue;
      const hasBuildings = this.world.buildingsOf(p.id).length > 0;
      const canRebuild = this.world.unitsOf(p.id).some((u) => u.def.canBuild);
      if (!hasBuildings && !canRebuild) p.defeated = true;
    }
    if (this.world.player(this.humanId).defeated) this.gameOver = "lost";
    else if (this.world.player(AI_PLAYER).defeated) this.gameOver = "won";
  }

  // --- Render -------------------------------------------------------------

  private render(): void {
    // Build placement preview.
    let preview: RenderState["buildPreview"] = null;
    if (this.buildMode) {
      const wp = this.cam.screenToWorld(this.input.mouse.x, this.input.mouse.y);
      const fp = BUILDING_DEFS[this.buildMode].footprint;
      const t = toTile(wp.x, wp.y);
      const tx = t.x - Math.floor(fp / 2);
      const ty = t.y - Math.floor(fp / 2);
      preview = { kind: this.buildMode, tile: { x: tx, y: ty }, valid: canPlace(this.world, this.buildMode, tx, ty) };
    }

    let dragBox: RenderState["dragBoxScreen"] = null;
    // No selection box while placing buildings — a wall drag isn't a selection.
    if (this.input.drag.active && !this.buildMode) {
      const d = this.input.drag;
      dragBox = normalizeRect(d.start.x, d.start.y, d.current.x, d.current.y);
    }

    this.renderer.render(
      this.world,
      this.fog,
      this.humanId,
      { dragBoxScreen: dragBox, buildPreview: preview },
      this.effects,
      this.elapsed,
      this.shake,
    );

    // "Under attack" crimson edge pulse — fades over the first 1.5s of a hit.
    if (this.attackPing && this.attackPing.t < 1.5) {
      const k = 1 - this.attackPing.t / 1.5;
      const a = 0.32 * k * (0.55 + 0.45 * Math.sin(this.attackPing.t * 14));
      if (a > 0.01) {
        const W = this.cam.viewW;
        const H = this.cam.viewH;
        const grd = this.ctx.createRadialGradient(
          W / 2, H / 2, Math.min(W, H) * 0.34,
          W / 2, H / 2, Math.max(W, H) * 0.62,
        );
        grd.addColorStop(0, "rgba(150,20,20,0)");
        grd.addColorStop(1, `rgba(150,20,20,${a.toFixed(3)})`);
        this.ctx.fillStyle = grd;
        this.ctx.fillRect(0, 0, W, H);
      }
    }

    this.hud.render(
      this.world,
      this.cam,
      this.humanId,
      this.selUnits,
      this.selBuildings,
      this.fog.vis,
      this.patrolMode
        ? "Patrol: click a point to patrol to"
        : this.attackMoveMode
          ? "Attack-move: click a target location"
          : this.message,
      this.attackPing,
      this.controlGroups,
    );

    // Audio mute indicator (top-right of the resource bar).
    this.ctx.font = "14px 'Segoe UI', sans-serif";
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = this.sfx.muted ? "#ff8888" : "#9fb2c2";
    this.ctx.fillText(`${this.sfx.muted ? "🔇" : "🔊"} M`, this.cam.viewW - 12, 17);

    if (this.paused && !this.gameOver)
      this.pauseMenu.render(this.ctx, this.cam, this.kb, this.edgeScroll, this.sfx.musicEnabled);
    if (this.gameOver) this.hud.renderEndScreen(this.cam, this.gameOver === "won", this.elapsed, this.kills, this.razed);
  }
}
