// npm run titles -- <tutorial-name>
// Applies what you edited in tutorials/<name>.tutorial.json — step titles, descriptions, captions
// and settings (zoom, captions, colors) — to public/recordings/<name>.json. No need to record again.
import { applyTutorialFile } from "./apply.mjs";

const name = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!name) {
  console.error("Usage: npm run titles -- <tutorial-name>");
  process.exit(1);
}
try {
  applyTutorialFile(name);
  console.log(`Updated public/recordings/${name}.json`);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
