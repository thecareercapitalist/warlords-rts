import type { Vec2 } from "../types.ts";
import type { TileMap } from "../map/TileMap.ts";

// A* over the tile grid with 8-directional movement. Diagonals are only allowed
// when both orthogonal neighbours are open, so units never cut corners through
// blocked tiles. A binary-heap open list keeps it fast enough for many units.

interface Node {
  i: number; // tile index
  g: number;
  f: number;
}

class MinHeap {
  private items: Node[] = [];
  get size(): number {
    return this.items.length;
  }
  push(n: Node): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && a[l].f < a[s].f) s = l;
        if (r < n && a[r].f < a[s].f) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;

/**
 * Find a path of tile coordinates from (sx,sy) to (tx,ty).
 * `isBlocked(x,y)` lets callers treat the goal's own footprint as passable.
 * Returns an empty array if no path exists.
 */
export function findPath(
  map: TileMap,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  isBlocked?: (x: number, y: number) => boolean,
): Vec2[] {
  if (sx === tx && sy === ty) return [];
  const blocked = isBlocked ?? ((x, y) => !map.isWalkable(x, y));

  const w = map.w;
  const n = w * map.h;
  const start = sy * w + sx;
  const goal = ty * w + tx;

  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const heuristic = (i: number): number => {
    const x = i % w;
    const y = (i / w) | 0;
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    // Octile distance.
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };

  gScore[start] = 0;
  const open = new MinHeap();
  open.push({ i: start, g: 0, f: heuristic(start) });

  // Cap expansion so a hopeless search can't stall the frame.
  let expansions = 0;
  const maxExpansions = n;

  while (open.size > 0 && expansions++ < maxExpansions) {
    const cur = open.pop();
    const ci = cur.i;
    if (ci === goal) return reconstruct(cameFrom, goal, w);
    if (closed[ci]) continue;
    closed[ci] = 1;

    const cx = ci % w;
    const cy = (ci / w) | 0;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.h) continue;
        const ni = ny * w + nx;
        if (closed[ni]) continue;

        const isGoal = ni === goal;
        if (!isGoal && blocked(nx, ny)) continue;

        if (dx !== 0 && dy !== 0) {
          // No corner cutting: both orthogonal neighbours must be open.
          if (blocked(cx + dx, cy) || blocked(cx, cy + dy)) continue;
        }

        const step = dx !== 0 && dy !== 0 ? SQRT2 : 1;
        const tentative = gScore[ci] + step;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          cameFrom[ni] = ci;
          open.push({ i: ni, g: tentative, f: tentative + heuristic(ni) });
        }
      }
    }
  }
  return [];
}

function reconstruct(cameFrom: Int32Array, goal: number, w: number): Vec2[] {
  const path: Vec2[] = [];
  let cur = goal;
  while (cur !== -1) {
    path.push({ x: cur % w, y: (cur / w) | 0 });
    cur = cameFrom[cur];
  }
  path.reverse();
  path.shift(); // drop the start tile; caller is already there
  return path;
}
