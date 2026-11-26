// npm run titles -- <tutorial-name>
// Applies what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions
// and settings (zoom, captions, colors) — to public/recordings/<name>.json. No need to record again.
import fs from "node:fs";
import { applyTutorialFile } from "./apply.mjs";

const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name) {
  console.error("Usage: npm run titles -- <tutorial-name>");
  process.exit(1);
}
try {
  applyTutorialFile(name);
  console.log(`Updated public/recordings/${name}.json`);
  // Already on the help site? Update its copy too, so the site shows the change on reload.
  const onSite = `help-site/static/recordings/${name}.json`;
  if (fs.existsSync(onSite)) {
    fs.copyFileSync(`public/recordings/${name}.json`, onSite);
    console.log(`Updated ${onSite}  (new step titles show on the page after  npm run docs -- ${name})`);
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
