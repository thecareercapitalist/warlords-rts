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
  loaded = false;

  get(key: TileKey): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  /** A loaded, chroma-keyed sprite sheet (or undefined if it failed to load). */
  sheet(key: SheetKey): CanvasImageSource | undefined {
    return this.sheets.get(key);
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
    await Promise.all(jobs);
    this.loaded = true;
  }
}
