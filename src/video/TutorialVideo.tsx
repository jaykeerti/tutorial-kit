// The whole tutorial as one video: an intro card, then for each step a short title card and the clip.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Easing, Series, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { RrwebClip } from "../viewer/RrwebClip";
import { resolveSettings, type Colors } from "../viewer/settings";
import { shownSteps, stepLength } from "../viewer/time";
import type { Recording } from "../viewer/types";

export const FPS = 30;
const INTRO = 75; // frames (2.5 s)
const CARD = 45; // frames (1.5 s) before each step

export type VideoProps = {
  /** Recording name: recordings/<name>.json in the bundle's public folder. */
  name: string;
  title: string;
  description: string;
  /** Title cards (intro + one before each step). */
  cards: boolean;
  zoom?: number | boolean;
  captions?: boolean;
  /** "Step 2 of 3 · title" in the top-left corner while each step plays (default on). */
  stepLabel?: boolean;
};

const cache = new Map<string, Promise<Recording>>();
export const loadRecording = (name: string) => {
  if (!cache.has(name))
    cache.set(
      name,
      fetch(staticFile(`recordings/${name}.json`))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} loading ${name}`))))
        .then((r: Recording) => shownSteps(r)), // deleted steps aren't in the video
    );
  return cache.get(name)!;
};

const clipFrames = (rec: Recording, i: number) => Math.max(1, Math.ceil((stepLength(rec.steps[i]) / 1000) * FPS));
export const videoFrames = (rec: Recording, p: Pick<VideoProps, "cards">) => {
  const steps = rec.steps.map((_, i) => clipFrames(rec, i));
  return { steps, total: Math.max(1, (p.cards ? INTRO + CARD * steps.length : 0) + steps.reduce((a, b) => a + b, 0)) };
};

const ease = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** "● Step 2 of 3 · Set priority" in the top-left corner: outside the camera, so it never zooms. */
const StepLabel: React.FC<{ n: number; of: number; title: string; colors: Colors }> = ({ n, of, title, colors }) => {
  const f = useCurrentFrame();
  const { durationInFrames: d, width } = useVideoConfig();
  const s = width / 1280;
  const o = Math.min(interpolate(f, [4, 14], [0, 1], { ...clamp, easing: ease }), interpolate(f, [d - 8, d - 1], [1, 0], clamp));
  return (
    <div
      style={{
        position: "absolute",
        left: 20 * s,
        top: 20 * s,
        maxWidth: "60%",
        display: "flex",
        alignItems: "center",
        gap: 10 * s,
        padding: `${8 * s}px ${16 * s}px ${8 * s}px ${12 * s}px`,
        borderRadius: 999,
        background: "rgba(17, 17, 27, 0.72)",
        boxShadow: `0 ${4 * s}px ${16 * s}px rgba(0, 0, 0, .2)`,
        color: "#fff",
        font: `600 ${18 * s}px/1.25 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
        opacity: o,
        transform: `translateY(${(1 - o) * -6 * s}px)`,
      }}
    >
      <span style={{ flex: "none", width: 10 * s, height: 10 * s, borderRadius: "50%", background: colors.accent, boxShadow: `0 0 0 ${3 * s}px rgba(255,255,255,.25)` }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {of > 1 ? (
          <>
            <span style={{ opacity: 0.75 }}>
              Step {n} of {of}
            </span>
            {title ? " · " : ""}
          </>
        ) : null}
        {title}
      </span>
    </div>
  );
};

const Card: React.FC<{ kicker: string; title: string; text?: string; colors: Colors }> = ({ kicker, title, text, colors }) => {
  const f = useCurrentFrame();
  const { durationInFrames: d, width } = useVideoConfig();
  const inn = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: ease });
  const out = interpolate(f, [d - 8, d - 1], [1, 0], clamp);
  const s = width / 1280; // scale the type with the video size
  return (
    <AbsoluteFill
      style={{ background: "#fff", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", opacity: out }}
    >
      <div style={{ textAlign: "center", maxWidth: "75%", opacity: inn, transform: `translateY(${(1 - inn) * 16}px)` }}>
        <div style={{ color: colors.accent, fontWeight: 800, fontSize: 22 * s, letterSpacing: 2 * s, textTransform: "uppercase" }}>{kicker}</div>
        <div style={{ color: "#111827", fontWeight: 800, fontSize: 54 * s, lineHeight: 1.15, marginTop: 14 * s }}>{title}</div>
        {text ? <div style={{ color: "#6b7280", fontSize: 26 * s, lineHeight: 1.4, marginTop: 18 * s }}>{text}</div> : null}
        <div style={{ height: 6 * s, width: 90 * s, background: colors.accent, borderRadius: 3 * s, margin: `${28 * s}px auto 0`, transform: `scaleX(${inn})` }} />
      </div>
    </AbsoluteFill>
  );
};

export const TutorialVideo: React.FC<VideoProps> = (props) => {
  const [rec, setRec] = useState<Recording | null>(null);
  const [handle] = useState(() => delayRender("Loading recording"));
  useEffect(() => {
    loadRecording(props.name).then((r) => {
      setRec(r);
      continueRender(handle);
    });
  }, [props.name, handle]);
  if (!rec) return null;

  const settings = resolveSettings(rec.settings, { zoom: props.zoom, captions: props.captions });
  const { steps } = videoFrames(rec, props);
  const plural = rec.steps.length === 1 ? "" : "s";
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      {/* rrweb's own mouse is hidden; the clip draws a smooth cursor */}
      <style>{".tk-host .replayer-mouse, .tk-host .replayer-mouse-tail { display: none !important; }"}</style>
      <Series>
        {props.cards ? (
          <Series.Sequence durationInFrames={INTRO}>
            <Card kicker={`${rec.steps.length} step${plural}`} title={props.title || props.name} text={props.description} colors={settings.colors} />
          </Series.Sequence>
        ) : null}
        {rec.steps.flatMap((s, i) => [
          ...(props.cards
            ? [
                <Series.Sequence key={`c${i}`} durationInFrames={CARD}>
                  <Card kicker={`Step ${i + 1}`} title={s.title} text={s.description} colors={settings.colors} />
                </Series.Sequence>,
              ]
            : []),
          <Series.Sequence key={`s${i}`} durationInFrames={steps[i]}>
            <RrwebClip rec={rec} step={i} zoom={settings.zoom} zoomPoints={props.zoom !== false} captions={settings.captions} colors={settings.colors} />
            {props.stepLabel !== false && (s.title || rec.steps.length > 1) ? <StepLabel n={i + 1} of={rec.steps.length} title={s.title} colors={settings.colors} /> : null}
          </Series.Sequence>,
        ])}
      </Series>
    </AbsoluteFill>
  );
};
