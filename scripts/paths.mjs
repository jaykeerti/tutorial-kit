// Where things live.
//
// Standalone (this repo): recordings in public/recordings/, videos in videos/, logins in .auth/.
// Inside a Docusaurus site (tutorial-kit studio, run by docusaurus-plugin-tutorial-kit): the plugin sets
// TK_PROJECT to the site's folder, and everything goes where Docusaurus serves it — static/recordings/,
// static/videos/ — with the guide's page in docs/ and private things (logins) in .tutorial-kit/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** tutorial-kit's own code (scripts/, src/). */
export const TOOL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** True inside a Docusaurus site. */
export const STUDIO = !!process.env.TK_PROJECT;
/** The folder the files below are relative to: this repo, or the Docusaurus site. */
export const PROJECT = STUDIO ? path.resolve(process.env.TK_PROJECT) : TOOL;

export const DIRS = STUDIO
  ? {
      tutorials: process.env.TK_TUTORIALS || "tutorials",
      recordings: "static/recordings",
      videos: "static/videos",
      auth: ".tutorial-kit/auth",
      deleted: ".tutorial-kit/deleted",
      docs: process.env.TK_DOCS || "docs",
    }
  : { tutorials: "tutorials", recordings: "public/recordings", videos: "videos", auth: ".auth", deleted: "deleted", docs: null };

/** Absolute path inside the project. */
export const inProject = (...p) => path.join(PROJECT, ...p);
/** Project-relative paths with forward slashes (for messages). */
export const rel = (abs) => path.relative(PROJECT, abs).replace(/\\/g, "/");

export const tutorialFile = (name) => path.join(DIRS.tutorials, `${name}.tutorial.json`);
export const recordingFile = (name) => path.join(DIRS.recordings, `${name}.json`);

/** Inside a Docusaurus site, keep .tutorial-kit/ (logins!) out of git. */
export function guardPrivateFolder() {
  if (!STUDIO) return;
  const dir = inProject(".tutorial-kit");
  fs.mkdirSync(dir, { recursive: true });
  const gi = path.join(dir, ".gitignore");
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, "# Made by tutorial-kit: logins and deleted guides — never commit these.\n*\n");
}
