// Inside a Docusaurus site (studio): write the guide's page into docs/ whenever it's recorded, saved,
// imported or gets a video. Pages you've edited by hand (the "tutorial_kit: generated" line removed) are
// left alone, wherever you moved them.
import fs from "node:fs";
import path from "node:path";
import { applyTutorialFile } from "./apply.mjs";
import { MARKER, pageFor, slug } from "./docs-page.mjs";
import { DIRS, inProject, rel } from "./paths.mjs";

/** Every <name>.mdx under the docs folder (it may have been moved to another folder). */
export function pagesOf(name) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !fs.existsSync(dir)) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules") walk(path.join(dir, d.name), depth + 1);
      else if (d.name === `${name}.mdx`) found.push(path.join(dir, d.name));
    }
  };
  walk(inProject(DIRS.docs), 0);
  return found;
}
const generated = (file) => fs.readFileSync(file, "utf8").includes(MARKER);

/** The guide's video in static/videos/, if there is one. */
export function videoOf(name) {
  for (const ext of ["webm", "mp4"]) {
    const f = inProject(DIRS.videos, `${name}.${ext}`);
    if (fs.existsSync(f)) return { file: `videos/${name}.${ext}`, size: `${(fs.statSync(f).size / 1e6).toFixed(1)} MB` };
  }
  return null;
}

/** Write (or update) the page. Returns { page, kept } with the page's path in the site. */
export function writeGuidePage(name) {
  const { script, rec } = applyTutorialFile(name, { log: () => {}, warn: () => {} });
  const pages = pagesOf(name);
  const own = pages.find((p) => !generated(p));
  if (own) return { page: rel(own), kept: true }; // edited by hand: yours now

  const category = script.category || "Guides";
  const dir = inProject(DIRS.docs, slug(category));
  const file = path.join(dir, `${name}.mdx`);
  // Moved to another category: remove the old generated page (and its folder, if that leaves it empty).
  for (const p of pages)
    if (p !== file) {
      fs.rmSync(p);
      const left = fs.readdirSync(path.dirname(p)).filter((f) => f !== "_category_.json");
      if (!left.length) fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  fs.mkdirSync(dir, { recursive: true });
  const cat = path.join(dir, "_category_.json");
  if (!fs.existsSync(cat)) fs.writeFileSync(cat, JSON.stringify({ label: category, link: { type: "generated-index" } }, null, 2) + "\n");
  const body = pageFor(name, script, rec, videoOf(name), { embed: false, by: "tutorial-kit studio", components: "@theme" });
  // Only write when something changed, so Docusaurus doesn't reload for nothing.
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== body) fs.writeFileSync(file, body);
  return { page: rel(file), kept: false };
}
