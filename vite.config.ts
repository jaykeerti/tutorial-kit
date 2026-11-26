import fs from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// While you run the player (npm run dev), each recording picks up your edits to
// tutorials/<name>.tutorial.json (titles, captions, zoom, colors) on reload — no npm run titles needed.
const tutorialFiles = (): Plugin => ({
  name: "tutorial-files",
  configureServer(server) {
    server.middlewares.use(async (req, _res, next) => {
      const name = req.url?.match(/^\/recordings\/([^/?]+)\.json(\?|$)/)?.[1];
      const file = name && `${server.config.root}/tutorials/${decodeURIComponent(name)}.tutorial.json`;
      if (file && fs.existsSync(file)) {
        try {
          // @ts-expect-error plain JS module
          const { applyTutorialFile } = await import("./scripts/apply.mjs");
          applyTutorialFile(decodeURIComponent(name), { log: () => {}, warn: (m: string) => console.warn(`[${name}] ${m}`) });
        } catch (e) {
          console.warn(`[${name}] ${(e as Error).message}`);
        }
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), tutorialFiles()],
  build: { rollupOptions: { input: { viewer: "index.html", harness: "harness.html" } } },
});
