// Record a tutorial by clicking through it yourself.
//
//   Your running app:      npm run record -- --url http://localhost:3000/tickets my-tutorial
//   A dropped-in file:     npm run record -- TicketForm my-tutorial
//
// In the Chrome window that opens:
//   • log in first if needed (in URL mode the login is saved to .auth/ and reused by capture)
//   • press Alt+R (Mac: Option+R) to start recording — press it again to start over
//   • press Alt+N (Mac: Option+N) before each new step
//   • close the window when you're done
//
// Then the recording is checked straight away by replaying it (capture), so you know at once
// whether it works. Add --no-capture to skip that (e.g. if replaying would create real records).
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { authFileFor, createRecorderState, openTarget, parseArgs, settle } from "./lib.mjs";

const argv = process.argv.slice(2);
const noCapture = argv.includes("--no-capture");
const { url, component, name } = parseArgs(argv);
if (!url && !component) {
  console.error("Usage:\n  npm run record -- --url <app-url> <tutorial-name> [--no-capture]\n  npm run record -- <ComponentName> [tutorial-name] [--no-capture]");
  process.exit(1);
}

const auth = url ? authFileFor(url) : undefined;
const { context, page, pageUrl, close } = await openTarget({ url, component, auth, headless: false, port: 5182 });

// In URL mode, wait until Alt+R (so logging in isn't recorded). Component mode records right away.
const state = createRecorderState({ recordingFromStart: !url });
await page.exposeBinding("__tk_rec", (_src, msg) => state.handle(msg));
await page.addInitScript({ path: fileURLToPath(new URL("./recorder-client.js", import.meta.url)) });

await settle(page, pageUrl);
if (url) {
  console.log("Log in if you need to and go to the screen where the tutorial starts (no dialogs open).");
  console.log("Then click in the page and press Alt+R (Mac: Option+R) to START. Alt+N (Mac: Option+N) = new step.");
  console.log("Close the window to finish.");
} else {
  console.log("Recording… Alt+N (Mac: Option+N) = new step. Close the window to finish.");
}

await page.waitForEvent("close", { timeout: 0 });

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
await close();

const steps = state.steps();
const out = `tutorials/${name}.tutorial.json`;
const script = { ...(url ? { url: state.startUrl ?? url, auth } : { component }), steps };
fs.mkdirSync("tutorials", { recursive: true });
fs.writeFileSync(out, JSON.stringify(script, null, 2));
console.log(`Saved ${out} (${steps.length} steps, ${steps.reduce((n, s) => n + s.actions.length, 0)} actions).`);

if (!steps.length) process.exit(1);

if (noCapture) {
  console.log(`Next: rename the steps in ${out}, then  npm run capture -- ${name}`);
  process.exit(0);
}

console.log("\nChecking the recording by replaying it now (this performs the steps again for real — use --no-capture to skip)…\n");
const code = await new Promise((resolve) =>
  spawn(process.execPath, [fileURLToPath(new URL("./capture.mjs", import.meta.url)), name], { stdio: "inherit" }).on("exit", resolve),
);
if (code === 0) {
  console.log(`\n✅ Tutorial works. View it:  npm run dev  →  http://localhost:5180/?t=${name}`);
  console.log(`   Give the steps real titles in ${out}, then  npm run capture -- ${name}  to refresh.`);
} else {
  console.log(`\n✗ The replay failed (see above). Fix ${out} or record again, then  npm run capture -- ${name}`);
}
process.exit(code ?? 1);
