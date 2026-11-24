// Apply what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions and
// settings — to public/recordings/<name>.json. Used by `npm run titles` and `npm run docs`.
import fs from "node:fs";
import { checkSettings } from "./lib.mjs";

/** Returns { script, rec } after updating the recording on disk. Throws with a readable message. */
export function applyTutorialFile(name, { log = console.log, warn = console.warn } = {}) {
  const scriptFile = `tutorials/${name}.tutorial.json`;
  const recFile = `public/recordings/${name}.json`;
  for (const f of [scriptFile, recFile]) {
    if (!fs.existsSync(f)) throw new Error(`Missing ${f}. Record it first:  npm run record -- …`);
  }
  let script;
  try {
    script = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
  } catch (e) {
    throw new Error(`${scriptFile} isn't valid JSON (a missing comma or quote?): ${e.message}`);
  }
  const rec = JSON.parse(fs.readFileSync(recFile, "utf8"));
  const steps = script.steps ?? [];
  if (steps.length !== rec.steps.length) {
    warn(`⚠ ${scriptFile} has ${steps.length} steps but the recording has ${rec.steps.length} — matching them in order.`);
  }
  rec.steps.forEach((s, i) => {
    const from = steps[i];
    if (!from) return;
    s.title = from.title ?? s.title;
    s.description = from.description ?? "";
    // Captions: matched to the actions in order. Set "caption": "" to hide one.
    (s.captions ?? []).forEach((c, j) => {
      const a = from.actions?.[j];
      if (a && typeof a.caption === "string") c.text = a.caption;
    });
  });
  // Settings: zoom, captions, colors.
  const { settings, problems } = checkSettings(script.settings);
  for (const p of problems) warn(`⚠ settings: ${p}`);
  if (Object.keys(settings).length) rec.settings = settings;
  else delete rec.settings;

  fs.writeFileSync(recFile, JSON.stringify(rec));
  rec.steps.forEach((s, i) => log(`  ${String(i + 1).padStart(2, "0")}  ${s.title}${s.description ? ` — ${s.description}` : ""}`));
  if (rec.settings) {
    const c = rec.settings.colors && Object.keys(rec.settings.colors).length ? `, colors ${JSON.stringify(rec.settings.colors)}` : "";
    log(`  settings: zoom ${JSON.stringify(rec.settings.zoom ?? "default")}, captions ${JSON.stringify(rec.settings.captions ?? "default")}${c}`);
  }
  return { script, rec };
}
