// Record a tutorial by clicking through it yourself.
//
//   Your running app:      npm run record -- --url http://localhost:3000/tickets my-tutorial
//   A dropped-in file:     npm run record -- TicketForm my-tutorial
//
// In the Chrome window that opens:
//   • log in first if needed (in URL mode the login is saved to .auth/ and reused by capture)
//   • press Alt+N to start a new step
//   • close the window when you're done
// Your actions are saved to tutorials/<name>.tutorial.json — rename the steps, then run capture.
import fs from "node:fs";
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

// Runs inside the page: listens to the user and describes each element in a human, stable way.
await page.addInitScript(() => {
  const labelOf = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return l.textContent.trim();
    }
    return el.getAttribute("aria-label") || el.closest("label")?.textContent.trim() || null;
  };
  const describe = (el) => {
    const tagged = el.closest("[data-testid]");
    if (tagged) return { testId: tagged.dataset.testid };
    if (el.matches("input, textarea, select")) {
      const label = labelOf(el);
      if (label) return { label };
      if (el.placeholder) return { css: `[placeholder="${el.placeholder}"]` };
      if (el.name) return { css: `${el.tagName.toLowerCase()}[name="${el.name}"]` };
    }
    const btn = el.closest("button, a, [role=button], [role=tab], [role=menuitem]");
    if (btn) {
      // Keep the full visible text: with exact matching, "New ticket" won't find "+ New ticket".
      const name = (btn.getAttribute("aria-label") || btn.textContent || "").trim().replace(/\s+/g, " ");
      const role = btn.tagName === "A" ? "link" : btn.getAttribute("role") || "button";
      return { role, name, exact: true };
    }
    // Plain elements: only worth recording if they have a short label of their own (e.g. a custom dropdown option).
    const text = el.textContent.trim().replace(/\s+/g, " ");
    if (text && text.length < 40 && el.children.length <= 2) return { text, exact: true };
    return null; // a click on empty space / a background — nothing to replay
  };
  addEventListener("click", (e) => {
    const el = e.target;
    if (el.matches("input, textarea")) return; // typing is recorded below
    const target = describe(el);
    if (target) window.__tk_rec({ action: "click", target });
  }, true);
  addEventListener("input", (e) => {
    const el = e.target;
    if (el.matches("input, textarea") && el.type !== "password") window.__tk_rec({ action: "type", target: describe(el), text: el.value });
  }, true);
  addEventListener("keydown", (e) => {
    // Use the physical key (e.code): on a Mac, Option+R types "®", so e.key is never "r".
    if (e.altKey && e.code === "KeyN") window.__tk_rec({ action: "newStep" });
    if (e.altKey && e.code === "KeyR") window.__tk_rec({ action: "start" });
  }, true);
});

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
