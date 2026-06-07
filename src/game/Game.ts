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
import { updateProduction, enqueueUnit, cancelQueuedUnit } from "./systems/production.ts";
import { placeBuilding, canPlace, cancelBuilding } from "./systems/placement.ts";
import {
  orderMove,
  orderAttack,
  orderAttackMove,
  orderGather,
  orderBuild,
  nearestWalkable,
} from "./systems/orders.ts";
import { entityAt, unitAt, unitsInRect } from "./systems/selection.ts";
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

  private world!: World;
  private fog!: Fog;
  private ai!: AIController;

  private selUnits: Unit[] = [];
  private selBuildings: Building[] = [];
  /** Ctrl+1..9 control groups → recall with 1..9. */
  private controlGroups = new Map<number, Unit[]>();

  private buildMode: BuildingKind | null = null;
  private builder: Unit | null = null;
  private attackMoveMode = false;

  private message: string | null = null;
  private messageTimer = 0;
  private attackAlertCd = 0; // throttles the "under attack" warning
  private attackPing: { x: number; y: number; t: number } | null = null;

  private gameOver: "won" | "lost" | null = null;
  private elapsed = 0; // seconds of active play
  private kills = 0; // enemy units/buildings destroyed by the human
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
    this.gameOver = null;
    this.elapsed = 0;
    this.kills = 0;
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
    if (this.attackAlertCd > 0) this.attackAlertCd -= dt;
    if (this.attackPing) {
      this.attackPing.t += dt;
      if (this.attackPing.t > 4) this.attackPing = null;
    }

    this.ai.update(this.world, dt);
    updateProduction(this.world, dt);
    updateGather(this.world, dt);
    updateCombat(this.world, dt);
    updateMovement(this.world, dt);

    // Drain gameplay events into the presentation layer (before cleanup so
    // death positions are still valid), then advance effect animations.
    for (const e of this.world.events) {
      if (e.type === "projectile") this.effects.spawnProjectile(e.from, e.to);
      else if (e.type === "death") {
        this.effects.spawnDeath(e.x, e.y, e.color, e.glyph);
        this.sfx.death();
        if (e.by === this.humanId) this.kills++;
      } else if (e.type === "collapse") {
        this.effects.spawnCollapse(e.x, e.y, e.size);
        this.sfx.collapse();
        if (e.by === this.humanId) this.kills++;
      } else if (e.type === "attack") this.sfx.attack(e.ranged);
      else if (e.type === "build") this.sfx.build();
      else if (e.type === "gain" && e.playerId === this.humanId) {
        this.effects.spawnFloater(e.x, e.y, `+${e.amount}`, e.kind === "gold" ? "#e8c060" : "#b07a45");
      }
      else if (e.type === "damaged" && e.playerId === this.humanId) {
        this.attackPing = { x: e.x, y: e.y, t: 0 }; // keep ping fresh during an assault
        if (this.attackAlertCd <= 0) {
          this.setMessage("⚔ Your forces are under attack!");
          this.sfx.alert();
          this.attackAlertCd = 6;
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
    if (this.input.moved) {
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
        else this.recallControlGroup(n);
        continue;
      }
      if (key === this.kb.get("attackMove") && this.selUnits.some((u) => u.def.damage > 0)) {
        this.attackMoveMode = true;
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

    // Drag-select release.
    const drag = this.input.consumeDragRelease();
    if (drag && !this.hud.isOverUi(drag.start)) {
      this.onBoxSelect(drag.start, drag.current);
    }

    // Right clicks.
    for (const click of this.input.rightClicks) {
      this.onRightClick(click);
    }
  }

  private onLeftClick(p: Vec2): void {
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

    // Placing a building.
    if (this.buildMode) {
      this.tryPlaceBuilding(world);
      return;
    }

    // Attack-move targeting.
    if (this.attackMoveMode) {
      for (const u of this.selUnits) if (u.def.damage > 0) orderAttackMove(this.world, u, world);
      this.attackMoveMode = false;
      return;
    }

    // Selection.
    const ent = entityAt(this.world, world);
    if (!this.input.shift) this.clearSelection();
    if (ent) this.addToSelection(ent);
  }

  /** Grid of destination points centered on `center` for a group move. */
  private formationPoints(center: Vec2, n: number): Vec2[] {
    if (n <= 1) return [{ ...center }];
    const spacing = 26;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const cx = i % cols;
      const cy = Math.floor(i / cols);
      pts.push({
        x: center.x + (cx - (cols - 1) / 2) * spacing,
        y: center.y + (cy - (rows - 1) / 2) * spacing,
      });
    }
    return pts;
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
    const r0 = this.cam.screenToWorld(a.x, a.y);
    const r1 = this.cam.screenToWorld(b.x, b.y);
    const rect = normalizeRect(r0.x, r0.y, r1.x, r1.y);
    const picked = unitsInRect(this.world, rect, this.humanId);
    if (!this.input.shift) this.clearSelection();
    if (picked.length > 0) {
      for (const u of picked) {
        if (!this.selUnits.includes(u)) {
          u.selected = true;
          this.selUnits.push(u);
        }
      }
      this.selBuildings = [];
    }
    this.rebuildHudButtons();
  }

  private onRightClick(p: Vec2): void {
    if (this.hud.isOverUi(p)) {
      if (this.hud.isOverMinimap(p)) this.commandTo(this.hud.minimapToWorld(p));
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

    // Plain group move → spread into a loose grid so units don't pile on one tile.
    const isEnemyTarget = !!(target && target.playerId !== this.humanId);
    const isResource =
      !!node && node.resource > 0 && (node.terrain === "forest" || node.terrain === "goldmine");
    const movers = this.selUnits.filter((u) => u.playerId === this.humanId);
    if (!workTarget && !isEnemyTarget && !isResource && movers.length > 1) {
      const pts = this.formationPoints(worldPt, movers.length);
      movers.forEach((u, i) => orderMove(this.world, u, pts[i]));
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
    this.effects.clear();
    this.attackPing = null;
    this.gameOver = null;
    this.elapsed = 0;
    this.kills = 0;
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
      else if (res.type === "rebind") this.pauseMenu.awaiting = res.action;
    }
  }

  // --- Commands -----------------------------------------------------------

  private applyHudAction(action: HudAction): void {
    this.sfx.click();
    if (action.type === "stop") {
      for (const u of this.selUnits) u.stop();
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

  // --- Control groups -----------------------------------------------------

  private assignControlGroup(n: number): void {
    const units = this.selUnits.filter((u) => !u.dead && u.playerId === this.humanId);
    if (units.length === 0) return;
    this.controlGroups.set(n, [...units]);
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
    if (this.input.drag.active) {
      const d = this.input.drag;
      dragBox = normalizeRect(d.start.x, d.start.y, d.current.x, d.current.y);
    }

    this.renderer.render(
      this.world,
      this.fog,
      this.humanId,
      { dragBoxScreen: dragBox, buildPreview: preview },
      this.effects,
    );

    this.hud.render(
      this.world,
      this.cam,
      this.humanId,
      this.selUnits,
      this.selBuildings,
      this.fog.vis,
      this.attackMoveMode ? "Attack-move: click a target location" : this.message,
      this.attackPing,
    );

    // Audio mute indicator (top-right of the resource bar).
    this.ctx.font = "14px 'Segoe UI', sans-serif";
    this.ctx.textAlign = "right";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = this.sfx.muted ? "#ff8888" : "#9fb2c2";
    this.ctx.fillText(`${this.sfx.muted ? "🔇" : "🔊"} M`, this.cam.viewW - 12, 17);

    if (this.paused && !this.gameOver) this.pauseMenu.render(this.ctx, this.cam, this.kb);
    if (this.gameOver) this.hud.renderEndScreen(this.cam, this.gameOver === "won", this.elapsed, this.kills);
  }
}
