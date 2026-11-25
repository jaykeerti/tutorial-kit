import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { FPS, TutorialVideo, loadRecording, videoFrames, type VideoProps } from "./TutorialVideo";

const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const rec = await loadRecording(props.name);
  const even = (n: number) => Math.round(n / 2) * 2; // MP4 needs even sizes
  return { durationInFrames: videoFrames(rec, props).total, width: even(rec.viewport.width), height: even(rec.viewport.height), fps: FPS };
};

const defaults: VideoProps = { name: "demo-filmed", title: "", description: "", cards: true };

export const Root: React.FC = () => (
  <Composition
    id="tutorial"
    component={TutorialVideo}
    defaultProps={defaults}
    calculateMetadata={calculateMetadata}
    durationInFrames={1}
    fps={FPS}
    width={1280}
    height={720}
  />
);
