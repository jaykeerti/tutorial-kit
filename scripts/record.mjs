// Record a tutorial by clicking through it yourself — what you do is filmed (as HTML, with rrweb)
// and becomes the tutorial. Nothing is replayed afterwards.
//
//   Your running app:      npm run record -- --url http://localhost:3000/tickets my-tutorial
//   A dropped-in file:     npm run record -- TicketForm my-tutorial
//
// In the Chrome window that opens:
//   • log in first if needed (the login is saved to .auth/ and reused next time)
//   • press Alt+R (Mac: Option+R) to start recording — press it again to start over
//   • press Alt+N (Mac: Option+N) before each new step
//   • close the window when you're done
//
// Options:  --mask-inputs  hide everything typed into fields
//           --no-inline-assets  don't embed images/fonts (smaller file, but needs access to your app to look right)
import fs from "node:fs";
import { DEFAULT_SETTINGS, authFileFor, checkSettings, openTarget, parseArgs, scriptSteps, settle } from "./lib.mjs";
import { attachSession, buildRecording } from "./session.mjs";

const argv = process.argv.slice(2);
const { url, component, name } = parseArgs(argv);
if (!url && !component) {
  console.error("Usage:\n  npm run record -- --url <app-url> <tutorial-name>\n  npm run record -- <ComponentName> [tutorial-name]");
  process.exit(1);
}

const auth = url ? authFileFor(url) : undefined;
const { context, page, pageUrl, close } = await openTarget({ url, component, auth, headless: false, port: 5182 });

// In URL mode, wait until Alt+R (so logging in isn't recorded). Component mode records right away.
const session = await attachSession(page, { recordingFromStart: !url, maskInputs: argv.includes("--mask-inputs") });

await settle(page, pageUrl);
if (url) {
  console.log("Log in if you need to and go to the screen where the tutorial starts.");
  console.log("Then click in the page and press Alt+R (Mac: Option+R) to START. Alt+N (Mac: Option+N) = new step.");
  console.log("Close the window to finish.");
} else {
  console.log("Recording… Alt+N (Mac: Option+N) = new step. Close the window to finish.");
}

await page.waitForEvent("close", { timeout: 0 });

const { state } = session;
if (url && !state.recording) console.warn("⚠ Alt+R was never pressed, so nothing was recorded.");
if (url) {
  try {
    fs.mkdirSync(".auth", { recursive: true });
    await context.storageState({ path: auth });
    console.log(`Saved login to ${auth} (keep this file private).`);
  } catch {
    console.warn("Couldn't save the login state.");
  }
}

// Recording the same tutorial again keeps your page details and settings (zoom, captions, colors).
const scriptFile = `tutorials/${name}.tutorial.json`;
let settings = DEFAULT_SETTINGS;
// For the help site (npm run docs): page title, intro, sidebar group and position.
let page = { title: name.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase()), description: "", category: "Guides" };
try {
  const old = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
  for (const k of ["title", "description", "category", "order"]) if (old[k] !== undefined) page[k] = old[k];
  const kept = checkSettings(old.settings).settings;
  settings = { ...DEFAULT_SETTINGS, ...kept, colors: { ...DEFAULT_SETTINGS.colors, ...kept.colors } };
} catch {}

const built = await buildRecording({ ...session, source: url ?? component, settings, inline: !argv.includes("--no-inline-assets") });
await close();

if (!built) {
  console.error("Nothing was recorded.");
  process.exit(1);
}

// The recording the viewer plays…
fs.mkdirSync("public/recordings", { recursive: true });
const recFile = `public/recordings/${name}.json`;
fs.writeFileSync(recFile, built.json);

// …and a small editable file: settings, step titles and captions (+ the actions, for the optional robot replay).
const steps = state.steps();
fs.mkdirSync("tutorials", { recursive: true });
fs.writeFileSync(scriptFile, JSON.stringify({ ...page, ...(url ? { url: state.startUrl ?? url, auth } : { component }), settings, steps: scriptSteps(steps) }, null, 2));

const { info } = built;
console.log(
  `\n✅ Saved ${recFile}  (${info.steps} steps, ${info.seconds.toFixed(0)} s after cutting pauses, ${info.inlined} images/fonts embedded, ${(fs.statSync(recFile).size / 1024).toFixed(0)} KB)`,
);
console.log(`   View it:      npm run dev  →  http://localhost:5180/?t=${name}`);
console.log(`   Titles, captions, zoom, colors:  edit ${scriptFile}, then  npm run titles -- ${name}`);
console.log(`   Add it to the help site:  npm run docs -- ${name}`);
