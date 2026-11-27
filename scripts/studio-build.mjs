// npm run studio:build   build packages/tutorial-kit-studio/dist/ (what gets published)
// npm run studio:pack    build, then make the .tgz you can install or publish (in packages/…/)
//
// tutorial-kit-studio is this repo's recorder, editor and video export, packaged to run inside a
// Docusaurus site (see scripts/studio-server.mjs). Same code as npm run dev — copied, not forked:
//   dist/scripts/   the scripts the editor runs (record, export, save…)
//   dist/src/       the player and video code (the video export bundles it with Remotion)
//   dist/editor/    the editor page, built with Vite
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.join(ROOT, "packages", "tutorial-kit-studio");
const DIST = path.join(PKG, "dist");
const SCRIPTS = ["studio-server.mjs", "dev-api.mjs", "paths.mjs", "apply.mjs", "script-core.mjs", "site-page.mjs", "docs-page.mjs", "record.mjs", "export.mjs", "lib.mjs", "session.mjs", "titles.mjs", "recorder-client.js"];

fs.rmSync(DIST, { recursive: true, force: true });
for (const f of SCRIPTS) {
  fs.mkdirSync(path.join(DIST, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "scripts", f), path.join(DIST, "scripts", f));
}
for (const d of ["viewer", "video"]) fs.cpSync(path.join(ROOT, "src", d), path.join(DIST, "src", d), { recursive: true });

await build({
  root: ROOT,
  configFile: false, // only the viewer/editor page — not the test harness or demo components
  plugins: [react()],
  logLevel: "warn",
  publicDir: false, // not public/: that holds this repo's own recordings
  build: { outDir: path.join(DIST, "editor"), emptyOutDir: true, rollupOptions: { input: { viewer: path.join(ROOT, "index.html") } } },
});
console.log(`Built ${path.relative(ROOT, DIST)}`);

if (process.argv.includes("--pack")) {
  const out = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--silent"], { cwd: PKG, shell: process.platform === "win32" }).toString().trim().split("\n").at(-1);
  console.log(`Packed ${path.relative(ROOT, path.join(PKG, out))}`);
  console.log(`Install it in a Docusaurus site:  npm install -D ${path.join(PKG, out)}`);
}
