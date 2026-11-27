// Apply what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions and
// settings — to public/recordings/<name>.json. Used by `npm run titles` and `npm run docs`.
import fs from "node:fs";
import { inProject, recordingFile, tutorialFile } from "./paths.mjs";
import { applyScript } from "./script-core.mjs";

/** Returns { script, rec } after updating the recording on disk. Throws with a readable message. */
export function applyTutorialFile(name, { log = console.log, warn = console.warn } = {}) {
  const scriptFile = tutorialFile(name);
  const recFile = recordingFile(name);
  const abs = (f) => inProject(f);
  for (const f of [scriptFile, recFile]) {
    if (!fs.existsSync(abs(f))) throw new Error(`Missing ${f}. Record it first:  npm run record -- …`);
  }
  let script;
  try {
    script = JSON.parse(fs.readFileSync(abs(scriptFile), "utf8"));
  } catch (e) {
    throw new Error(`${scriptFile} isn't valid JSON (a missing comma or quote?): ${e.message}`);
  }
  const rec = applyScript(JSON.parse(fs.readFileSync(abs(recFile), "utf8")), script, warn, scriptFile);
  fs.writeFileSync(abs(recFile), JSON.stringify(rec));
  rec.steps.forEach((s, i) => log(`  ${String(i + 1).padStart(2, "0")}  ${s.title}${s.description ? ` — ${s.description}` : ""}`));
  if (rec.settings) {
    const c = rec.settings.colors && Object.keys(rec.settings.colors).length ? `, colors ${JSON.stringify(rec.settings.colors)}` : "";
    log(`  settings: zoom ${JSON.stringify(rec.settings.zoom ?? "default")}, captions ${JSON.stringify(rec.settings.captions ?? "default")}${c}`);
  }
  return { script, rec };
}
