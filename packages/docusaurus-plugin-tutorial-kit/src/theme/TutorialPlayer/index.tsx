// <TutorialPlayer name="my-guide" />: plays <recordings folder>/<name>.json, made with tutorial-kit.
// Also takes the player options: zoom, captions, colors, layout. Give src="/path/x.json" to play any file.
// Runs in the browser only (the player needs the DOM; the site's HTML is built in Node).
import React from "react";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { usePluginData } from "@docusaurus/useGlobalData";
import "../../player/docs.css";

type Props = {
  /** Guide name: <recordings folder>/<name>.json. Or give src instead. */
  name?: string;
  src?: string;
  zoom?: number | boolean;
  captions?: boolean;
  colors?: Record<string, string>;
  layout?: "side" | "stacked";
};

export default function TutorialPlayer({ name, src, layout = "stacked", ...options }: Props): React.ReactNode {
  const data = usePluginData("docusaurus-plugin-tutorial-kit") as { recordings?: string } | undefined;
  const url = useBaseUrl(src ?? `${data?.recordings ?? "/recordings"}/${name}.json`);
  return (
    <div className="tk-doc-player">
      <BrowserOnly fallback={<div className="tk-doc-placeholder">Loading guide…</div>}>
        {() => {
          // Loaded in the browser only.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { Tutorial } = require("../../player/Tutorial");
          return <Tutorial src={url} layout={layout} {...options} />;
        }}
      </BrowserOnly>
    </div>
  );
}
