import { World, HUMAN_PLAYER, AI_PLAYER } from "./World.ts";
import { Camera } from "./Camera.ts";
import { Input } from "./Input.ts";
import { Renderer, type RenderState } from "./render/Renderer.ts";
import { Assets } from "./render/assets.ts";
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
import { updateProduction, enqueueUnit } from "./systems/production.ts";
import { placeBuilding, canPlace, cancelBuilding } from "./systems/placement.ts";
import {
  orderMove,
  orderAttack,
  orderAttackMove,
  orderGather,
  orderBuild,
  nearestWalkable,
} from "./systems/orders.ts";
import { entityAt, unitsInRect } from "./systems/selection.ts";

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cam: Camera;
  private readonly input: Input;
  private readonly renderer: Renderer;
  private readonly assets = new Assets();
  private readonly hud: Hud;
  private readonly kb: Keybindings;
  private readonly pauseMenu = new PauseMenu();
  private paused = false;

  private world!: World;
  private fog!: Fog;
  private ai!: AIController;

  private selUnits: Unit[] = [];
  private selBuildings: Building[] = [];

  private buildMode: BuildingKind | null = null;
  private builder: Unit | null = null;
  private attackMoveMode = false;

  private message: string | null = null;
  private messageTimer = 0;

  private gameOver: "won" | "lost" | null = null;
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
    this.paused = false;

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

    this.ai.update(this.world, dt);
    updateProduction(this.world, dt);
    updateGather(this.world, dt);
    updateCombat(this.world, dt);
    updateMovement(this.world, dt);

    this.world.cleanupDead();
    this.world.recomputeSupply();
    this.pruneSelection();
    this.fog.update(this.world);
    this.checkWinLoss();
  }

  // --- Input --------------------------------------------------------------

  private handleInput(dt: number): void {
    const k = this.input.keys;

    // Restart on the end screen.
    if (this.gameOver && this.input.pressedKeys.includes("r")) {
      this.startNewGame((Math.floor(performance.now()) % 100000) + 1);
      return;
    }

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

    // Keyboard commands (bound actions first, then contextual HUD hotkeys).
    for (const key of this.input.pressedKeys) {
      if (key === "escape") continue; // handled above
      if (key === this.kb.get("attackMove") && this.selUnits.some((u) => u.def.damage > 0)) {
        this.attackMoveMode = true;
      } else if (key === this.kb.get("stop") && this.selUnits.length > 0) {
        for (const u of this.selUnits) u.stop();
      } else {
        const action = this.hud.hotkeyAction(key);
        if (action) this.applyHudAction(action);
      }
    }

    // Left clicks.
    for (const click of this.input.leftClicks) {
      this.onLeftClick(click);
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

    // Right-clicking one's own unfinished building sends workers to build it.
    const buildSite =
      target && target.etype === "building" && target.playerId === this.humanId &&
      target.state !== "complete"
        ? target
        : null;

    for (const u of this.selUnits) {
      if (u.playerId !== this.humanId) continue;

      if (buildSite && u.def.canBuild) {
        orderBuild(this.world, u, buildSite);
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
      } else if (res.type === "reset") this.kb.reset();
      else if (res.type === "rebind") this.pauseMenu.awaiting = res.action;
    }
  }

  // --- Commands -----------------------------------------------------------

  private applyHudAction(action: HudAction): void {
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

    this.renderer.render(this.world, this.fog, this.humanId, {
      dragBoxScreen: dragBox,
      buildPreview: preview,
    });

    this.hud.render(
      this.world,
      this.cam,
      this.humanId,
      this.selUnits,
      this.selBuildings,
      this.fog.vis,
      this.attackMoveMode ? "Attack-move: click a target location" : this.message,
    );

    if (this.paused && !this.gameOver) this.pauseMenu.render(this.ctx, this.cam, this.kb);
    if (this.gameOver) this.hud.renderEndScreen(this.cam, this.gameOver === "won");
  }
}
