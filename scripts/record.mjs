// Record a tutorial by clicking through it yourself.
//
//   Your running app:      npm run record -- --url http://localhost:3000/tickets my-tutorial
//   A dropped-in file:     npm run record -- TicketForm my-tutorial
//
// In the Chrome window that opens:
//   • log in first if needed (in URL mode the login is saved to .auth/ and reused by capture)
//   • press Alt+R (Mac: Option+R) to start recording, Alt+N (Mac: Option+N) for a new step
//   • close the window when you're done
// Your actions are saved to tutorials/<name>.tutorial.json — rename the steps, then run capture.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { authFileFor, openTarget, parseArgs, settle } from "./lib.mjs";

const { url, component, name } = parseArgs(process.argv.slice(2));
if (!url && !component) {
  console.error("Usage:\n  npm run record -- --url <app-url> <tutorial-name>\n  npm run record -- <ComponentName> [tutorial-name]");
  process.exit(1);
}

const auth = url ? authFileFor(url) : undefined;
const { context, page, pageUrl, close } = await openTarget({ url, component, auth, headless: false, port: 5182 });

const steps = [{ title: "Step 1", description: "", actions: [] }];
const current = () => steps[steps.length - 1];
let recording = !url; // in URL mode, wait until the user presses Alt+R (after logging in)
let recordStartUrl; // the tutorial starts from the page you were on when you pressed Alt+R

await page.exposeBinding("__tk_rec", (src, a) => {
  if (a.action === "start") {
    if (!recording) {
      recording = true;
      recordStartUrl = src.page.url();
      console.log(`● Recording started on ${recordStartUrl}`);
    }
    return;
  }
  if (!recording) return;
  if (a.action === "newStep") {
    if (!current().actions.length) return;
    steps.push({ title: `Step ${steps.length + 1}`, description: "", actions: [] });
    console.log(`— Step ${steps.length} —`);
    return;
  }
  // Merge consecutive typing in the same field into one action.
  const last = current().actions.at(-1);
  if (a.action === "type" && last?.action === "type" && JSON.stringify(last.target) === JSON.stringify(a.target)) {
    last.text = a.text;
  } else {
    current().actions.push(a);
  }
  console.log("  recorded", JSON.stringify(a));
});

// The in-page listener lives in recorder-client.js (also used by scripts/test-recorder.mjs).
await page.addInitScript({ path: fileURLToPath(new URL("./recorder-client.js", import.meta.url)) });

await settle(page, pageUrl);
if (url) {
  console.log("Log in if you need to and go to the starting screen.");
  console.log("Then press Alt+R in the page to START recording. Alt+N = new step. Close the window to finish.");
} else {
  console.log("Recording… click through the task. Alt+N = new step. Close the window to finish.");
}

await page.waitForEvent("close", { timeout: 0 });

if (url && !recording) console.warn("⚠ Alt+R was never pressed, so nothing was recorded.");
if (url) {
  try {
    fs.mkdirSync(".auth", { recursive: true });
    await context.storageState({ path: auth });
    console.log(`Saved login to ${auth} (keep this file private).`);
  } catch {
    console.warn("Couldn't save the login state.");
  }
}

const out = `tutorials/${name}.tutorial.json`;
const script = {
  ...(url ? { url: recordStartUrl ?? url, auth } : { component }),
  steps: steps.filter((s) => s.actions.length),
};
fs.mkdirSync("tutorials", { recursive: true });
fs.writeFileSync(out, JSON.stringify(script, null, 2));
console.log(`Saved ${out}. Edit the step titles/descriptions, then: npm run capture -- ${name}`);
await close();
