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
  /** Square corner bastion that caps wall junctions. */
  bastionSprite: CanvasImageSource | undefined;
  /** Ornate gothic 9-slice frame (hollow centre) for HUD/menu panels. */
  frameSprite: CanvasImageSource | undefined;
  /** Worker mining frames [windup, strike] for a swing animation. */
  mineFrames: CanvasImageSource[] = [];
  /** Worker chopping (sideways axe) frames [windup, mid, follow]. */
  chopFrames: CanvasImageSource[] = [];
  /** Worker building (kneeling vertical hammer) frames [raise, mid, impact]. */
  buildFrames: CanvasImageSource[] = [];
  /** Human footman attack frames [windup, mid, strike]. */
  footmanAtkFrames: CanvasImageSource[] = [];
  /** Orc grunt (enemy melee) attack frames [windup, mid, strike]. */
  gruntAtkFrames: CanvasImageSource[] = [];
  /** Flying wing-flap cycles [high, level, low] per faction (dragon vs griffin). */
  dragonFlapFrames: CanvasImageSource[] = [];
  griffinFlapFrames: CanvasImageSource[] = [];
  /** Caster cast cycles [gather, charge, release] per faction (mage vs warlock). */
  mageCastFrames: CanvasImageSource[] = [];
  orcCasterCastFrames: CanvasImageSource[] = [];
  /** Mounted gallop cycles (4 frames) per faction (knight horse vs orc wolf). */
  knightGallopFrames: CanvasImageSource[] = [];
  wolfriderGallopFrames: CanvasImageSource[] = [];
  /** Archer draw-and-loose frames [nock, draw, loose] per faction. */
  archerShotFrames: CanvasImageSource[] = [];
  orcArcherShotFrames: CanvasImageSource[] = [];
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
      load(inl?.bastion ?? "/gen_bastion.jpg").then((img) => {
        if (!img) return;
        this.bastionSprite = sliceGrid(img, 1, 1, ["bastion"]).get("bastion");
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
      load(inl?.frame ?? "/gen_frame.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 1, 1, ["frame"]);
        this.frameSprite = m.get("frame");
      }),
    );
    jobs.push(
      load(inl?.mine ?? "/gen_mine.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 4, 1, ["mine0", "mine1", "mine2", "mine3"]);
        const fr = [m.get("mine0"), m.get("mine1"), m.get("mine2"), m.get("mine3")];
        if (fr.every(Boolean)) this.mineFrames = fr as CanvasImageSource[];
      }),
    );
    // Worker chopping (axe) + building (hammer) 3-frame swings.
    jobs.push(
      load(inl?.peonChop ?? "/gen_peon_chop.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["c0", "c1", "c2"]);
        const fr = [m.get("c0"), m.get("c1"), m.get("c2")];
        if (fr.every(Boolean)) this.chopFrames = fr as CanvasImageSource[];
      }),
    );
    jobs.push(
      load(inl?.peonBuild ?? "/gen_peon_build.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["b0", "b1", "b2"]);
        const fr = [m.get("b0"), m.get("b1"), m.get("b2")];
        if (fr.every(Boolean)) this.buildFrames = fr as CanvasImageSource[];
      }),
    );
    // Human footman 3-frame attack swing.
    jobs.push(
      load(inl?.footmanAtk ?? "/gen_footman_atk.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["a0", "a1", "a2"]);
        const fr = [m.get("a0"), m.get("a1"), m.get("a2")];
        if (fr.every(Boolean)) this.footmanAtkFrames = fr as CanvasImageSource[];
      }),
    );
    // Archer draw-and-loose frames: human archer + orc hunter.
    jobs.push(
      load(inl?.archerShot ?? "/gen_archer_shot.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["a0", "a1", "a2"]);
        const fr = [m.get("a0"), m.get("a1"), m.get("a2")];
        if (fr.every(Boolean)) this.archerShotFrames = fr as CanvasImageSource[];
      }),
    );
    jobs.push(
      load(inl?.orcArcherShot ?? "/gen_orcarcher_shot.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["o0", "o1", "o2"]);
        const fr = [m.get("o0"), m.get("o1"), m.get("o2")];
        if (fr.every(Boolean)) this.orcArcherShotFrames = fr as CanvasImageSource[];
      }),
    );
    // Mounted gallop cycles: human knight (horse) + orc wolf-rider.
    jobs.push(
      load(inl?.knightGallop ?? "/gen_knight_gallop.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 4, 1, ["k0", "k1", "k2", "k3"]);
        const fr = [m.get("k0"), m.get("k1"), m.get("k2"), m.get("k3")];
        if (fr.every(Boolean)) this.knightGallopFrames = fr as CanvasImageSource[];
      }),
    );
    jobs.push(
      load(inl?.wolfriderGallop ?? "/gen_wolfrider_gallop.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 4, 1, ["w0", "w1", "w2", "w3"]);
        const fr = [m.get("w0"), m.get("w1"), m.get("w2"), m.get("w3")];
        if (fr.every(Boolean)) this.wolfriderGallopFrames = fr as CanvasImageSource[];
      }),
    );
    // Caster cast cycles: human mage + orc warlock.
    jobs.push(
      load(inl?.mageCast ?? "/gen_mage_cast.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["m0", "m1", "m2"]);
        const fr = [m.get("m0"), m.get("m1"), m.get("m2")];
        if (fr.every(Boolean)) this.mageCastFrames = fr as CanvasImageSource[];
      }),
    );
    jobs.push(
      load(inl?.orcCasterCast ?? "/gen_orccaster_cast.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["o0", "o1", "o2"]);
        const fr = [m.get("o0"), m.get("o1"), m.get("o2")];
        if (fr.every(Boolean)) this.orcCasterCastFrames = fr as CanvasImageSource[];
      }),
    );
    // Flying wing-flap cycles: orc dragon + human griffin.
    jobs.push(
      load(inl?.dragonFly ?? "/gen_dragon_fly.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 5, 1, ["d0", "d1", "d2", "d3", "d4"]);
        const fr = [m.get("d0"), m.get("d1"), m.get("d2"), m.get("d3"), m.get("d4")];
        if (fr.every(Boolean)) this.dragonFlapFrames = fr as CanvasImageSource[];
      }),
    );
    jobs.push(
      load(inl?.griffinFly ?? "/gen_griffin_fly.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 5, 1, ["f0", "f1", "f2", "f3", "f4"]);
        const fr = [m.get("f0"), m.get("f1"), m.get("f2"), m.get("f3"), m.get("f4")];
        if (fr.every(Boolean)) this.griffinFlapFrames = fr as CanvasImageSource[];
      }),
    );
    // Orc grunt (enemy melee) 3-frame attack swing.
    jobs.push(
      load(inl?.gruntAtk ?? "/gen_grunt_atk.jpg").then((img) => {
        if (!img) return;
        const m = sliceGrid(img, 3, 1, ["g0", "g1", "g2"]);
        const fr = [m.get("g0"), m.get("g1"), m.get("g2")];
        if (fr.every(Boolean)) this.gruntAtkFrames = fr as CanvasImageSource[];
      }),
    );
    // Faction knight variants: human = mounted knight, orc = wolf rider.
    jobs.push(
      load(inl?.knight ?? "/gen_knight.jpg").then((img) => {
        if (!img) return;
        const k = sliceGrid(img, 1, 1, ["knight"]).get("knight");
        if (k) this.unitSprites.set("knight", k);
      }),
    );
    jobs.push(
      load(inl?.wolfrider ?? "/gen_wolfrider.jpg").then((img) => {
        if (!img) return;
        const w = sliceGrid(img, 1, 1, ["wolfrider"]).get("wolfrider");
        if (w) this.enemyUnitSprites.set("knight", w);
      }),
    );
    // Orc caster: the enemy "mage" variant (same stats, different vibe).
    jobs.push(
      load(inl?.orccaster ?? "/gen_orccaster.jpg").then((img) => {
        if (!img) return;
        const oc = sliceGrid(img, 1, 1, ["orccaster"]).get("orccaster");
        if (oc) this.enemyUnitSprites.set("mage", oc);
      }),
    );
    // Human flying unit is a griffin rider; orcs keep the dragon (enemy sprite).
    jobs.push(
      load(inl?.griffin ?? "/gen_griffin.jpg").then((img) => {
        if (!img) return;
        const gr = sliceGrid(img, 1, 1, ["griffin"]).get("griffin");
        if (gr) this.unitSprites.set("dragon", gr);
      }),
    );
    await Promise.all(jobs);
    this.loaded = true;
  }
}
