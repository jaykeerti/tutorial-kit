// docusaurus-plugin-tutorial-kit
//
// In docusaurus.config.js:   plugins: ['docusaurus-plugin-tutorial-kit']
// Then in any .md/.mdx page:  <TutorialPlayer name="my-guide" />
// It plays static/recordings/<name>.json (made with tutorial-kit).
//
// Options:
//   recordings: URL folder the recordings are served from (default "/recordings", i.e. static/recordings/)
//   studio:     true (or {port, docs, tutorials}) — while you run `npm start`, also open the tutorial-kit
//               editor at http://localhost:5190/edit to record and edit guides; saved into this site.
//               Needs the dev dependency tutorial-kit-studio. Never part of `npm run build`.
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");

/** Start the studio once (Docusaurus may load plugins again when the config changes). */
async function startStudio(siteDir, studio) {
  if (global.__tutorialKitStudio) return;
  global.__tutorialKitStudio = true;
  const o = typeof studio === "object" ? studio : {};
  let entry;
  try {
    entry = createRequire(path.join(siteDir, "package.json")).resolve("tutorial-kit-studio");
  } catch {
    console.warn("[tutorial-kit] studio: true needs tutorial-kit-studio — install it:  npm install -D tutorial-kit-studio");
    return;
  }
  try {
    const { startStudio: start } = await import(pathToFileURL(entry).href);
    await start({ siteDir, port: o.port, docs: o.docs, tutorials: o.tutorials, log: (m) => console.log(`[tutorial-kit] ${m}`) });
  } catch (e) {
    console.warn(`[tutorial-kit] studio didn't start: ${e.message}`);
  }
}

module.exports = function tutorialKitPlugin(context, options = {}) {
  const recordings = String(options.recordings ?? "/recordings").replace(/\/+$/, "");
  return {
    name: "docusaurus-plugin-tutorial-kit",

    // Our components: @theme/TutorialPlayer, @theme/VideoDownload, and MDXComponents (adds
    // <TutorialPlayer> to every page without an import). A site's own src/theme/ still wins.
    getThemePath() {
      return path.join(__dirname, "theme");
    },

    async contentLoaded({ actions }) {
      actions.setGlobalData({ recordings });
    },

    // Development only (npm start): start the studio beside the site. A production build never does.
    configureWebpack(config, isServer) {
      if (options.studio && !isServer && config.mode === "development") startStudio(context.siteDir, options.studio);
      return {};
    },
  };
};

module.exports.validateOptions = ({ options }) => {
  if (options && typeof options !== "object") throw new Error("docusaurus-plugin-tutorial-kit: options must be an object");
  if (options?.recordings !== undefined && typeof options.recordings !== "string")
    throw new Error('docusaurus-plugin-tutorial-kit: "recordings" must be a URL path like "/recordings"');
  const st = options?.studio;
  if (st !== undefined && typeof st !== "boolean" && (typeof st !== "object" || st === null))
    throw new Error('docusaurus-plugin-tutorial-kit: "studio" must be true, false, or {port, docs, tutorials}');
  if (st && typeof st === "object" && st.port !== undefined && !(Number.isInteger(st.port) && st.port > 0 && st.port < 65536))
    throw new Error('docusaurus-plugin-tutorial-kit: "studio.port" must be a port number like 5190');
  return { id: "default", ...(options ?? {}) }; // Docusaurus needs the plugin's id
};
