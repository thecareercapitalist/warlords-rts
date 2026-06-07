// Builds a single self-contained `Warlords.html` at the repo root that runs by
// double-click (file://) with no server: the bundled JS is inlined as an inline
// ES module (no CORS fetch) and the terrain tiles are inlined as base64 data
// URIs (picked up by Assets.loadAll via window.__TILES). Run AFTER `vite build`.
//
//   node tools/make-offline.mjs
//
// No dependencies beyond Node's stdlib.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

// 1. Locate the single bundled JS chunk Vite emitted.
const assetsDir = resolve(dist, "assets");
const jsName = readdirSync(assetsDir).find((f) => f.endsWith(".js"));
if (!jsName) throw new Error("No bundled .js found in dist/assets — run `npm run build` first.");
let js = readFileSync(resolve(assetsDir, jsName), "utf8");
// Guard: keep any literal </script> inside strings from closing our inline tag.
js = js.replace(/<\/script/gi, "<\\/script");

// 2. Inline the terrain tiles as base64 data URIs.
// Sniff PNG vs JPEG by magic bytes so data URIs declare the right mime (some of
// our "*.png" tiles are actually JPEG bytes from the generator).
const mimeOf = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : "image/png");
const dataUri = (p) => {
  const buf = readFileSync(p);
  return `data:${mimeOf(buf)};base64,${buf.toString("base64")}`;
};
const tiles = ["grass", "water", "forest"];
const tileData = {};
for (const t of tiles) {
  tileData[t] = dataUri(resolve(root, "public", "tiles", `${t}.png`));
}
// Building roof sprite sheet (Assets reads window.__TILES.roofs when present).
tileData.roofs = `data:image/png;base64,${readFileSync(resolve(root, "public", "buildings-roofs.png")).toString("base64")}`;
// Generated unit sprite sheet (Assets reads window.__TILES.units when present).
tileData.units = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_units.png")).toString("base64")}`;
// Generated building sprite sheet (Assets reads window.__TILES.buildings).
tileData.buildings = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_buildings.png")).toString("base64")}`;
// Enemy (orc) faction sheets + map-decoration props.
tileData.unitsEnemy = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_units_enemy.png")).toString("base64")}`;
tileData.buildingsEnemy = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_buildings_enemy.png")).toString("base64")}`;
tileData.props = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_props.png")).toString("base64")}`;
tileData.mountains = `data:image/png;base64,${readFileSync(resolve(root, "public", "gen_mountains.png")).toString("base64")}`;
// Mage unit + Mage's Enclave (Gemini, JPEG).
tileData.mage = `data:image/jpeg;base64,${readFileSync(resolve(root, "public", "gen_mage.jpg")).toString("base64")}`;
tileData.enclave = `data:image/jpeg;base64,${readFileSync(resolve(root, "public", "gen_enclave.jpg")).toString("base64")}`;
tileData.wall = dataUri(resolve(root, "public", "gen_wall.jpg"));
tileData.bastion = dataUri(resolve(root, "public", "gen_bastion.jpg"));
tileData.dragon = dataUri(resolve(root, "public", "gen_dragon.jpg"));
tileData.mine = dataUri(resolve(root, "public", "gen_mine.jpg"));

// 3. Reuse the built <head> styles/markup, swap the external script for inline.
const builtHtml = readFileSync(resolve(dist, "index.html"), "utf8");
const head = builtHtml.slice(0, builtHtml.indexOf("<body>"));
const headNoScript = head.replace(/<script[^>]*src=[^>]*><\/script>/g, "");

const out = `${headNoScript}<body>
    <canvas id="game"></canvas>
    <div id="loading">Loading Warlords…</div>
    <script>window.__TILES = ${JSON.stringify(tileData)};</script>
    <script type="module">
${js}
    </script>
  </body>
</html>`;

const outPath = resolve(root, "Warlords.html");
writeFileSync(outPath, out, "utf8");
const mb = (Buffer.byteLength(out) / 1024 / 1024).toFixed(1);
console.log(`Wrote ${outPath} (${mb} MB) — double-click to play offline.`);
