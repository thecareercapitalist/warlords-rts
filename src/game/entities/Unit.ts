import type { ResourceKind, UnitKind, UnitState, Vec2 } from "../types.ts";
import { UNIT_DEFS, type UnitDef } from "./defs.ts";
import { tileCenter, toTile } from "../util/math.ts";
import type { Building } from "./Building.ts";

let NEXT_ID = 1;

export type Targetable = Unit | Building;

export class Unit {
  readonly id = NEXT_ID++;
  readonly etype = "unit" as const;
  readonly def: UnitDef;
  readonly kind: UnitKind;
  readonly playerId: number;

  pos: Vec2;
  hp: number;
  state: UnitState = "idle";
  selected = false;

  /** Remaining tile waypoints to walk through. */
  path: Vec2[] = [];
  /** Final pixel destination once the path is consumed. */
  finalTarget: Vec2 | null = null;
  waypoints: Vec2[] = []; // queued move destinations (shift-click), visited in order
  patrolA: Vec2 | null = null; // patrol endpoints; non-null = patrolling between them
  patrolB: Vec2 | null = null;

  attackTarget: Targetable | null = null;
  /** When true, the unit engages enemies encountered en route. */
  attackMove = false;
  /** Saved destination so attack-move resumes after a kill. */
  attackMoveDest: Vec2 | null = null;
  /** Throttles path recomputation while chasing a moving target. */
  repathTimer = 0;

  // Gathering
  carrying: { kind: ResourceKind; amount: number } | null = null;
  resourceTile: Vec2 | null = null; // tile being harvested
  dropoff: Building | null = null;
  gatherTimer = 0;

  // Construction (workers)
  buildTarget: Building | null = null;

  attackCooldown = 0;

  kills = 0; // enemy units/buildings slain — drives veterancy rank + damage bonus
  fleeing = false; // AI worker retreating from a raid (skips economy re-tasking)
  holdGround = false; // stance: fire at in-range foes but never chase/advance
  retaliateT = 0; // seconds left during which the unit fights back even while moving (set when hit)
  moveGraceT = 0; // grace after a fresh move order during which it ignores retaliation (lets you pull clear)

  // Presentation-only animation timers (seconds remaining).
  hitFlash = 0; // white flash when damaged
  healFx = 0; // green heal glow while mending near a Temple
  attackAnim = 0; // melee lunge toward `aim`
  aim: Vec2 | null = null; // last attack target centre, for the lunge direction
  faceLeft = false; // sprite mirrored to face screen-left (purely presentational)

  // Spellcasting (mages). mana regenerates; castCd gates casts; autocast names a
  // spell to fire automatically while mana lasts.
  mana = 0;
  castCd = 0;
  autocast: string | null = null;
  slowT = 0; // seconds of "chilled" movement-slow remaining
  chillFx = 0; // blue frost tint timer (presentation)

  constructor(kind: UnitKind, playerId: number, pos: Vec2) {
    this.kind = kind;
    this.def = UNIT_DEFS[kind];
    this.playerId = playerId;
    this.pos = { ...pos };
    this.hp = this.def.maxHp;
    this.mana = this.def.maxMana ?? 0;
  }

  get radius(): number {
    return this.def.radius;
  }

  get dead(): boolean {
    return this.hp <= 0 || this.state === "dead";
  }

  center(): Vec2 {
    return this.pos;
  }

  tile(): Vec2 {
    return toTile(this.pos.x, this.pos.y);
  }

  /** Stop all current orders and go idle. */
  stop(): void {
    this.path = [];
    this.finalTarget = null;
    this.waypoints = [];
    this.patrolA = null;
    this.patrolB = null;
    this.attackTarget = null;
    this.attackMove = false;
    this.resourceTile = null;
    this.buildTarget = null;
    this.state = "idle";
  }

  /** Center pixel of the tile the unit currently occupies. */
  tileCenterPx(): Vec2 {
    const t = this.tile();
    return tileCenter(t.x, t.y);
  }
}

/** Veterancy rank (0–2) earned from kills: 2+ → rank 1, 5+ → rank 2. */
export function veterancyRank(kills: number): number {
  return kills >= 5 ? 2 : kills >= 2 ? 1 : 0;
}

/** Damage multiplier from veterancy: +15% per rank. */
export function veterancyMult(kills: number): number {
  return 1 + veterancyRank(kills) * 0.15;
}
