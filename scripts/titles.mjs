// npm run titles -- <tutorial-name>
// Applies what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions
// and settings (zoom, captions, colors) — to public/recordings/<name>.json. No need to record again.
import fs from "node:fs";
import { checkSettings } from "./lib.mjs";

const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name) {
  console.error("Usage: npm run titles -- <tutorial-name>");
  process.exit(1);
}
const scriptFile = `tutorials/${name}.tutorial.json`;
const recFile = `public/recordings/${name}.json`;
for (const f of [scriptFile, recFile]) {
  if (!fs.existsSync(f)) {
    console.error(`Missing ${f}. Record it first:  npm run record -- …`);
    process.exit(1);
  }
}
const script = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
const rec = JSON.parse(fs.readFileSync(recFile, "utf8"));
if (script.steps.length !== rec.steps.length) {
  console.warn(`⚠ ${scriptFile} has ${script.steps.length} steps but the recording has ${rec.steps.length} — matching them in order.`);
}
rec.steps.forEach((s, i) => {
  const from = script.steps[i];
  if (!from) return;
  s.title = from.title;
  s.description = from.description ?? "";
  // Captions: matched to the actions in order. Set "caption": "" to hide one.
  (s.captions ?? []).forEach((c, j) => {
    const a = from.actions?.[j];
    if (a && typeof a.caption === "string") c.text = a.caption;
  });
});
// Settings: zoom, captions, colors.
const { settings, problems } = checkSettings(script.settings);
for (const p of problems) console.warn(`⚠ settings: ${p}`);
if (Object.keys(settings).length) rec.settings = settings;
else delete rec.settings;

fs.writeFileSync(recFile, JSON.stringify(rec));
rec.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2, "0")}  ${s.title}${s.description ? ` — ${s.description}` : ""}`));
if (rec.settings) console.log(`  settings: zoom ${JSON.stringify(rec.settings.zoom ?? "default")}, captions ${JSON.stringify(rec.settings.captions ?? "default")}${rec.settings.colors && Object.keys(rec.settings.colors).length ? `, colors ${JSON.stringify(rec.settings.colors)}` : ""}`);
console.log(`Updated ${recFile}`);
