// The reusable tutorial section: numbered step cards + player.
// Usage anywhere in a React app:  <Tutorial src="/recordings/ticket-form.json" />
import { Player, PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { RrwebClip } from "./RrwebClip";
import { resolveSettings, type Colors } from "./settings";
import { stepLength } from "./time";
import type { Recording } from "./types";
import "./Tutorial.css";

const FPS = 30;

type TutorialProps = {
  /** The recording JSON. */
  src: string;
  /** Zoom around clicks: false = off, true = default (1.8), or a level like 1.5. Overrides the tutorial file. */
  zoom?: number | boolean;
  /** Captions on/off. Overrides the tutorial file. */
  captions?: boolean;
  /** Colors (accent, click, cursor, captionBg, captionText). Overrides the tutorial file. */
  colors?: Partial<Colors>;
  /** "side" = step cards left of the player (default); "stacked" = player on top, step cards in a row below (narrow columns, docs pages). */
  layout?: "side" | "stacked";
  /** Step to show first (0 = the first step). */
  step?: number;
  /** Open paused this many ms into that step, instead of playing (deep links, tests). */
  at?: number;
};

export function Tutorial({ src, zoom, captions, colors, layout = "side", step = 0, at }: TutorialProps) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(step);
  const [startAt, setStartAt] = useState(at); // cleared once you pick a step
  const [progress, setProgress] = useState(0);
  const playerRef = useRef<PlayerRef>(null);

  useEffect(() => {
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} loading ${src}`))))
      .then(setRec)
      .catch((e) => setError(String(e)));
  }, [src]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !rec) return;
    setProgress(0);
    const onFrame = (e: { detail: { frame: number } }) => setProgress(e.detail.frame / (frames(rec, active) - 1));
    const onEnded = () => setActive((a) => (a + 1) % rec.steps.length);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("ended", onEnded);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("ended", onEnded);
    };
  }, [active, rec]);

  if (error) return <p className="tk-error">Couldn't load tutorial: {error}. Did you run <code>npm run record</code>?</p>;
  if (!rec) return <div className="tk-loading">Loading tutorial…</div>;
  if (active >= rec.steps.length) {
    setActive(0);
    return null;
  }

  // Props win over the tutorial file's settings, which win over the defaults.
  const settings = resolveSettings(rec.settings, { zoom, captions, colors });

  const steps = (
    <ol className="tk-steps">
      {rec.steps.map((s, i) => (
        <li key={i}>
          <button className={i === active ? "tk-step active" : "tk-step"} onClick={() => {
              setStartAt(undefined);
              setActive(i);
            }}>
            <span className="tk-num">{String(i + 1).padStart(2, "0")}</span>
            <span className="tk-text">
              <strong>{s.title}</strong>
              <span>{s.description}</span>
            </span>
            <span className="tk-bar">
              <span style={{ transform: `scaleX(${i === active ? progress : i < active ? 1 : 0})` }} />
            </span>
          </button>
        </li>
      ))}
    </ol>
  );

  const player = (
    <div className="tk-player">
      <Player
        key={active}
        ref={playerRef}
        component={RrwebClip}
        inputProps={{ rec, step: active, zoom: settings.zoom, captions: settings.captions, colors: settings.colors }}
        durationInFrames={frames(rec, active)}
        fps={FPS}
        compositionWidth={rec.viewport.width}
        compositionHeight={rec.viewport.height}
        autoPlay={startAt === undefined}
        initialFrame={startAt === undefined ? 0 : Math.min(frames(rec, active) - 1, Math.max(0, Math.round((startAt / 1000) * FPS)))}
        clickToPlay
        style={{ width: "100%" }}
      />
    </div>
  );

  return (
    <section className={layout === "stacked" ? "tk tk-stacked" : "tk"} style={{ ["--tk-accent" as string]: settings.colors.accent }}>
      {layout === "stacked" ? (
        <>
          {player}
          {steps}
        </>
      ) : (
        <>
          {steps}
          {player}
        </>
      )}
    </section>
  );
}

const frames = (rec: Recording, i: number) => Math.max(1, Math.ceil((stepLength(rec.steps[i]) / 1000) * FPS));
