import type { UnitKind, BuildingKind, ResourceKind } from "../types.ts";

export interface UnitDef {
  kind: UnitKind;
  label: string;
  glyph: string; // single-char programmer-art marker
  maxHp: number;
  speed: number; // px/sec
  radius: number; // px, for separation + selection
  damage: number;
  armor?: number; // flat damage reduction per hit (min 1 damage always lands)
  attackRange: number; // tiles (1 = melee-ish)
  attackCooldown: number; // seconds between hits
  visionRadius: number; // tiles
  supply: number;
  costGold: number;
  costWood: number;
  buildTime: number; // seconds to train
  canGather: boolean;
  canBuild: boolean;
  /** Tech gate: a completed building of this kind is required to train. */
  requiresBuilding?: BuildingKind;
  /** Damage multiplier vs buildings (siege weapons); 1 if omitted. */
  siegeMult?: number;
  /** Splash radius in tiles: hits enemy units near the impact (siege). */
  splash?: number;
}

export interface BuildingDef {
  kind: BuildingKind;
  label: string;
  glyph: string;
  maxHp: number;
  footprint: number; // NxN tiles
  visionRadius: number;
  costGold: number;
  costWood: number;
  buildTime: number; // seconds to construct
  providesSupply: number;
  /** Resource kinds workers may deposit here (empty = not a drop-off). */
  accepts: ResourceKind[];
  // What this building can produce, by faction-neutral kind.
  produces: UnitKind[];
  // Defensive buildings (towers) fire at enemies in range.
  damage?: number;
  attackRange?: number; // tiles
  attackCooldown?: number; // seconds between shots
  /** Heals friendly units within this radius (tiles); the Temple's aura. */
  healRadius?: number;
}

// Two mirror factions ("humans"/"orcs" in spirit) share stats; only the worker
// and melee unit glyphs differ. Keeping them faction-neutral here means systems
// never branch on faction.
export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  peon: {
    kind: "peon",
    label: "Worker",
    glyph: "w",
    maxHp: 40,
    speed: 95,
    radius: 9,
    damage: 3,
    attackRange: 1,
    attackCooldown: 1.2,
    visionRadius: 4,
    supply: 1,
    costGold: 50,
    costWood: 0,
    buildTime: 12,
    canGather: true,
    canBuild: true,
  },
  footman: {
    kind: "footman",
    label: "Footman",
    glyph: "F",
    maxHp: 60,
    speed: 85,
    radius: 10,
    damage: 8,
    attackRange: 1,
    attackCooldown: 1.1,
    visionRadius: 4,
    supply: 1,
    costGold: 90,
    costWood: 0,
    buildTime: 16,
    canGather: false,
    canBuild: false,
  },
  grunt: {
    kind: "grunt",
    label: "Grunt",
    glyph: "G",
    maxHp: 70,
    speed: 85,
    radius: 10,
    damage: 9,
    attackRange: 1,
    attackCooldown: 1.2,
    visionRadius: 4,
    supply: 1,
    costGold: 90,
    costWood: 0,
    buildTime: 16,
    canGather: false,
    canBuild: false,
  },
  archer: {
    kind: "archer",
    label: "Archer",
    glyph: "A",
    maxHp: 45,
    speed: 90,
    radius: 9,
    damage: 6,
    attackRange: 4,
    attackCooldown: 1.4,
    visionRadius: 6,
    supply: 1,
    costGold: 80,
    costWood: 30,
    buildTime: 18,
    canGather: false,
    canBuild: false,
  },
  knight: {
    kind: "knight",
    label: "Knight",
    glyph: "K",
    maxHp: 110,
    speed: 95,
    radius: 11,
    damage: 16,
    armor: 2, // heavily armored — shrugs off a chunk of every blow
    attackRange: 1,
    attackCooldown: 1.1,
    visionRadius: 4,
    supply: 2,
    costGold: 140,
    costWood: 0,
    buildTime: 26,
    canGather: false,
    canBuild: false,
    requiresBuilding: "temple",
  },
  catapult: {
    kind: "catapult",
    label: "Catapult",
    glyph: "C",
    maxHp: 70,
    speed: 55, // slow and ponderous
    radius: 12,
    damage: 12, // modest vs units...
    siegeMult: 4, // ...devastating vs buildings
    splash: 1.5, // area damage to enemy units clustered near the impact
    attackRange: 6, // long siege reach
    attackCooldown: 2.4,
    visionRadius: 5,
    supply: 3,
    costGold: 160,
    costWood: 60,
    buildTime: 32,
    canGather: false,
    canBuild: false,
    requiresBuilding: "forge", // a Forge unlocks siege engineering
  },
};

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  townhall: {
    kind: "townhall",
    label: "Town Hall",
    glyph: "TH",
    maxHp: 1200,
    footprint: 3,
    visionRadius: 6,
    costGold: 400,
    costWood: 0,
    buildTime: 60,
    providesSupply: 5,
    accepts: ["gold", "wood"],
    produces: ["peon"],
  },
  barracks: {
    kind: "barracks",
    label: "Barracks",
    glyph: "BK",
    maxHp: 800,
    footprint: 3,
    visionRadius: 4,
    costGold: 200,
    costWood: 100,
    buildTime: 40,
    providesSupply: 0,
    accepts: [],
    // Knight gated behind a Temple, Catapult behind a Forge (UnitDef.requiresBuilding).
    produces: ["footman", "archer", "knight", "catapult"],
  },
  farm: {
    kind: "farm",
    label: "Farm",
    glyph: "FM",
    maxHp: 400,
    footprint: 2,
    visionRadius: 3,
    costGold: 80,
    costWood: 20,
    buildTime: 20,
    providesSupply: 4,
    accepts: [],
    produces: [],
  },
  sawmill: {
    kind: "sawmill",
    label: "Sawmill",
    glyph: "SM",
    maxHp: 500,
    footprint: 3,
    visionRadius: 3,
    costGold: 120,
    costWood: 20,
    buildTime: 35,
    providesSupply: 0,
    accepts: ["wood"], // build it near a forest to shorten wood trips
    produces: [],
  },
  temple: {
    kind: "temple",
    label: "Temple",
    glyph: "TP",
    maxHp: 600,
    footprint: 3,
    visionRadius: 3,
    costGold: 200,
    costWood: 120,
    buildTime: 50,
    providesSupply: 0,
    accepts: [],
    produces: [], // a tech building; unlocks Knights at the Barracks
    healRadius: 5, // mends friendly units standing within this many tiles
  },
  forge: {
    kind: "forge",
    label: "Forge",
    glyph: "FG",
    maxHp: 550,
    footprint: 2,
    visionRadius: 3,
    costGold: 150,
    costWood: 60,
    buildTime: 40,
    providesSupply: 0,
    accepts: [],
    produces: [], // tech building: while standing, buffs your units' attack
  },
  tower: {
    kind: "tower",
    label: "Guard Tower",
    glyph: "GT",
    maxHp: 450,
    footprint: 1,
    visionRadius: 7,
    costGold: 120,
    costWood: 40,
    buildTime: 25,
    providesSupply: 0,
    accepts: [],
    produces: [],
    // Defensive: fires arrows at the nearest enemy in range.
    damage: 12,
    attackRange: 6,
    attackCooldown: 1.1,
  },
  wall: {
    kind: "wall",
    label: "Wall",
    glyph: "▦",
    maxHp: 350, // sturdy, but siege (Catapult ×4) chews through it
    footprint: 1,
    visionRadius: 1,
    costGold: 20,
    costWood: 10,
    buildTime: 8,
    providesSupply: 0,
    accepts: [],
    produces: [], // purely a barrier — blocks movement at a chokepoint
  },
};
