// "Download the video" link for a guide made into a video with npm run export.
import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function VideoDownload({file, size}: {file: string; size?: string}): React.ReactNode {
  const href = useBaseUrl(`/${file}`);
  const kind = file.endsWith('.mp4') ? 'MP4' : 'WebM';
  return (
    <p className="tk-video-download">
      <a href={href} download>
        Download the video
      </a>{' '}
      <span>
        ({kind}
        {size ? `, ${size}` : ''})
      </span>
    </p>
  );
}
