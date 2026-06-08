import type { TerrainType, UnitKind, BuildingKind, ResourceKind } from "../types.ts";
import { World } from "../World.ts";
import { Unit } from "../entities/Unit.ts";
import { Building } from "../entities/Building.ts";
import { orderGather } from "./orders.ts";

// Minimal save/load to localStorage. We persist durable state only — positions,
// HP, resources, buildings, terrain resource amounts, and fog — and reset
// transient state (orders, targets) to idle on load. Entity cross-references
// (attack targets, drop-offs) are intentionally dropped so the save can never
// contain a dangling pointer.

const LEGACY_KEY = "warlords.save.v1";
const SLOTS = 3;
const slotKey = (slot: number): string => `warlords.save.v1.${slot}`;

/** Per-slot metadata for the load list. */
export interface SlotMeta {
  slot: number;
  savedAt: number; // epoch ms
  elapsed: number; // seconds of in-game time
}

interface SlotWrapper {
  savedAt: number;
  elapsed: number;
  data: SaveData;
}

/** Metadata for all slots (null = empty). Legacy single save shows as slot 0. */
export function listSlots(): (SlotMeta | null)[] {
  const out: (SlotMeta | null)[] = [];
  for (let s = 0; s < SLOTS; s++) {
    let meta: SlotMeta | null = null;
    try {
      const raw = localStorage.getItem(slotKey(s)) ?? (s === 0 ? localStorage.getItem(LEGACY_KEY) : null);
      if (raw) {
        const obj = JSON.parse(raw) as Partial<SlotWrapper> & Partial<SaveData>;
        const savedAt = typeof obj.savedAt === "number" ? obj.savedAt : 0;
        const elapsed = typeof obj.elapsed === "number" ? obj.elapsed : 0;
        meta = { slot: s, savedAt, elapsed };
      }
    } catch {
      /* ignore */
    }
    out.push(meta);
  }
  return out;
}

/** Slot to overwrite on a quick-save: first empty, else the oldest. */
export function nextSaveSlot(): number {
  const metas = listSlots();
  const empty = metas.findIndex((m) => m === null);
  if (empty >= 0) return empty;
  let oldest = 0;
  let oldestAt = Infinity;
  metas.forEach((m, i) => {
    if (m && m.savedAt < oldestAt) {
      oldestAt = m.savedAt;
      oldest = i;
    }
  });
  return oldest;
}

const TERRAIN_IDS: TerrainType[] = ["grass", "water", "forest", "rock", "goldmine"];
const TERRAIN_TO_ID: Record<TerrainType, number> = {
  grass: 0,
  water: 1,
  forest: 2,
  rock: 3,
  goldmine: 4,
};

interface SaveData {
  v: 1;
  players: { g: number; w: number; d: boolean }[];
  terr: number[];
  res: number[];
  unt: {
    k: UnitKind;
    p: number;
    x: number;
    y: number;
    hp: number;
    c: [ResourceKind, number] | null;
    rt?: [number, number] | null; // resource tile being harvested (resume on load)
    ac?: string | null; // mage autocast spell (persist so loaded mages keep casting)
    kl?: number; // kills (preserve veterancy rank across save/load)
  }[];
  bld: {
    k: BuildingKind;
    p: number;
    tx: number;
    ty: number;
    st: Building["state"];
    con: number;
    hp: number;
    q: UnitKind[];
    pt: number;
    r: [number, number] | null;
  }[];
  explored: number[];
}

export function hasSave(): boolean {
  return listSlots().some((m) => m !== null);
}

export function saveGame(world: World, explored: number[], slot = 0, elapsed = 0): boolean {
  const data: SaveData = {
    v: 1,
    players: world.players.map((p) => ({ g: p.gold, w: p.wood, d: p.defeated })),
    terr: world.map.tiles.map((t) => TERRAIN_TO_ID[t.terrain]),
    res: world.map.tiles.map((t) => t.resource),
    unt: world.units
      .filter((u) => !u.dead)
      .map((u) => ({
        k: u.kind,
        p: u.playerId,
        x: Math.round(u.pos.x),
        y: Math.round(u.pos.y),
        hp: Math.round(u.hp),
        c: u.carrying ? [u.carrying.kind, u.carrying.amount] : null,
        rt: u.resourceTile ? [u.resourceTile.x, u.resourceTile.y] : null,
        ac: u.autocast ?? null,
        kl: u.kills,
      })),
    bld: world.buildings
      .filter((b) => !b.dead)
      .map((b) => ({
        k: b.kind,
        p: b.playerId,
        tx: b.tile.x,
        ty: b.tile.y,
        st: b.state,
        con: Number(b.construction.toFixed(3)),
        hp: Math.round(b.hp),
        q: b.queue.slice(),
        pt: Number(b.productionTimer.toFixed(2)),
        r: b.rally ? [Math.round(b.rally.x), Math.round(b.rally.y)] : null,
      })),
    explored,
  };
  const wrapper: SlotWrapper = { savedAt: Date.now(), elapsed, data };
  try {
    localStorage.setItem(slotKey(slot), JSON.stringify(wrapper));
    return true;
  } catch {
    return false; // quota or storage blocked
  }
}

/** Rebuild a World from a slot plus the explored-tile mask, or null if none. */
export function loadGame(slot = 0): { world: World; explored: number[]; elapsed: number } | null {
  let data: SaveData;
  let elapsed = 0;
  try {
    const raw = localStorage.getItem(slotKey(slot)) ?? (slot === 0 ? localStorage.getItem(LEGACY_KEY) : null);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Partial<SlotWrapper> & Partial<SaveData>;
    // New saves wrap data in {savedAt, elapsed, data}; legacy saves are bare SaveData.
    data = (obj.data ?? (obj as SaveData)) as SaveData;
    if (typeof obj.elapsed === "number") elapsed = obj.elapsed;
    if (data.v !== 1) return null;
  } catch {
    return null;
  }

  const w = new World(1); // seed irrelevant — tiles are overwritten below
  for (let i = 0; i < w.map.tiles.length && i < data.terr.length; i++) {
    const t = w.map.tiles[i];
    t.terrain = TERRAIN_IDS[data.terr[i]] ?? "grass";
    t.resource = data.res[i] ?? 0;
    t.occupied = false;
  }
  data.players.forEach((p, i) => {
    const ps = w.players[i];
    if (!ps) return;
    ps.gold = p.g;
    ps.wood = p.w;
    ps.defeated = p.d;
  });
  for (const b of data.bld) {
    const bb = new Building(b.k, b.p, { x: b.tx, y: b.ty }, b.st === "complete");
    bb.state = b.st;
    bb.construction = b.con;
    bb.hp = b.hp;
    bb.queue = b.q.slice();
    bb.productionTimer = b.pt;
    bb.rally = b.r ? { x: b.r[0], y: b.r[1] } : null;
    w.addBuilding(bb); // marks footprint occupied
  }
  for (const u of data.unt) {
    const uu = new Unit(u.k, u.p, { x: u.x, y: u.y });
    uu.hp = u.hp;
    if (u.ac) uu.autocast = u.ac;
    if (u.kl) uu.kills = u.kl;
    if (u.c) uu.carrying = { kind: u.c[0], amount: u.c[1] };
    w.addUnit(uu);
    // Resume harvesting the tile it was on, so loaded workers don't stand idle.
    if (u.rt) {
      const rtile = w.map.at(u.rt[0], u.rt[1]);
      if (rtile && rtile.resource > 0 && (rtile.terrain === "forest" || rtile.terrain === "goldmine")) {
        orderGather(w, uu, { x: u.rt[0], y: u.rt[1] });
      }
    }
  }
  w.recomputeSupply();
  return { world: w, explored: data.explored ?? [], elapsed };
}
