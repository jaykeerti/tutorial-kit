// Shared helpers for record.mjs, capture.mjs and the tests.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";

export const VIEWPORT = { width: 1280, height: 720 };

/** Parse CLI args:  --url <url> <name>   or   <ComponentName> [name].  Other --flags are ignored here. */
export function parseArgs(argv) {
  // Options that take a value (their value isn't the tutorial name).
  const s = argv.indexOf("--size");
  if (s !== -1) argv = argv.filter((_, j) => j !== s && j !== s + 1);
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
/**
 * Window size for recording, from --fullscreen / --size WxH. Returns "full" (the page fills the
 * window, maximized, and follows it if you resize), {width, height}, or the default 1280×720.
 */
export function sizeFromArgs(argv) {
  if (argv.includes("--fullscreen")) return "full";
  const i = argv.indexOf("--size");
  if (i === -1) return VIEWPORT;
  const m = /^(\d{3,4})\s*[x×,]\s*(\d{3,4})$/i.exec(argv[i + 1] ?? "");
  if (!m) throw new Error(`--size needs a size like 1920x1080 (got "${argv[i + 1] ?? ""}")`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export async function openTarget({ url, component, auth, headless, port, slowMo = 0, size = VIEWPORT }) {
  let server = null;
  let pageUrl = url;
  if (!url) {
    server = await createServer({ server: { port, strictPort: true }, logLevel: "warn" });
    await server.listen();
    pageUrl = `http://localhost:${port}/harness.html?c=${component}`;
  }
  const full = size === "full";
  // uses your installed Chrome
  const browser = await chromium.launch({ channel: "chrome", headless, slowMo, args: full ? ["--start-maximized"] : [] });
  const context = await browser.newContext({
    // Full screen: no fixed size — the page is as big as the window.
    ...(full ? { viewport: null } : { viewport: size, deviceScaleFactor: 1 }),
    storageState: auth && fs.existsSync(auth) ? auth : undefined,
  });
  const page = await context.newPage();
  if (full && !headless) {
    // --start-maximized isn't enough on a Mac; ask Chrome to maximize the window too.
    try {
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send("Browser.getWindowForTarget");
      await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "maximized" } });
    } catch {}
  }
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
 * Collect the images and fonts the page loads, so recordings still look right without access
 * to your app. Call inline(json) at the end to swap their URLs for embedded copies.
 */
export function collectAssets(page, { maxEach = 2_000_000, maxTotal = 20_000_000 } = {}) {
  const assets = new Map();
  const pending = [];
  let bytes = 0;
  page.on("response", (r) => {
    const type = r.request().resourceType();
    if (!["image", "font"].includes(type) || r.status() !== 200 || r.url().startsWith("data:")) return;
    pending.push(
      r
        .body()
        .then((b) => {
          if (b.length > maxEach || bytes + b.length > maxTotal) return;
          bytes += b.length;
          const ct = (r.headers()["content-type"] || "").split(";")[0].trim() || (type === "font" ? "font/woff2" : "image/png");
          assets.set(r.url(), `data:${ct};base64,${b.toString("base64")}`);
        })
        .catch(() => {}),
    );
  });
  return {
    /** Replace asset URLs in a JSON string (longest first, so "a.png?v=2" isn't broken by "a.png"). */
    async inline(json) {
      await Promise.all(pending);
      let count = 0;
      for (const [u, data] of [...assets].sort((a, b) => b[0].length - a[0].length)) {
        if (json.includes(u)) {
          json = json.split(u).join(data);
          count++;
        }
      }
      return { json, count };
    },
  };
}

/**
 * Turns the raw messages from recorder-client.js into tutorial steps:
 * handles start / restart / new step, merges typing, and drops duplicate clicks.
 * Every action keeps its time (ts) and, for clicks, where the mouse was (at) — used to
 * build the recording; stripped by scriptSteps() for the editable tutorial file.
 */
export function createRecorderState({ recordingFromStart, log = console.log }) {
  let steps = [{ title: "Step 1", description: "", startTs: null, actions: [] }];
  let recording = recordingFromStart;
  let startUrl = null;
  let startTs = null;
  let lastTs = 0;
  let points = []; // mouse positions of clicks that aren't actions (e.g. into a text field)

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const key = (t) => t?.name ?? t?.text ?? t?.label ?? t?.testId ?? t?.placeholder ?? t?.css;
  const show = (a) => {
    const { alts, ts, at, ...rest } = a;
    return JSON.stringify(rest);
  };

  const handle = (msg) => {
    const { ts = Date.now(), ...a } = msg;
    if (a.action === "start") {
      if (recording && steps.some((s) => s.actions.length)) log("↺ Recording restarted — earlier actions discarded");
      steps = [{ title: "Step 1", description: "", startTs: ts, actions: [] }];
      points = [];
      recording = true;
      startUrl = a.url;
      startTs = ts;
      log(`● Recording started on ${a.url}`);
      return;
    }
    if (!recording) return;
    if (a.action === "point") {
      points.push({ ts, at: a.at });
      return;
    }

    const cur = steps[steps.length - 1];
    if (a.action === "newStep") {
      if (cur.actions.length) {
        steps.push({ title: `Step ${steps.length + 1}`, description: "", startTs: ts, actions: [] });
        log(`— Step ${steps.length} —`);
      }
      return;
    }

    const prev = cur.actions.at(-1);
    // Typing into the same field again: keep only the final text.
    if (a.action === "type" && prev?.action === "type" && same(prev.target, a.target)) {
      prev.text = a.text;
      prev.tsEnd = ts; // when typing finished (keeps the zoom and caption up while you type)
      lastTs = ts;
      return;
    }
    // The same click reported twice in quick succession (e.g. text + its button).
    if (a.action === "click" && prev?.action === "click" && ts - lastTs < 600 && key(prev.target) === key(a.target)) return;
    // A Tab straight after typing just moves focus to the next field we'll click anyway.
    if (a.action === "press" && a.key === "Tab" && prev?.action === "type") return;

    cur.actions.push({ ...a, ts });
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
    /** When Alt+R was pressed (null in component mode, which records from the first moment). */
    get startTs() {
      return startTs;
    },
    steps: () => steps.filter((s) => s.actions.length),
    points: () => points,
  };
}

/**
 * Look-and-feel settings written into each tutorial file (edit, then `npm run titles`).
 * Keep in step with DEFAULT_SETTINGS in src/viewer/settings.ts.
 */
export const DEFAULT_SETTINGS = {
  zoom: 1.8,
  captions: true,
  colors: { accent: "#7c3aed", click: "#7c3aed", cursor: "#111111", captionBg: "rgba(17, 17, 27, 0.86)", captionText: "#ffffff" },
};

/** Check settings from a tutorial file; returns { settings, problems }. Unknown or invalid values are dropped. */
export function checkSettings(input) {
  const problems = [];
  const settings = {};
  if (input == null) return { settings, problems };
  if (typeof input !== "object") return { settings, problems: ['"settings" should be an object'] };
  for (const k of Object.keys(input)) if (!["zoom", "captions", "colors"].includes(k)) problems.push(`unknown setting "${k}" (ignored)`);
  if ("zoom" in input) {
    const z = input.zoom;
    if (z === true || z === false || (typeof z === "number" && z >= 1 && z <= 4)) settings.zoom = z === 1 ? false : z;
    else problems.push(`"zoom" should be true, false or a number from 1 to 4 (got ${JSON.stringify(z)})`);
  }
  if ("captions" in input) {
    if (typeof input.captions === "boolean") settings.captions = input.captions;
    else problems.push(`"captions" should be true or false`);
  }
  if ("colors" in input) {
    settings.colors = {};
    for (const [k, v] of Object.entries(input.colors || {})) {
      if (!(k in DEFAULT_SETTINGS.colors)) problems.push(`unknown color "${k}" — use ${Object.keys(DEFAULT_SETTINGS.colors).join(", ")}`);
      else if (typeof v !== "string" || !v.trim()) problems.push(`color "${k}" should be a CSS color like "#2563eb"`);
      else settings.colors[k] = v.trim();
    }
  }
  return { settings, problems };
}

/** Steps as written to tutorials/<name>.tutorial.json: titles + actions (with editable captions), without timing details. */
export const scriptSteps = (steps) =>
  steps.map(({ title, description, actions }) => ({
    title,
    description,
    actions: actions.map(({ ts, tsEnd, at, ...a }) => ({ caption: captionFor(a), ...a })),
  }));

const quote = (s, max = 40) => {
  const t = String(s ?? "").trim();
  return t ? `“${t.length > max ? `${t.slice(0, max - 1)}…` : t}”` : "";
};

/** A short caption for an action, e.g. Click “Save”, Type “Widget” in Part name. "" = no caption. */
export function captionFor(a) {
  const t = a.target || {};
  const name = t.name ?? t.text ?? t.label ?? t.placeholder ?? t.testId ?? "";
  const field = t.label ?? t.placeholder ?? t.name ?? "";
  switch (a.action) {
    case "click":
      if (!name) return "";
      if (t.role === "option" || t.role === "menuitem" || t.role === "radio") return `Choose ${quote(name)}`;
      if (t.role === "checkbox" || t.role === "switch") return `Tick ${quote(name)}`;
      if (t.role === "tab") return `Open the ${quote(name)} tab`;
      if (t.role === "combobox" || t.label) return `Open ${quote(name)}`;
      return `Click ${quote(name)}`;
    case "type":
      return `Type ${quote(a.text)}${field ? ` in ${field}` : ""}`;
    case "select":
      return `Choose ${quote(a.value)}${field ? ` in ${field}` : ""}`;
    case "press":
      return a.key === "Enter" ? "Press Enter" : a.key === "Escape" ? "Press Esc" : "";
    case "upload":
      return `Upload ${(a.files || []).join(", ") || "a file"}`;
    default:
      return "";
  }
}
