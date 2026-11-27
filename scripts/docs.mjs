// npm run docs -- <name> [<name> …]     add/update these tutorials in the help site
// npm run docs                          add/update every recorded tutorial
// npm run docs -- --sync-only           copy the player code into the site and update the guides
//                                       already on it (run automatically before the site starts or builds)
//
// For each tutorial: applies your edits from tutorials/<name>.tutorial.json, copies the recording
// into help-site/static/recordings/, and writes a page help-site/docs/<category>/<name>.mdx with the
// player and the steps as text. Pages you've edited by hand (marker line removed) are left alone.
// If you made a video (npm run export), it's copied to help-site/static/videos/ and the page gets a
// download link and <video> embed code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTutorialFile } from "./apply.mjs";
import { MARKER, pageFor, slug } from "./docs-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "help-site");
const VIEWER_FILES = ["Tutorial.tsx", "Tutorial.css", "RrwebClip.tsx", "motion.ts", "settings.ts", "time.ts", "types.ts"];

/** Copy the player from src/viewer into the site (one source of truth; the copy is git-ignored). */
export function syncViewer() {
  const to = path.join(SITE, "src", "tutorial-kit");
  fs.mkdirSync(to, { recursive: true });
  for (const f of VIEWER_FILES) {
    const body = fs.readFileSync(path.join(ROOT, "src", "viewer", f), "utf8");
    const note = `Copied from tutorial-kit/src/viewer/${f} — edit it there, not here.`;
    const head = f.endsWith(".css") ? `/* ${note} */` : `// ${note}`; // CSS has no // comments
    fs.writeFileSync(path.join(to, f), `${head}\n${body}`);
  }
}

/** The tutorial's video from npm run export (videos/<name>.webm or .mp4), copied into the site. */
function copyVideo(name) {
  const to = path.join(SITE, "static", "videos");
  let found = null;
  for (const ext of ["webm", "mp4"]) {
    const src = path.join(ROOT, "videos", `${name}.${ext}`);
    const dest = path.join(to, `${name}.${ext}`);
    if (fs.existsSync(src)) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(src, dest);
      found ??= { file: `videos/${name}.${ext}`, size: `${(fs.statSync(src).size / 1e6).toFixed(1)} MB` };
    } else fs.rmSync(dest, { force: true }); // video was deleted: don't keep serving the old one
  }
  return found;
}

function publish(name) {
  const { script, rec } = applyTutorialFile(name, { log: () => {}, warn: (m) => console.warn(`  ${m}`) });

  // Recording → static/recordings/
  const recDir = path.join(SITE, "static", "recordings");
  fs.mkdirSync(recDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "public", "recordings", `${name}.json`), path.join(recDir, `${name}.json`));
  const video = copyVideo(name);

  // Page → docs/<category>/<name>.mdx
  const category = script.category || "Guides";
  const dir = path.join(SITE, "docs", slug(category));
  fs.mkdirSync(dir, { recursive: true });
  const catFile = path.join(dir, "_category_.json");
  if (!fs.existsSync(catFile)) fs.writeFileSync(catFile, JSON.stringify({ label: category, link: { type: "generated-index" } }, null, 2) + "\n");

  // Remove an older page for this tutorial in another category (it was moved).
  for (const d of fs.readdirSync(path.join(SITE, "docs"), { withFileTypes: true })) {
    const old = path.join(SITE, "docs", d.name, `${name}.mdx`);
    if (d.isDirectory() && d.name !== slug(category) && fs.existsSync(old) && fs.readFileSync(old, "utf8").includes(MARKER)) fs.rmSync(old);
  }

  const file = path.join(dir, `${name}.mdx`);
  const rel = path.relative(ROOT, file);
  if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(MARKER)) {
    console.log(`  ${name}: recording updated; page ${rel} was edited by hand, so it was left as is.`);
  } else {
    fs.writeFileSync(file, pageFor(name, script, rec, video));
    console.log(`  ${name}: ${rel}  (${rec.steps.filter((s) => !s.deleted).length} steps, in "${category}"${video ? `, video ${video.size}` : ""})`);
  }
  return { name, title: script.title || name, description: script.description || "", category, path: `/${slug(category)}/${name}` };
}

/** All guides, for the list on the home page. */
function writeManifest() {
  const guides = [];
  const docs = path.join(SITE, "docs");
  for (const d of fs.readdirSync(docs, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(docs, d.name))) {
      if (!f.endsWith(".mdx")) continue;
      const body = fs.readFileSync(path.join(docs, d.name, f), "utf8");
      if (!body.includes("<TutorialPlayer")) continue;
      const fm = (k) => body.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1];
      const unq = (v) => (v ? (v.startsWith('"') ? JSON.parse(v) : v.trim()) : "");
      let category = d.name;
      try {
        category = JSON.parse(fs.readFileSync(path.join(docs, d.name, "_category_.json"), "utf8")).label ?? d.name;
      } catch {}
      guides.push({ title: unq(fm("title")) || f.replace(/\.mdx$/, ""), description: unq(fm("description")), category, path: `/${d.name}/${f.replace(/\.mdx$/, "")}` });
    }
  }
  guides.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  fs.writeFileSync(path.join(SITE, "src", "guides.json"), JSON.stringify(guides, null, 2) + "\n");
  return guides;
}

// ---- CLI -------------------------------------------------------------------------------------
const args = process.argv.slice(2);
process.chdir(ROOT);
syncViewer();
if (args.includes("--sync-only")) {
  // Before the site starts or builds: bring the guides already on it up to date with your
  // tutorial files (titles, captions, zoom, colors), so you don't have to remember npm run docs.
  const onSite = fs.existsSync(path.join(SITE, "static", "recordings"))
    ? fs
        .readdirSync(path.join(SITE, "static", "recordings"))
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""))
        .filter((n) => fs.existsSync(`tutorials/${n}.tutorial.json`) && fs.existsSync(`public/recordings/${n}.json`))
    : [];
  if (onSite.length) console.log(`Updating ${onSite.length} guide(s) on the help site from your tutorial files:`);
  for (const n of onSite) {
    try {
      publish(n);
    } catch (e) {
      console.warn(`  ⚠ ${n}: ${e.message}`);
    }
  }
  if (onSite.length || !fs.existsSync(path.join(SITE, "src", "guides.json"))) writeManifest();
  process.exit(0);
}
if (args.includes("--rebuild-list")) {
  writeManifest();
  process.exit(0);
}

let names = args.filter((a) => !a.startsWith("--"));
if (!names.length) {
  names = fs
    .readdirSync("tutorials")
    .filter((f) => f.endsWith(".tutorial.json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.tutorial\.json$/, ""))
    .filter((n) => fs.existsSync(`public/recordings/${n}.json`));
}
let failed = 0;
console.log(`Adding ${names.length} tutorial(s) to the help site:`);
for (const n of names) {
  try {
    publish(n);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${n}: ${e.message}`);
  }
}
const all = writeManifest();
console.log(`\nThe help site has ${all.length} guide(s). Preview:  npm run help   →  http://localhost:3000`);
console.log("Build static files to host:  npm run help:build   →  help-site/build/");
process.exit(failed ? 1 : 0);
