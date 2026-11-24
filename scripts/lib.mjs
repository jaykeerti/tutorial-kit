// Shared helpers for record.mjs, capture.mjs and the tests.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";

export const VIEWPORT = { width: 1280, height: 720 };

/** Parse CLI args:  --url <url> <name>   or   <ComponentName> [name].  Other --flags are ignored here. */
export function parseArgs(argv) {
  const i = argv.indexOf("--url");
  if (i !== -1) {
    const url = argv[i + 1];
    const rest = argv.filter((a, j) => j !== i && j !== i + 1 && !a.startsWith("--"));
    const name = rest[0] ?? slug(new URL(url).pathname) ?? "app";
    return { url, name };
  }
  const pos = argv.filter((a) => !a.startsWith("--"));
  const [component, name = component?.toLowerCase()] = pos;
  return { component, name };
}

const slug = (s) => s.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || null;

/** Where the saved login (cookies + localStorage) for a URL lives. Never commit this folder. */
export const authFileFor = (url) => path.join(".auth", `${new URL(url).host.replace(/[^a-z0-9.-]/gi, "_")}.json`);

/**
 * Open a browser on either:
 *   - your running app (url mode), reusing a saved login if there is one, or
 *   - a component from src/components via the built-in harness (component mode).
 */
export async function openTarget({ url, component, auth, headless, port, slowMo = 0 }) {
  let server = null;
  let pageUrl = url;
  if (!url) {
    server = await createServer({ server: { port, strictPort: true }, logLevel: "warn" });
    await server.listen();
    pageUrl = `http://localhost:${port}/harness.html?c=${component}`;
  }
  const browser = await chromium.launch({ channel: "chrome", headless, slowMo }); // uses your installed Chrome
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: auth && fs.existsSync(auth) ? auth : undefined,
  });
  const page = await context.newPage();
  const close = async () => {
    await browser.close().catch(() => {});
    if (server) await server.close();
  };
  return { browser, context, page, pageUrl, close };
}

/** Load the page and give it a moment to finish its first render / API calls. */
export async function settle(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
}

/**
 * Inject rrweb into every page load (works on any site — your app needs no changes)
 * and stream its events back to Node, so full page navigations don't lose anything.
 *
 * options.mask:       extra CSS selectors whose text is replaced with *** in the recording
 * options.maskInputs: true = hide everything typed into inputs
 * Elements with data-private are always masked; data-tk-block are left out entirely.
 */
export async function injectRecorder(page, onEvent, options = {}) {
  const rrweb = fs.readFileSync(path.join("node_modules", "rrweb", "dist", "rrweb.umd.min.cjs"), "utf8");
  const config = {
    maskTextSelector: ["[data-private]", ...(options.mask || [])].join(", "),
    blockSelector: "[data-tk-block]",
    maskAllInputs: !!options.maskInputs,
    maskInputOptions: { password: true },
    inlineStylesheet: true,
    collectFonts: true,
  };
  await page.exposeBinding("__tk_emit", (_src, e) => onEvent(e));
  await page.addInitScript({
    content: `${rrweb}
;(function () {
  // Init scripts run in every frame, including iframes rrweb itself creates — only record the top page, once.
  if (window !== window.top || window.__tk_started) return;
  window.__tk_started = true;
  var config = ${JSON.stringify(config)};
  config.emit = function (e) { window.__tk_emit(e); };
  var start = function () { window.rrweb.record(config); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`,
  });
}

/**
 * Turns the raw messages from recorder-client.js into tutorial steps:
 * handles start / restart / new step, merges typing, and drops duplicate clicks.
 */
export function createRecorderState({ recordingFromStart, log = console.log }) {
  let steps = [{ title: "Step 1", description: "", actions: [] }];
  let recording = recordingFromStart;
  let startUrl = null;
  let lastTs = 0;

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const key = (t) => t?.name ?? t?.text ?? t?.label ?? t?.testId ?? t?.placeholder ?? t?.css;
  const show = (a) => {
    const { alts, ...rest } = a;
    return JSON.stringify(rest);
  };

  const handle = (msg) => {
    const { ts = Date.now(), ...a } = msg;
    if (a.action === "start") {
      if (recording && steps.some((s) => s.actions.length)) {
        steps = [{ title: "Step 1", description: "", actions: [] }];
        log("↺ Recording restarted — earlier actions discarded");
      }
      recording = true;
      startUrl = a.url;
      log(`● Recording started on ${a.url}`);
      if (a.dialogOpen) {
        log("⚠ A dialog/modal is open. Capture starts from the page URL, where it won't be open,");
        log("  so the first steps would fail. Close it, then press Alt+R (Mac: Option+R) again to restart.");
      }
      return;
    }
    if (!recording) return;

    const cur = steps[steps.length - 1];
    if (a.action === "newStep") {
      if (cur.actions.length) {
        steps.push({ title: `Step ${steps.length + 1}`, description: "", actions: [] });
        log(`— Step ${steps.length} —`);
      }
      return;
    }

    const prev = cur.actions.at(-1);
    // Typing into the same field again: keep only the final text.
    if (a.action === "type" && prev?.action === "type" && same(prev.target, a.target)) {
      prev.text = a.text;
      lastTs = ts;
      return;
    }
    // The same click reported twice in quick succession (e.g. text + its button).
    if (a.action === "click" && prev?.action === "click" && ts - lastTs < 600 && key(prev.target) === key(a.target)) return;
    // A Tab straight after typing just moves focus to the next field we'll click anyway.
    if (a.action === "press" && a.key === "Tab" && prev?.action === "type") return;

    cur.actions.push(a);
    lastTs = ts;
    log("  recorded", show(a));
  };

  return {
    handle,
    get recording() {
      return recording;
    },
    get startUrl() {
      return startUrl;
    },
    steps: () => steps.filter((s) => s.actions.length),
  };
}
