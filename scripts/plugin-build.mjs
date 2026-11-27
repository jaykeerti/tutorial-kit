// npm run plugin:build   build packages/docusaurus-plugin-tutorial-kit/lib/ (what gets published)
// npm run plugin:pack    build, then make the .tgz you can install or publish (in packages/…/)
//
// The player code comes from src/viewer (one source of truth), compiled to plain JavaScript so any
// Docusaurus site can use it without extra setup.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { DOCS_CSS } from "./docusaurus.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PKG = path.join(ROOT, "packages", "docusaurus-plugin-tutorial-kit");
const LIB = path.join(PKG, "lib");
const VIEWER = ["Tutorial.tsx", "Tutorial.css", "RrwebClip.tsx", "motion.ts", "settings.ts", "time.ts", "types.ts"];

const compile = async (from, to) => {
  const ext = path.extname(from);
  if (ext === ".css" || ext === ".js") return write(to, fs.readFileSync(from, "utf8"));
  const { code } = await transform(fs.readFileSync(from, "utf8"), {
    loader: ext === ".tsx" ? "tsx" : "ts",
    format: "esm",
    jsx: "automatic",
    target: "es2020",
    sourcefile: path.relative(ROOT, from),
  });
  write(to.replace(/\.tsx?$/, ".js"), code);
};
const write = (file, body) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};

fs.rmSync(LIB, { recursive: true, force: true });
// Plugin entry and theme components.
await compile(path.join(PKG, "src", "index.js"), path.join(LIB, "index.js"));
for (const c of fs.readdirSync(path.join(PKG, "src", "theme"))) await compile(path.join(PKG, "src", "theme", c, "index.tsx"), path.join(LIB, "theme", c, "index.tsx"));
// The player.
for (const f of VIEWER) await compile(path.join(ROOT, "src", "viewer", f), path.join(LIB, "player", f));
write(path.join(LIB, "player", "docs.css"), DOCS_CSS);
// Types-only module compiles to nothing useful, but other files import it for types — keep an empty one.
console.log(`Built ${path.relative(ROOT, LIB)}`);

if (process.argv.includes("--pack")) {
  const out = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--silent"], { cwd: PKG, shell: process.platform === "win32" }).toString().trim().split("\n").at(-1);
  console.log(`Packed ${path.relative(ROOT, path.join(PKG, out))}`);
  console.log(`Install it in a Docusaurus site:  npm install ${path.join(PKG, out)}`);
  console.log(`Publish (Artifactory): set publishConfig.registry in ${path.relative(ROOT, path.join(PKG, "package.json"))}, then  npm publish  in that folder`);
}
