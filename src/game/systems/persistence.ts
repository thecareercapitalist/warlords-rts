import type { TerrainType, UnitKind, BuildingKind, ResourceKind } from "../types.ts";
import { World } from "../World.ts";
import { Unit } from "../entities/Unit.ts";
import { Building } from "../entities/Building.ts";

// Minimal save/load to localStorage. We persist durable state only — positions,
// HP, resources, buildings, terrain resource amounts, and fog — and reset
// transient state (orders, targets) to idle on load. Entity cross-references
// (attack targets, drop-offs) are intentionally dropped so the save can never
// contain a dangling pointer.

const KEY = "warlords.save.v1";

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
  unt: { k: UnitKind; p: number; x: number; y: number; hp: number; c: [ResourceKind, number] | null }[];
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
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(world: World, explored: number[]): boolean {
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
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // quota or storage blocked
  }
}

/** Rebuild a World from the save plus the explored-tile mask, or null if none. */
export function loadGame(): { world: World; explored: number[] } | null {
  let data: SaveData;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    data = JSON.parse(raw) as SaveData;
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
    if (u.c) uu.carrying = { kind: u.c[0], amount: u.c[1] };
    w.addUnit(uu);
  }
  w.recomputeSupply();
  return { world: w, explored: data.explored ?? [] };
}
