// npm run titles -- <tutorial-name>
// Copies the step titles and descriptions from tutorials/<name>.tutorial.json into
// public/recordings/<name>.json, so you can rename steps without recording again.
import fs from "node:fs";

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
});
fs.writeFileSync(recFile, JSON.stringify(rec));
rec.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2, "0")}  ${s.title}${s.description ? ` — ${s.description}` : ""}`));
console.log(`Updated ${recFile}`);
