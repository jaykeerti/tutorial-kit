// tutorial-kit studio: the editor, running beside your Docusaurus site while you work on it.
//
// docusaurus-plugin-tutorial-kit starts it during `npm start` when the site has
// plugins: [['docusaurus-plugin-tutorial-kit', {studio: true}]] and tutorial-kit-studio installed:
//   http://localhost:5190/edit   record, edit, delete, import, make videos
// Everything is saved inside the site (see scripts/paths.mjs): static/recordings/, static/videos/,
// tutorials/, and the guide's page in docs/<category>/<name>.mdx.
//
// It's for your own computer only: it listens on localhost and refuses requests from other web pages.
// `docusaurus build` never starts it, so nothing of it reaches your published site.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR = path.join(TOOL, "editor"); // the built editor page (vite build)
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };

/**
 * @param o.siteDir  the Docusaurus site's folder
 * @param o.port     default 5190
 * @param o.docs     the site's docs folder, if not docs/
 * @param o.tutorials where the small editable files go, if not tutorials/
 * @returns {Promise<{ url: string, close: () => void }>}
 */
export async function startStudio({ siteDir, port = 5190, docs, tutorials, log = console.log } = {}) {
  if (!siteDir) throw new Error("startStudio needs siteDir");
  // Set before loading the API: its paths are fixed when it loads (and record/export inherit them).
  process.env.TK_PROJECT = path.resolve(siteDir);
  if (docs) process.env.TK_DOCS = docs;
  if (tutorials) process.env.TK_TUTORIALS = tutorials;
  const { devApi } = await import("./dev-api.mjs");
  const own = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);

  const server = http.createServer((req, res) => {
    const fail = (code, text) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(text);
    };
    // Only this page may use it: not another site open in your browser, not another computer.
    if (!own.has(req.headers.host ?? "")) return fail(403, "tutorial-kit studio: open it at localhost");
    const origin = req.headers.origin;
    if (origin && !own.has(origin.replace(/^https?:\/\//, ""))) return fail(403, "tutorial-kit studio: not from another page");
    const site = req.headers["sec-fetch-site"];
    if (req.method !== "GET" && req.method !== "HEAD" && site && site !== "same-origin" && site !== "none") return fail(403, "tutorial-kit studio: not from another page");

    const url = new URL(req.url ?? "/", "http://localhost");
    // The player page (Open player) asks for /recordings/<name>.json.
    const rec = url.pathname.match(/^\/recordings\/([^/]+)\.json$/);
    if (rec) req.url = `/__tk/recording/${rec[1]}`;
    if (req.url.startsWith("/__tk/")) return devApi(req, res, () => fail(404, "Not found"));

    // The editor page itself: files from editor/, anything else → index.html (it picks /edit or the player).
    let file = path.join(EDITOR, decodeURIComponent(url.pathname));
    if (!file.startsWith(EDITOR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(EDITOR, "index.html");
    if (!fs.existsSync(file)) return fail(500, "tutorial-kit studio isn't built (editor/ is missing).");
    res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", file.endsWith("index.html") ? "no-store" : "max-age=31536000, immutable");
    fs.createReadStream(file).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once("error", (e) => reject(e.code === "EADDRINUSE" ? new Error(`port ${port} is in use (set the plugin's studio: {port: …})`) : e));
    server.listen(port, "localhost", resolve);
  });
  const href = `http://localhost:${port}/edit`;
  log(`tutorial-kit studio: ${href}  (record and edit guides; saved into this site)`);
  return { url: href, close: () => server.close() };
}

// node scripts/studio-server.mjs <docusaurus-site-folder> [port]  — run it by itself (testing).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [siteDir, port] = process.argv.slice(2);
  if (!siteDir) {
    console.error("Usage: node scripts/studio-server.mjs <docusaurus-site-folder> [port]");
    process.exit(1);
  }
  startStudio({ siteDir, port: port ? Number(port) : undefined }).catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
