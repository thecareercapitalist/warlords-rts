// Loads image assets (the CC0 SBS isometric tiles + building roof sprites) before
// the game starts. Files live in /public and are referenced by absolute URL so
// Vite serves them in both dev and the production build.

export type TileKey = "grass" | "water" | "forest";
export type SheetKey = "roofs";

const TILE_URLS: Record<TileKey, string> = {
  grass: "/tiles/grass.png",
  water: "/tiles/water.png",
  forest: "/tiles/forest.png",
};

// Larger sprite sheets (sliced in code), e.g. the CC0 isometric roof set. These
// ship with a flat teal backdrop, so we chroma-key it to transparency on load.
const SHEET_URLS: Record<SheetKey, string> = {
  roofs: "/buildings-roofs.png",
};

// Generated (Pixelcut) sheets: grids on flat magenta, sliced into trimmed sprites.
// Cell order matches the generation prompt (row-major).
const UNIT_SHEET_URL = "/gen_units.png";
const UNIT_SHEET_ORDER = ["peon", "footman", "archer", "knight"];
const BUILDING_SHEET_URL = "/gen_buildings.png";
const BUILDING_SHEET_ORDER = [
  "townhall", "barracks", "farm",
  "sawmill", "temple", "forge",
  "tower", "catapult", "wall",
];
// The generator baked a text label under each building; trim the bottom band of
// each cell before measuring the sprite bbox so labels are excluded.
const BUILDING_LABEL_TRIM = 0.15;

// Enemy (orc) faction sheets + map decoration props.
const ENEMY_UNIT_SHEET_URL = "/gen_units_enemy.png";
const ENEMY_BUILDING_SHEET_URL = "/gen_buildings_enemy.png";
const PROP_SHEET_URL = "/gen_props.png";
const MOUNTAIN_SHEET_URL = "/gen_mountains.png";
const MOUNTAIN_ORDER = ["mtn0", "mtn1", "mtn2", "mtn3"]; // peak, hill, cliff, boulders
const PROP_SHEET_ORDER = [
  "pines", "deadtree", "goldmine",
  "boulders", "ruin", "logs",
  "rubble", "graves", "stump",
];

/** True for the magenta/pink chroma-key backdrop (incl. tinted soft shadows). */
function isMagenta(r: number, g: number, b: number): boolean {
  return r - g > 40 && b - g > 25;
}

/**
 * Magenta-key a generated sheet and slice its `cols`×`rows` grid into trimmed,
 * transparent sprites named by `order` (row-major). `trimBottom` drops a fraction
 * of each cell's bottom before measuring, to exclude baked-in text labels.
 */
function sliceGrid(
  img: HTMLImageElement,
  cols: number,
  rows: number,
  order: string[],
  trimBottom = 0,
): Map<string, CanvasImageSource> {
  const out = new Map<string, CanvasImageSource>();
  const W = img.width;
  const H = img.height;
  const full = document.createElement("canvas");
  full.width = W;
  full.height = H;
  const fx = full.getContext("2d");
  if (!fx) return out;
  fx.drawImage(img, 0, 0);
  let data: ImageData;
  try {
    data = fx.getImageData(0, 0, W, H);
  } catch {
    return out;
  }
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    if (isMagenta(p[i], p[i + 1], p[i + 2])) p[i + 3] = 0;
  }
  fx.putImageData(data, 0, 0);
  const cw = Math.floor(W / cols);
  const ch = Math.floor(H / rows);
  order.forEach((name, idx) => {
    const qx = (idx % cols) * cw;
    const qy = Math.floor(idx / cols) * ch;
    const yEnd = qy + Math.floor(ch * (1 - trimBottom));
    let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let y = qy; y < yEnd; y++) {
      for (let x = qx; x < qx + cw; x++) {
        if (p[(y * W + x) * 4 + 3] > 40) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (maxx < 0) return;
    const w = maxx - minx + 1;
    const h = maxy - miny + 1;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(full, minx, miny, w, h, 0, 0, w, h);
    out.set(name, c);
  });
  return out;
}

/** Knock out a sprite sheet's flat background colour (sampled from a corner). */
function chromaKey(img: HTMLImageElement): CanvasImageSource {
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const cx = cv.getContext("2d");
  if (!cx) return img;
  cx.drawImage(img, 0, 0);
  try {
    const data = cx.getImageData(0, 0, cv.width, cv.height);
    const p = data.data;
    const br = p[0];
    const bg = p[1];
    const bb = p[2];
    const tol = 42 * 42;
    for (let i = 0; i < p.length; i += 4) {
      const dr = p[i] - br;
      const dg = p[i + 1] - bg;
      const db = p[i + 2] - bb;
      if (dr * dr + dg * dg + db * db < tol) p[i + 3] = 0;
    }
    cx.putImageData(data, 0, 0);
  } catch {
    /* tainted canvas (shouldn't happen for same-origin/data URIs) — use as-is */
  }
  return cv;
}

export class Assets {
  private images = new Map<TileKey, HTMLImageElement>();
  private sheets = new Map<SheetKey, CanvasImageSource>();
  private unitSprites = new Map<string, CanvasImageSource>();
  private buildingSprites = new Map<string, CanvasImageSource>();
  private enemyUnitSprites = new Map<string, CanvasImageSource>();
  private enemyBuildingSprites = new Map<string, CanvasImageSource>();
  private propSprites = new Map<string, CanvasImageSource>();
  /** Single iso wall segment ("/" diagonal); mirror it in code for "\". */
  wallSprite: CanvasImageSource | undefined;
  /** Worker mining frames [windup, strike] for a swing animation. */
  mineFrames: CanvasImageSource[] = [];
  loaded = false;

  get(key: TileKey): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  /** A loaded, chroma-keyed sprite sheet (or undefined if it failed to load). */
  sheet(key: SheetKey): CanvasImageSource | undefined {
    return this.sheets.get(key);
  }

  /** A trimmed generated unit sprite for a kind (enemy = orc variant). */
  unitSprite(kind: string, enemy = false): CanvasImageSource | undefined {
    return (enemy ? this.enemyUnitSprites : this.unitSprites).get(kind);
  }

  /** A trimmed generated building sprite for a kind (enemy = orc variant). */
  buildingSprite(kind: string, enemy = false): CanvasImageSource | undefined {
    return (enemy ? this.enemyBuildingSprites : this.buildingSprites).get(kind);
  }

  /** A trimmed generated map-decoration prop sprite (or undefined). */
  propSprite(name: string): CanvasImageSource | undefined {
    return this.propSprites.get(name);
  }

  async loadAll(): Promise<void> {
    // Offline single-file builds inject base64 images here so the game needs no
    // server; otherwise we fetch the PNGs by URL as usual.
    const inlined = (globalThis as { __TILES?: Record<string, string> }).__TILES;
    const load = (url: string): Promise<HTMLImageElement | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // renderer falls back if it's missing
        img.src = url;
      });

    const jobs: Promise<void>[] = [];
    for (const [key, url] of Object.entries(TILE_URLS) as [TileKey, string][]) {
      jobs.push(load(inlined?.[key] ?? url).then((img) => { if (img) this.images.set(key, img); }));
    }
    for (const [key, url] of Object.entries(SHEET_URLS) as [SheetKey, string][]) {
      jobs.push(load(inlined?.[key] ?? url).then((img) => { if (img) this.sheets.set(key, chromaKey(img)); }));
    }
    const inl = inlined as Record<string, string> | undefined;
    jobs.push(
      load(inl?.units ?? UNIT_SHEET_URL).then((img) => {
        if (!img) return;
        for (const [k, v] of sliceGrid(img, 2, 2, UNIT_SHEET_ORDER)) this.unitSprites.set(k, v);
      }),
    );
    jobs.push(
      load(inl?.buildings ?? BUILDING_SHEET_URL).then((img) => {
        if (!img) return;
        const sliced = sliceGrid(img, 3, 3, BUILDING_SHEET_ORDER, BUILDING_LABEL_TRIM);
        for (const [name, spr] of sliced) {
          if (name === "catapult") this.unitSprites.set(name, spr); // mobile unit
          else this.buildingSprites.set(name, spr);
        }
      }),
    );
    jobs.push(
      load(inl?.unitsEnemy ?? ENEMY_UNIT_SHEET_URL).then((img) => {
        if (!img) return;
        for (const [k, v] of sliceGrid(img, 2, 2, UNIT_SHEET_ORDER)) this.enemyUnitSprites.set(k, v);
      }),
    );
    jobs.push(
      load(inl?.buildingsEnemy ?? ENEMY_BUILDING_SHEET_URL).then((img) => {
        if (!img) return;
        const sliced = sliceGrid(img, 3, 3, BUILDING_SHEET_ORDER, BUILDING_LABEL_TRIM);
        for (const [name, spr] of sliced) {
          if (name === "catapult") this.enemyUnitSprites.set(name, spr);
          else this.enemyBuildingSprites.set(name, spr);
        }
      }),
    );
    jobs.push(
      load(inl?.props ?? PROP_SHEET_URL).then((img) => {
        if (!img) return;
        for (const [k, v] of sliceGrid(img, 3, 3, PROP_SHEET_ORDER)) this.propSprites.set(k, v);
      }),
    );
    jobs.push(
      load(inl?.mountains ?? MOUNTAIN_SHEET_URL).then((img) => {
        if (!img) return;
        for (const [k, v] of sliceGrid(img, 2, 2, MOUNTAIN_ORDER)) this.propSprites.set(k, v);
      }),
    );
    // Mage unit + Mage's Enclave building (Gemini, single-figure sheets). Shared by
    // both factions for now (team identity stays on the ring/banner).
    jobs.push(
      load(inl?.mage ?? "/gen_mage.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 1, 1, ["mage"]).get("mage");
        if (m) { this.unitSprites.set("mage", m); this.enemyUnitSprites.set("mage", m); }
      }),
    );
    jobs.push(
      load(inl?.enclave ?? "/gen_enclave.jpg").then((img) => {
        if (!img) return;
        const e = sliceGrid(img, 1, 1, ["enclave"]).get("enclave");
        if (e) { this.buildingSprites.set("enclave", e); this.enemyBuildingSprites.set("enclave", e); }
      }),
    );
    jobs.push(
      load(inl?.wall ?? "/gen_wall.jpg").then((img) => {
        if (!img) return;
        this.wallSprite = sliceGrid(img, 1, 1, ["wall"]).get("wall");
      }),
    );
    jobs.push(
      load(inl?.dragon ?? "/gen_dragon.jpg").then((img) => {
        if (!img) return;
        const dr = sliceGrid(img, 1, 1, ["dragon"]).get("dragon");
        if (dr) { this.unitSprites.set("dragon", dr); this.enemyUnitSprites.set("dragon", dr); }
      }),
    );
    jobs.push(
      load(inl?.mine ?? "/gen_mine.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 2, 1, ["mine0", "mine1"]);
        const a = m.get("mine0");
        const bb = m.get("mine1");
        if (a && bb) this.mineFrames = [a, bb];
      }),
    );
    await Promise.all(jobs);
    this.loaded = true;
  }
}
