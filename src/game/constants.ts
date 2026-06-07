// Core tunable constants for the game. Keeping these in one place makes balance
// passes easy and keeps magic numbers out of the systems.

export const TILE = 32; // pixel size of one map tile

export const MAP_W = 64; // tiles
export const MAP_H = 64; // tiles

// Camera
export const CAMERA_SPEED = 700; // px/sec keyboard/edge scroll
export const EDGE_SCROLL_MARGIN = 24; // px from window edge that triggers scroll

// Resource carrying
export const PEON_CARRY_CAPACITY = 8; // gold or wood carried per trip
export const GATHER_TIME = 1.4; // seconds to mine/chop one load
export const RETURN_DROPOFF_RANGE = 1.6; // tiles

// Starting resources
export const START_GOLD = 600;
export const START_WOOD = 300;

// Player colors (programmer art — no third-party assets)
export const PLAYER_COLORS = ["#3a78ff", "#e23b3b", "#37c837", "#d8c020"];

// Terrain palette
export const COLORS = {
  grass: "#3f6b35",
  grassAlt: "#446f38",
  water: "#2a4d80",
  forest: "#234d22",
  forestStump: "#5a4326",
  rock: "#5b5b5b",
  goldmine: "#caa12a",
  fog: "#000000",
  fogExplored: "rgba(0,0,0,0.45)",
  selection: "#9affb0",
  rally: "#ffe066",
  hpBack: "#3a0d0d",
  hpFront: "#36c83f",
  hpEnemy: "#e23b3b",
  buildOk: "rgba(60,200,90,0.35)",
  buildBad: "rgba(220,60,60,0.35)",
} as const;

// Resource node yields
export const GOLDMINE_AMOUNT = 25000;
export const FOREST_TILE_WOOD = 400;

export const FPS_CAP = 60;
