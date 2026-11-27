// npm run export -- <name> [<name> …]     make a video of each tutorial: videos/<name>.webm
// npm run export                          …of every recorded tutorial
//
// Options:
//   --mp4            MP4 (H.264) instead of WebM — plays everywhere, incl. PowerPoint and older Safari
//   --no-cards       no title cards (intro and before each step)
//   --no-zoom        no zoom on clicks          --no-captions   no captions
//   --no-step-label  no "Step 2 of 3 · title" in the corner
//   --scale 0.75     smaller video (1 = the recorded window size)
//   --out <folder>   where to put the videos (default videos/)
//
// Your edits in tutorials/<name>.tutorial.json are applied first, like npm run titles.
// Rendering uses your Google Chrome (the one npm run record opens), so nothing is downloaded — that
// also works on company networks that block downloads. No Chrome found? Then Remotion downloads its
// own headless Chrome once (~100 MB). TK_CHROME=/path/to/chrome picks another browser;
// TK_CHROME=download always uses Remotion's own.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { applyTutorialFile } from "./apply.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

/** Your installed Google Chrome, or null. */
function installedChrome() {
  const env = process.env.TK_CHROME;
  if (env === "download") return null;
  if (env) {
    if (fs.existsSync(env)) return env;
    console.warn(`TK_CHROME=${env} doesn't exist — looking for Chrome instead.`);
  }
  const home = os.homedir();
  const places = {
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    win32: [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, "Google", "Chrome", "Application", "chrome.exe")),
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] ?? [];
  return places.find((p) => fs.existsSync(p)) ?? null;
}
const chrome = installedChrome();
// A full Chrome renders in its current headless mode ("chrome-for-testing" in Remotion's terms).
const browser = chrome ? { browserExecutable: chrome, chromeMode: "chrome-for-testing" } : {};

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
console.log(chrome ? `Preparing the video renderer (using ${chrome})…` : "Preparing the video renderer (no Google Chrome found — downloading a headless one, once)…");
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
    stepLabel: !flag("--no-step-label"),
  };
  const out = path.join(outDir, `${name}.${ext}`);
  try {
    const composition = await selectComposition({ serveUrl, id: "tutorial", inputProps, ...browser });
    const secs = (composition.durationInFrames / composition.fps).toFixed(0);
    let last = -1;
    await renderMedia({
      ...browser,
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
