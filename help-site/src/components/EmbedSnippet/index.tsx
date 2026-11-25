// Shows the <iframe> code for putting a guide on another page (Confluence, SharePoint, any HTML),
// with the right address for wherever this site is hosted.
import React, {useState} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';

function Snippet({name, path, videoUrl}: {name: string; path: string; videoUrl?: string}) {
  const [zoom, setZoom] = useState(true);
  const [captions, setCaptions] = useState(true);
  const q = new URLSearchParams({t: name});
  if (!zoom) q.set('zoom', '0');
  if (!captions) q.set('captions', '0');
  const src = `${window.location.origin}${path}?${q}`;
  const code = `<iframe src="${src}"\n        style="width:100%; aspect-ratio:16/12; border:0"\n        title="${name}" loading="lazy" allowfullscreen></iframe>`;
  return (
    <div>
      <p>
        <label style={{marginRight: 16}}>
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} /> Zoom on clicks
        </label>
        <label>
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /> Captions
        </label>
      </p>
      <CodeBlock language="html">{code}</CodeBlock>
      <p>
        Or link to it directly: <a href={src}>{src}</a>
      </p>
      {videoUrl ? (
        <>
          <p>
            <strong>As a plain video</strong> (works where iframes aren't allowed, e.g. email-style pages, LMS, intranets;
            zoom and captions are already in it):
          </p>
          <CodeBlock language="html">{`<video src="${window.location.origin}${videoUrl}"\n       controls playsinline preload="metadata"\n       style="width:100%; border-radius:12px"></video>`}</CodeBlock>
        </>
      ) : null}
    </div>
  );
}

export default function EmbedSnippet({name, video}: {name: string; video?: string}): React.ReactNode {
  const path = useBaseUrl('/embed');
  const videoUrl = useBaseUrl(video ? `/${video}` : '/');
  return <BrowserOnly>{() => <Snippet name={name} path={path} videoUrl={video ? videoUrl : undefined} />}</BrowserOnly>;
}
