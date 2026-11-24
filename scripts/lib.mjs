// Shared helpers for record.mjs and capture.mjs.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright-core";

export const VIEWPORT = { width: 1280, height: 720 };

/** Parse CLI args:  --url <url> <name>   or   <ComponentName> [name] */
export function parseArgs(argv) {
  const i = argv.indexOf("--url");
  if (i !== -1) {
    const url = argv[i + 1];
    const rest = argv.filter((_, j) => j !== i && j !== i + 1);
    const name = rest[0] ?? slug(new URL(url).pathname) ?? "app";
    return { url, name };
  }
  const [component, name = component?.toLowerCase()] = argv;
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
export async function openTarget({ url, component, auth, headless, port }) {
  let server = null;
  let pageUrl = url;
  if (!url) {
    server = await createServer({ server: { port, strictPort: true }, logLevel: "warn" });
    await server.listen();
    pageUrl = `http://localhost:${port}/harness.html?c=${component}`;
  }
  const browser = await chromium.launch({ channel: "chrome", headless }); // uses your installed Chrome
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
 */
export async function injectRecorder(page, onEvent) {
  const rrweb = fs.readFileSync(path.join("node_modules", "rrweb", "dist", "rrweb.umd.min.cjs"), "utf8");
  await page.exposeBinding("__tk_emit", (_src, e) => onEvent(e));
  await page.addInitScript({
    content: `${rrweb}
;(function () {
  // Init scripts run in every frame, including iframes rrweb itself creates — only record the top page, once.
  if (window !== window.top || window.__tk_started) return;
  window.__tk_started = true;
  var start = function () {
    window.rrweb.record({ emit: function (e) { window.__tk_emit(e); }, inlineStylesheet: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`,
  });
}
