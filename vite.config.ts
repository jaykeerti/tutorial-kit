import fs from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// While you run the player (npm run dev), each recording picks up your edits to
// tutorials/<name>.tutorial.json (titles, captions, zoom, colors) on reload — no npm run titles needed.
const tutorialFiles = (): Plugin => ({
  name: "tutorial-files",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const name = req.url?.match(/^\/recordings\/([^/?]+)\.json(\?|$)/)?.[1];
      const file = name && `${server.config.root}/tutorials/${decodeURIComponent(name)}.tutorial.json`;
      const recording = name && `${server.config.root}/public/recordings/${decodeURIComponent(name)}.json`;
      if (file && fs.existsSync(file)) {
        try {
          // @ts-expect-error plain JS module
          const { applyTutorialFile } = await import("./scripts/apply.mjs");
          applyTutorialFile(decodeURIComponent(name), { log: () => {}, warn: (m: string) => console.warn(`[${name}] ${m}`) });
        } catch (e) {
          console.warn(`[${name}] ${(e as Error).message}`);
        }
      }
      // Serve it ourselves: Vite notices files added to public/ only a moment later, so a recording
      // that was just made or imported would otherwise come back as the app's page.
      if (recording && !decodeURIComponent(name).includes("..") && fs.existsSync(recording)) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(recording).pipe(res);
        return;
      }
      next();
    });
    // The editor page's helpers (save, export, record…): /__tk/…  — see scripts/dev-api.mjs
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/__tk/")) return next();
      // @ts-expect-error plain JS module
      const { devApi } = await import("./scripts/dev-api.mjs");
      devApi(req, res, next);
    });
  },
});

export default defineConfig({
  plugins: [react(), tutorialFiles()],
  build: { rollupOptions: { input: { viewer: "index.html", harness: "harness.html" } } },
});
