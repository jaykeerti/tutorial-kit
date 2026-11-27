// <VideoDownload file="videos/my-guide.webm" size="1.2 MB" />: a "Download the video" link.
import React from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import "../../player/docs.css";

export default function VideoDownload({ file, size }: { file: string; size?: string }): React.ReactNode {
  const href = useBaseUrl(`/${file}`);
  const kind = file.endsWith(".mp4") ? "MP4" : "WebM";
  return (
    <p className="tk-video-download">
      <a href={href} download>
        Download the video
      </a>{" "}
      <span>
        ({kind}
        {size ? `, ${size}` : ""})
      </span>
    </p>
  );
}
