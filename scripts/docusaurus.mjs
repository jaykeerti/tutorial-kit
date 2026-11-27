// npm run docusaurus -- <name> [<name> …] [--out <folder>]
//
// Makes a folder, laid out like a Docusaurus site, to copy into YOUR Docusaurus site:
//   exports/docusaurus/
//     HOW-TO-ADD.md                       one-time setup + what to copy
//     docs/<category>/<name>.mdx          the guide page: live player, video link, steps as text
//     static/recordings/<name>.json       what the player plays
//     static/videos/<name>.webm           the video, if you exported one
//     src/components/TutorialPlayer/      <TutorialPlayer name="…" /> for pages
//     src/components/VideoDownload/       "Download the video" link
//     src/tutorial-kit/                   the player itself (always the latest, overwrite the old copy)
// Exporting more guides adds them to the same folder. Copy everything into the root of your site.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTutorialFile } from "./apply.mjs";
import { pageFor, slug } from "./docs-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWER_FILES = ["Tutorial.tsx", "Tutorial.css", "RrwebClip.tsx", "motion.ts", "settings.ts", "time.ts", "types.ts"];
export const DEFAULT_OUT = path.join(ROOT, "exports", "docusaurus");

const version = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", p, "package.json"), "utf8")).version;
const write = (file, body) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};

const PLAYER = `// The tutorial player for docs pages:  <TutorialPlayer name="my-guide" />
// Plays static/recordings/<name>.json. Made by tutorial-kit.
// Runs in the browser only (the player needs the DOM; the site's HTML is built in Node).
import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import '../../tutorial-kit/docs.css';

type Props = {
  /** Guide name (static/recordings/<name>.json), or give src instead. */
  name?: string;
  src?: string;
  zoom?: number | boolean;
  captions?: boolean;
  colors?: Record<string, string>;
  layout?: 'side' | 'stacked';
};

export default function TutorialPlayer({name, src, layout = 'stacked', ...options}: Props): React.ReactNode {
  const url = useBaseUrl(src ?? \`/recordings/\${name}.json\`);
  return (
    <div className="tk-doc-player">
      <BrowserOnly fallback={<div className="tk-doc-placeholder">Loading guide…</div>}>
        {() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const {Tutorial} = require('../../tutorial-kit/Tutorial');
          return <Tutorial src={url} layout={layout} {...options} />;
        }}
      </BrowserOnly>
    </div>
  );
}
`;

const VIDEO = `// "Download the video" link for a guide. Made by tutorial-kit.
import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import '../../tutorial-kit/docs.css';

export default function VideoDownload({file, size}: {file: string; size?: string}): React.ReactNode {
  const href = useBaseUrl(\`/\${file}\`);
  const kind = file.endsWith('.mp4') ? 'MP4' : 'WebM';
  return (
    <p className="tk-video-download">
      <a href={href} download>
        Download the video
      </a>{' '}
      <span>
        ({kind}
        {size ? \`, \${size}\` : ''})
      </span>
    </p>
  );
}
`;

const DOCS_CSS = `/* Made by tutorial-kit: how the player sits in a docs page (light and dark theme). */
.tk-doc-player { margin: 1.5rem 0 2rem; }
.tk-doc-placeholder { aspect-ratio: 16 / 9; border-radius: 16px; background: var(--ifm-color-emphasis-100); display: grid; place-items: center; color: var(--ifm-color-emphasis-600); }
.tk-doc-player .tk-step { color: var(--ifm-font-color-base); }
.tk-video-download { margin: -1rem 0 2rem; }
.tk-video-download span { color: var(--ifm-color-emphasis-600); font-size: .9rem; }
[data-theme='dark'] .tk-step { background: var(--ifm-background-surface-color); border-color: var(--ifm-color-emphasis-300); }
[data-theme='dark'] .tk-text span { color: var(--ifm-color-emphasis-700); }
[data-theme='dark'] .tk-player { border-color: var(--ifm-color-emphasis-300); }
`;

const howTo = (guides) => `# Adding these guides to your Docusaurus site

Made by tutorial-kit. Guides in this folder:
${guides.map((g) => `- **${g.title}** → \`${g.page}\``).join("\n")}

## Once: install the player's packages

In your Docusaurus site's folder:

\`\`\`bash
npm install remotion@${version("remotion")} @remotion/player@${version("@remotion/player")} rrweb@${version("rrweb")}
\`\`\`

(Docusaurus 3, React 18 or 19.)

## Each time: copy this folder into your site

Copy everything in this folder (\`docs/\`, \`static/\`, \`src/\`) into the **root** of your Docusaurus site, merging
with the folders already there and replacing files with the same name. Leave out this HOW-TO-ADD.md.

- \`docs/<category>/<name>.mdx\` — the guide's page. Move it wherever you like in your docs; the sidebar picks it up.
- \`static/recordings/\`, \`static/videos/\` — what the page plays and links to. Keep these paths.
- \`src/components/TutorialPlayer\`, \`src/components/VideoDownload\`, \`src/tutorial-kit/\` — the player. Replace the
  old copy each time, so you get fixes.

Then \`npm start\` (or build) your site as usual.

## Using the player on your own pages

\`\`\`mdx
import TutorialPlayer from '@site/src/components/TutorialPlayer';

<TutorialPlayer name="${guides[0]?.name ?? "my-guide"}" />
\`\`\`

Options: \`layout="side"\` (steps beside the video), \`zoom={false}\`, \`captions={false}\`.

## Updating a guide

Change it in tutorial-kit, export again, and copy the new files over the old ones. Pages still have the line
\`tutorial_kit: generated\` at the top; if you edit a page by hand, remember that copying over it replaces your edits.
`;

/** Add one guide to the export folder. Returns where its page went. */
export function exportGuide(name, out = DEFAULT_OUT) {
  const { script, rec } = applyTutorialFile(name, { log: () => {}, warn: (m) => console.warn(`  ${m}`) });

  // The player (always the current version).
  for (const f of VIEWER_FILES) {
    const note = "Made by tutorial-kit — replaced when you export again.";
    const head = f.endsWith(".css") ? `/* ${note} */` : `// ${note}`; // CSS has no // comments
    write(path.join(out, "src", "tutorial-kit", f), `${head}\n${fs.readFileSync(path.join(ROOT, "src", "viewer", f), "utf8")}`);
  }
  write(path.join(out, "src", "tutorial-kit", "docs.css"), DOCS_CSS);
  write(path.join(out, "src", "components", "TutorialPlayer", "index.tsx"), PLAYER);
  write(path.join(out, "src", "components", "VideoDownload", "index.tsx"), VIDEO);

  // Recording and video.
  write(path.join(out, "static", "recordings", `${name}.json`), fs.readFileSync(path.join(ROOT, "public", "recordings", `${name}.json`)));
  let video = null;
  for (const ext of ["webm", "mp4"]) {
    const src = path.join(ROOT, "videos", `${name}.${ext}`);
    const dest = path.join(out, "static", "videos", `${name}.${ext}`);
    if (fs.existsSync(src)) {
      write(dest, fs.readFileSync(src));
      video ??= { file: `videos/${name}.${ext}`, size: `${(fs.statSync(src).size / 1e6).toFixed(1)} MB` };
    } else fs.rmSync(dest, { force: true });
  }

  // Page (in its category's folder; a page for it in another category is removed — it was moved).
  const category = script.category || "Guides";
  const docs = path.join(out, "docs");
  if (fs.existsSync(docs))
    for (const d of fs.readdirSync(docs, { withFileTypes: true })) if (d.isDirectory() && d.name !== slug(category)) fs.rmSync(path.join(docs, d.name, `${name}.mdx`), { force: true });
  const dir = path.join(docs, slug(category));
  const cat = path.join(dir, "_category_.json");
  if (!fs.existsSync(cat)) write(cat, JSON.stringify({ label: category, link: { type: "generated-index" } }, null, 2) + "\n");
  const page = path.join(dir, `${name}.mdx`);
  write(page, pageFor(name, script, rec, video, { embed: false, by: "npm run docusaurus" }));

  // HOW-TO-ADD.md lists every guide in the folder.
  const guides = [];
  for (const d of fs.readdirSync(docs, { withFileTypes: true }))
    if (d.isDirectory())
      for (const f of fs.readdirSync(path.join(docs, d.name)))
        if (f.endsWith(".mdx")) {
          const body = fs.readFileSync(path.join(docs, d.name, f), "utf8");
          const t = body.match(/^title:\s*(.+)$/m)?.[1];
          guides.push({ name: f.replace(/\.mdx$/, ""), title: t ? JSON.parse(t) : f, page: `docs/${d.name}/${f}` });
        }
  write(path.join(out, "HOW-TO-ADD.md"), howTo(guides));
  return { name, folder: out, page: path.relative(out, page).replace(/\\/g, "/"), video: !!video, guides: guides.length };
}

// ---- CLI -------------------------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.chdir(ROOT);
  const args = process.argv.slice(2);
  const oi = args.indexOf("--out");
  const out = oi >= 0 ? path.resolve(args[oi + 1]) : DEFAULT_OUT;
  let names = args.filter((a, i) => !a.startsWith("--") && (oi < 0 || i !== oi + 1));
  if (!names.length)
    names = fs
      .readdirSync("tutorials")
      .filter((f) => f.endsWith(".tutorial.json") && !f.startsWith("_"))
      .map((f) => f.replace(/\.tutorial\.json$/, ""))
      .filter((n) => fs.existsSync(`public/recordings/${n}.json`));
  let failed = 0;
  for (const n of names) {
    try {
      const r = exportGuide(n, out);
      console.log(`  ${n}: ${r.page}${r.video ? " + video" : " (no video — export one first to include it)"}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${n}: ${e.message}`);
    }
  }
  console.log(`\nReady to copy into your Docusaurus site: ${out}\nSee HOW-TO-ADD.md in that folder.`);
  process.exit(failed ? 1 : 0);
}
