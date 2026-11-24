// The tutorial player for docs pages:  <TutorialPlayer name="crs-tutorial" />
// Also takes the player options: zoom, captions, colors, layout.
// Runs in the browser only (the player needs the DOM; the site's static HTML is built in Node).
import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import useBaseUrl from '@docusaurus/useBaseUrl';

type Props = {
  /** Tutorial name (static/recordings/<name>.json), or give src instead. */
  name?: string;
  src?: string;
  zoom?: number | boolean;
  captions?: boolean;
  colors?: Record<string, string>;
  layout?: 'side' | 'stacked';
};

export default function TutorialPlayer({name, src, layout = 'stacked', ...options}: Props): React.ReactNode {
  const url = useBaseUrl(src ?? `/recordings/${name}.json`);
  return (
    <div className="tk-doc-player">
      <BrowserOnly fallback={<div className="tk-doc-placeholder">Loading guide…</div>}>
        {() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const {Tutorial} = require('@site/src/tutorial-kit/Tutorial');
          return <Tutorial src={url} layout={layout} {...options} />;
        }}
      </BrowserOnly>
    </div>
  );
}
