// Just the player, for <iframe>s on other pages:  /embed?t=<name>
// Options in the address: &zoom=0 (no zoom), &captions=0 (no captions), &layout=side (cards beside the player).
import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Head from '@docusaurus/Head';
import useBaseUrl from '@docusaurus/useBaseUrl';

function Player({base}: {base: string}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {Tutorial} = require('@site/src/tutorial-kit/Tutorial');
  const q = new URLSearchParams(window.location.search);
  const name = q.get('t');
  if (!name) return <p style={{padding: 24}}>Add ?t=&lt;guide name&gt; to the address.</p>;
  return (
    <Tutorial
      src={`${base}${encodeURIComponent(name)}.json`}
      layout={q.get('layout') === 'side' ? 'side' : 'stacked'}
      {...(q.get('zoom') === '0' ? {zoom: false} : {})}
      {...(q.get('captions') === '0' ? {captions: false} : {})}
    />
  );
}

export default function Embed(): React.ReactNode {
  const base = useBaseUrl('/recordings/');
  return (
    <>
      <Head>
        <title>Guide</title>
        <meta name="robots" content="noindex" />
        <style>{'html, body { margin: 0; background: #fff; } body { padding: 8px; font-family: system-ui, sans-serif; }'}</style>
      </Head>
      <BrowserOnly fallback={<div />}>{() => <Player base={base} />}</BrowserOnly>
    </>
  );
}
