// Shared types and enums used across the game systems.

export interface Vec2 {
  x: number;
  y: number;
}

export type TerrainType = "grass" | "water" | "forest" | "rock" | "goldmine";

export type ResourceKind = "gold" | "wood";

export type UnitState =
  | "idle"
  | "moving"
  | "attackMoving"
  | "gathering" // actively mining/chopping at a node
  | "movingToResource" // walking to the resource node
  | "returning" // carrying resources back to a drop-off
  | "attacking"
  | "building" // a worker constructing a building
  | "dead";

export type BuildingState = "site" | "constructing" | "complete";

export type UnitKind = "peon" | "footman" | "grunt" | "archer" | "knight" | "catapult";

export type BuildingKind =
  | "townhall"
  | "barracks"
  | "farm"
  | "sawmill"
  | "temple"
  | "tower"
  | "forge"
  | "wall";

export interface PlayerState {
  id: number;
  color: string;
  gold: number;
  wood: number;
  isAI: boolean;
  supplyUsed: number;
  supplyCap: number;
  defeated: boolean;
}
