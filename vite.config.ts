import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the built bundle works from any subpath (and from
  // `vite preview` / a plain static file server), not just the server root.
  base: "./",
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
