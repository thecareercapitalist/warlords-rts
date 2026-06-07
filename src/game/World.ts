import type { PlayerState, ResourceKind, Vec2 } from "./types.ts";
import { TileMap } from "./map/TileMap.ts";
import { Unit } from "./entities/Unit.ts";
import { Building } from "./entities/Building.ts";
import { PLAYER_COLORS, START_GOLD, START_WOOD } from "./constants.ts";
import { dist2 } from "./util/math.ts";

export const HUMAN_PLAYER = 0;
export const AI_PLAYER = 1;

/** Transient gameplay events emitted by systems and drained for FX/sound. */
export type GameEvent =
  | { type: "projectile"; from: Vec2; to: Vec2 }
  | { type: "death"; x: number; y: number; color: string; glyph: string }
  | { type: "attack"; ranged: boolean }
  | { type: "damaged"; playerId: number; x: number; y: number }
  | { type: "build" };

export class World {
  readonly map: TileMap;
  readonly players: PlayerState[] = [];
  units: Unit[] = [];
  buildings: Building[] = [];
  /** Drained each frame by the presentation layer (effects, audio). */
  events: GameEvent[] = [];

  constructor(seed = 1337) {
    this.map = new TileMap(seed);
    for (let i = 0; i < 2; i++) {
      this.players.push({
        id: i,
        color: PLAYER_COLORS[i],
        gold: START_GOLD,
        wood: START_WOOD,
        isAI: i === AI_PLAYER,
        supplyUsed: 0,
        supplyCap: 0,
        defeated: false,
      });
    }
  }

  player(id: number): PlayerState {
    return this.players[id];
  }

  addUnit(u: Unit): Unit {
    this.units.push(u);
    return u;
  }

  addBuilding(b: Building): Building {
    this.buildings.push(b);
    this.markOccupied(b, true);
    return b;
  }

  /** Remove a building immediately, freeing its tiles (used for cancel). */
  removeBuilding(b: Building): void {
    this.markOccupied(b, false);
    const i = this.buildings.indexOf(b);
    if (i >= 0) this.buildings.splice(i, 1);
  }

  /** Flag/unflag the tiles under a building footprint as occupied. */
  markOccupied(b: Building, occupied: boolean): void {
    for (let y = b.tile.y; y < b.tile.y + b.footprint; y++) {
      for (let x = b.tile.x; x < b.tile.x + b.footprint; x++) {
        const t = this.map.at(x, y);
        if (t) t.occupied = occupied;
      }
    }
  }

  unitsOf(playerId: number): Unit[] {
    return this.units.filter((u) => u.playerId === playerId && !u.dead);
  }

  buildingsOf(playerId: number): Building[] {
    return this.buildings.filter((b) => b.playerId === playerId && !b.dead);
  }

  /** Nearest completed building that accepts `kind` deposits for a player. */
  nearestDropoff(playerId: number, from: Vec2, kind: ResourceKind): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.playerId !== playerId || b.dead) continue;
      if (b.state !== "complete" || !b.def.accepts.includes(kind)) continue;
      const d = dist2(from, b.center());
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  /** Recompute supply used/cap for every player. */
  recomputeSupply(): void {
    for (const p of this.players) {
      p.supplyUsed = 0;
      p.supplyCap = 0;
    }
    for (const u of this.units) {
      if (!u.dead) this.players[u.playerId].supplyUsed += u.def.supply;
    }
    for (const b of this.buildings) {
      if (!b.dead && b.state === "complete") {
        this.players[b.playerId].supplyCap += b.def.providesSupply;
      }
    }
  }

  /** Remove dead entities, freeing their occupied tiles. */
  cleanupDead(): void {
    for (const b of this.buildings) {
      if (b.dead) this.markOccupied(b, false);
    }
    this.units = this.units.filter((u) => !u.dead);
    this.buildings = this.buildings.filter((b) => !b.dead);
  }
}
