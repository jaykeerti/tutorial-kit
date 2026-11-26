// Apply what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions and
// settings — to public/recordings/<name>.json. Used by `npm run titles` and `npm run docs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSettings } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A step's or action's "zoom": true / false (also "on"/"off", 1/0). undefined = not set. */
function onOff(v, where, warn) {
  if (v === undefined || v === null) return undefined;
  if (v === true || v === "true" || v === "on" || v === "yes" || v === 1) return true;
  if (v === false || v === "false" || v === "off" || v === "no" || v === 0) return false;
  if (typeof v === "number" && v > 1) {
    warn(`⚠ ${where}: "zoom" here is on/off only — using on (the level comes from "settings")`);
    return true;
  }
  warn(`⚠ ${where}: "zoom" should be true or false (got ${JSON.stringify(v)}) — ignored`);
  return undefined;
}

/** A step's or action's "speed": 0.25 to 8 (2 = twice as fast, 0.5 = half speed). undefined = not set.
 *  (1 is kept: on an action it means "normal speed here", even in a faster step.) */
function speedOf(v, where, warn) {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "string" ? Number(v.replace(/x$/i, "")) : v;
  if (typeof n === "number" && n >= 0.25 && n <= 8) return n;
  warn(`⚠ ${where}: "speed" should be a number from 0.25 to 8, like 2 for twice as fast (got ${JSON.stringify(v)}) — ignored`);
  return undefined;
}

/** Returns { script, rec } after updating the recording on disk. Throws with a readable message. */
export function applyTutorialFile(name, { log = console.log, warn = console.warn } = {}) {
  const scriptFile = `tutorials/${name}.tutorial.json`;
  const recFile = `public/recordings/${name}.json`;
  const abs = (f) => path.join(ROOT, f);
  for (const f of [scriptFile, recFile]) {
    if (!fs.existsSync(abs(f))) throw new Error(`Missing ${f}. Record it first:  npm run record -- …`);
  }
  let script;
  try {
    script = JSON.parse(fs.readFileSync(abs(scriptFile), "utf8"));
  } catch (e) {
    throw new Error(`${scriptFile} isn't valid JSON (a missing comma or quote?): ${e.message}`);
  }
  const rec = JSON.parse(fs.readFileSync(abs(recFile), "utf8"));
  const steps = script.steps ?? [];
  if (steps.length !== rec.steps.length) {
    warn(`⚠ ${scriptFile} has ${steps.length} steps but the recording has ${rec.steps.length} — matching them in order.`);
  }
  rec.steps.forEach((s, i) => {
    const from = steps[i];
    if (!from) return;
    s.title = from.title ?? s.title;
    s.description = from.description ?? "";
    // Zoom on/off for the whole step, or for one action ("zoom": false / true).
    const step = onOff(from.zoom, `step ${i + 1}`, warn);
    if (step === undefined) delete s.zoom;
    else s.zoom = step;
    // Speed for the whole step, or from one action until the next ("speed": 2 = twice as fast).
    const sp = speedOf(from.speed, `step ${i + 1}`, warn);
    if (sp === undefined) delete s.speed;
    else s.speed = sp;
    // Captions: matched to the actions in order. Set "caption": "" to hide one.
    (s.captions ?? []).forEach((c, j) => {
      const a = from.actions?.[j];
      if (a && typeof a.caption === "string") c.text = a.caption;
      const z = onOff(a?.zoom, `step ${i + 1}, action ${j + 1}`, warn);
      if (z === undefined) delete c.zoom;
      else c.zoom = z;
      const v = speedOf(a?.speed, `step ${i + 1}, action ${j + 1}`, warn);
      if (v === undefined) delete c.speed;
      else c.speed = v;
    });
  });
  // Settings: zoom, captions, colors.
  // Also accepted at the top of the file, next to "title" (an easy slip) — and then it wins over
  // the "settings" block, since you most likely added it on purpose.
  const loose = Object.fromEntries(["zoom", "captions", "colors"].filter((k) => k in script).map((k) => [k, script[k]]));
  const { settings, problems } = checkSettings(Object.keys(loose).length ? { ...script.settings, ...loose } : script.settings);
  for (const p of problems) warn(`⚠ settings: ${p}`);
  if (Object.keys(settings).length) rec.settings = settings;
  else delete rec.settings;

  fs.writeFileSync(abs(recFile), JSON.stringify(rec));
  rec.steps.forEach((s, i) => log(`  ${String(i + 1).padStart(2, "0")}  ${s.title}${s.description ? ` — ${s.description}` : ""}`));
  if (rec.settings) {
    const c = rec.settings.colors && Object.keys(rec.settings.colors).length ? `, colors ${JSON.stringify(rec.settings.colors)}` : "";
    log(`  settings: zoom ${JSON.stringify(rec.settings.zoom ?? "default")}, captions ${JSON.stringify(rec.settings.captions ?? "default")}${c}`);
  }
  return { script, rec };
}
