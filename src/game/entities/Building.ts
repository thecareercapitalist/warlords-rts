import type { BuildingKind, BuildingState, UnitKind, Vec2 } from "../types.ts";
import { BUILDING_DEFS, type BuildingDef } from "./defs.ts";
import { TILE } from "../constants.ts";

let NEXT_ID = 100000; // offset from unit ids for easy debugging

export class Building {
  readonly id = NEXT_ID++;
  readonly etype = "building" as const;
  readonly def: BuildingDef;
  readonly kind: BuildingKind;
  readonly playerId: number;
  readonly tile: Vec2; // top-left tile of the footprint

  hp: number;
  state: BuildingState;
  selected = false;

  /** 0..1 while constructing. */
  construction = 0;

  /** Queue of unit kinds to produce; index 0 is in progress. */
  queue: UnitKind[] = [];
  productionTimer = 0; // seconds remaining on queue[0]

  /** Rally point in pixels for freshly produced/owned units. */
  rally: Vec2 | null = null;

  /** Presentation-only: white flash timer when damaged (seconds). */
  hitFlash = 0;

  /** Defensive buildings only: seconds until the next shot. */
  attackCooldown = 0;

  constructor(kind: BuildingKind, playerId: number, tile: Vec2, prebuilt = false) {
    this.kind = kind;
    this.def = BUILDING_DEFS[kind];
    this.playerId = playerId;
    this.tile = { ...tile };
    if (prebuilt) {
      this.state = "complete";
      this.construction = 1;
      this.hp = this.def.maxHp;
    } else {
      this.state = "site";
      this.construction = 0;
      this.hp = Math.max(1, Math.floor(this.def.maxHp * 0.1));
    }
  }

  get footprint(): number {
    return this.def.footprint;
  }

  get radius(): number {
    return (this.footprint * TILE) / 2;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  center(): Vec2 {
    return {
      x: this.tile.x * TILE + (this.footprint * TILE) / 2,
      y: this.tile.y * TILE + (this.footprint * TILE) / 2,
    };
  }

  /** Does this building cover the given tile? */
  coversTile(x: number, y: number): boolean {
    return (
      x >= this.tile.x &&
      x < this.tile.x + this.footprint &&
      y >= this.tile.y &&
      y < this.tile.y + this.footprint
    );
  }

  /** A walkable tile adjacent to the footprint, for workers to stand on. */
  adjacentTile(): Vec2 {
    return { x: this.tile.x - 1, y: this.tile.y + this.footprint };
  }
}
