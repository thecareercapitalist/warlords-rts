// Loads image assets (the CC0 SBS isometric tiles) before the game starts.
// Tiles live in /public/tiles and are referenced by absolute URL so Vite serves
// them in both dev and the production build.

export type TileKey = "grass" | "water" | "forest";

const TILE_URLS: Record<TileKey, string> = {
  grass: "/tiles/grass.png",
  water: "/tiles/water.png",
  forest: "/tiles/forest.png",
};

export class Assets {
  private images = new Map<TileKey, HTMLImageElement>();
  loaded = false;

  get(key: TileKey): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  async loadAll(): Promise<void> {
    const entries = Object.entries(TILE_URLS) as [TileKey, string][];
    await Promise.all(
      entries.map(
        ([key, url]) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(key, img);
              resolve();
            };
            // On error, resolve anyway — the renderer falls back to flat colors.
            img.onerror = () => resolve();
            img.src = url;
          }),
      ),
    );
    this.loaded = true;
  }
}
