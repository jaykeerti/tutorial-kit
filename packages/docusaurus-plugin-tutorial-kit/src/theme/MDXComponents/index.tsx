// Adds <TutorialPlayer> and <VideoDownload> to every .md/.mdx page, so pages don't need to import them.
// Builds on the theme's own MDXComponents (@theme-init), so nothing else changes.
import MDXComponents from "@theme-init/MDXComponents";
import TutorialPlayer from "@theme/TutorialPlayer";
import VideoDownload from "@theme/VideoDownload";

export default { ...MDXComponents, TutorialPlayer, VideoDownload };
