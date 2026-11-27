// The .mdx page for a guide: the player, the video link, and the steps as text.
// Used by npm run docs (our help site) and npm run docusaurus (a folder for your own Docusaurus site).

export const MARKER = "tutorial_kit: generated";

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "guides";
// Text that is safe inside MDX (no JSX / expressions).
export const mdx = (s) => String(s ?? "").replace(/[{}<>]/g, (c) => ({ "{": "&#123;", "}": "&#125;", "<": "&lt;", ">": "&gt;" })[c]);
const yaml = (s) => JSON.stringify(String(s ?? ""));

/**
 * @param video  { file: "videos/<name>.webm", size: "1.2 MB" } or null
 * @param opts.embed  add the "Embed this guide in another page" section (our help site only)
 * @param opts.by     who made the page, for the comment in the front matter
 */
export function pageFor(name, script, rec, video, { embed = true, by = "npm run docs" } = {}) {
  const title = script.title || name;
  const lines = [
    "---",
    `title: ${yaml(title)}`,
    ...(script.description ? [`description: ${yaml(script.description)}`] : []),
    ...(typeof script.order === "number" ? [`sidebar_position: ${script.order}`] : []),
    `# Made by tutorial-kit (${by}). Remove the next line to edit this page by hand — it then won't be overwritten.`,
    MARKER,
    "---",
    "",
    "import TutorialPlayer from '@site/src/components/TutorialPlayer';",
    ...(embed ? ["import EmbedSnippet from '@site/src/components/EmbedSnippet';"] : []),
    ...(video ? ["import VideoDownload from '@site/src/components/VideoDownload';"] : []),
    "",
  ];
  if (script.description) lines.push(mdx(script.description), "");
  lines.push(`<TutorialPlayer name=${JSON.stringify(name)} />`, "");
  if (video) lines.push(`<VideoDownload file=${JSON.stringify(video.file)} size=${JSON.stringify(video.size)} />`, "");
  lines.push("## Steps", "");
  rec.steps
    .filter((s) => !s.deleted)
    .forEach((s, i) => {
      lines.push(`### ${i + 1}. ${mdx(s.title)}`, "");
      if (s.description) lines.push(mdx(s.description), "");
      const caps = (s.captions ?? []).filter((c) => !c.deleted).map((c) => c.text).filter(Boolean);
      if (caps.length) {
        caps.forEach((c, j) => lines.push(`${j + 1}. ${mdx(c)}`));
        lines.push("");
      }
    });
  if (embed)
    lines.push("---", "", "<details>", "<summary>Embed this guide in another page</summary>", "", `<EmbedSnippet name=${JSON.stringify(name)}${video ? ` video=${JSON.stringify(video.file)}` : ""} />`, "", "</details>", "");
  return lines.join("\n");
}
