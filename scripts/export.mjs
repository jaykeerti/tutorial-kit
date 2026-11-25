// npm run export -- <name> [<name> …]     make a video of each tutorial: videos/<name>.webm
// npm run export                          …of every recorded tutorial
//
// Options:
//   --mp4            MP4 (H.264) instead of WebM — plays everywhere, incl. PowerPoint and older Safari
//   --no-cards       no title cards (intro and before each step)
//   --no-zoom        no zoom on clicks          --no-captions   no captions
//   --scale 0.75     smaller video (1 = the recorded window size)
//   --out <folder>   where to put the videos (default videos/)
//
// Your edits in tutorials/<name>.tutorial.json are applied first, like npm run titles.
// The first run downloads a headless Chrome for rendering (~100 MB, once).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { applyTutorialFile } from "./apply.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const valueArgs = new Set(["--scale", "--out"].map((f) => opt(f, null)).filter(Boolean));
let names = args.filter((a) => !a.startsWith("--") && !valueArgs.has(a));
if (!names.length) {
  names = fs
    .readdirSync("tutorials")
    .filter((f) => f.endsWith(".tutorial.json") && !f.startsWith("_"))
    .map((f) => f.replace(/\.tutorial\.json$/, ""))
    .filter((n) => fs.existsSync(`public/recordings/${n}.json`));
}
const mp4 = flag("--mp4");
const ext = mp4 ? "mp4" : "webm";
const scale = Number(opt("--scale", "1"));
const outDir = path.resolve(opt("--out", "videos"));
if (!(scale > 0 && scale <= 2)) throw new Error("--scale must be a number like 0.75");
if (!names.length) {
  console.log("No recorded tutorials found. Record one first:  npm run record -- --url <page> <name>");
  process.exit(1);
}

// 1. Apply edits; stage only the recordings we need as the bundle's public folder.
const pub = fs.mkdtempSync(path.join(os.tmpdir(), "tk-export-"));
fs.mkdirSync(path.join(pub, "recordings"));
const jobs = [];
for (const name of names) {
  try {
    const { script } = applyTutorialFile(name, { log: () => {}, warn: (m) => console.warn(`  ${m}`) });
    fs.copyFileSync(`public/recordings/${name}.json`, path.join(pub, "recordings", `${name}.json`));
    jobs.push({ name, script });
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

// 2. Bundle the video composition once.
console.log("Preparing the video renderer…");
const serveUrl = await bundle({ entryPoint: path.join(ROOT, "src/video/index.ts"), publicDir: pub });

// 3. Render each tutorial.
fs.mkdirSync(outDir, { recursive: true });
let failed = names.length - jobs.length;
for (const { name, script } of jobs) {
  const inputProps = {
    name,
    title: script.title || name,
    description: script.description || "",
    cards: !flag("--no-cards"),
    ...(flag("--no-zoom") ? { zoom: false } : {}),
    ...(flag("--no-captions") ? { captions: false } : {}),
  };
  const out = path.join(outDir, `${name}.${ext}`);
  try {
    const composition = await selectComposition({ serveUrl, id: "tutorial", inputProps });
    const secs = (composition.durationInFrames / composition.fps).toFixed(0);
    let last = -1;
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: mp4 ? "h264" : "vp8",
      outputLocation: out,
      scale,
      onProgress: ({ progress }) => {
        const p = Math.floor(progress * 100);
        if (p !== last && p % 5 === 0) process.stdout.write(`\r  ${name}: ${secs} s video — ${p}%   `);
        last = p;
      },
    });
    const mb = (fs.statSync(out).size / 1e6).toFixed(1);
    console.log(`\r  ${name}: ${path.relative(ROOT, out)}  (${secs} s, ${mb} MB)          `);
  } catch (e) {
    failed++;
    console.error(`\n  ✗ ${name}: ${e.message}`);
  }
}
fs.rmSync(pub, { recursive: true, force: true });

console.log(`\nAdd them to the help site (download link + <video> embed code):  npm run docs`);
process.exit(failed ? 1 : 0);
