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
const SPEEDS = [0.5, 1, 1.5, 2];
// Your chosen speed is remembered in this browser (ignored if storage is blocked).
const savedSpeed = () => {
  try {
    const n = Number(localStorage.getItem("tk-speed"));
    return SPEEDS.includes(n) ? n : 1;
  } catch {
    return 1;
  }
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
  const [playing, setPlaying] = useState(at === undefined);
  const [speed, setSpeed] = useState(savedSpeed);
  const playerRef = useRef<PlayerRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const viewW = rec?.viewport.width;

  // The page is drawn scaled down to fit; when the control bar shows, lift the caption above it.
  // The caption sits inside that scaled page, so the lift (bar height + a gap) is in page pixels.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !viewW) return;
    const ro = new ResizeObserver(() => el.style.setProperty("--tk-lift", `${Math.round(44 / Math.max(0.05, el.clientWidth / viewW))}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [viewW]);

  useEffect(() => {
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} loading ${src}`))))
      .then(setRec)
      .catch((e) => setError(String(e)));
  }, [src]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !rec) return;
    setProgress(p.getCurrentFrame() / Math.max(1, frames(rec, active) - 1));
    setPlaying(p.isPlaying() || startAt === undefined);
    const onFrame = (e: { detail: { frame: number } }) => setProgress(e.detail.frame / (frames(rec, active) - 1));
    const onEnded = () => setActive((a) => (a + 1) % rec.steps.length);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("ended", onEnded);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("ended", onEnded);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
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

  const total = frames(rec, active) / FPS;
  const nextSpeed = () => {
    const n = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(n);
    try {
      localStorage.setItem("tk-speed", String(n));
    } catch {}
  };
  const player = (
    <div ref={boxRef} className={playing ? "tk-player" : "tk-player tk-paused"}>
      <Player
        key={active}
        ref={playerRef}
        component={RrwebClip}
        inputProps={{ rec, step: active, zoom: settings.zoom, zoomPoints: zoom !== false, captions: settings.captions, colors: settings.colors }}
        durationInFrames={frames(rec, active)}
        fps={FPS}
        compositionWidth={rec.viewport.width}
        compositionHeight={rec.viewport.height}
        autoPlay={startAt === undefined}
        initialFrame={startAt === undefined ? 0 : Math.min(frames(rec, active) - 1, Math.max(0, Math.round((startAt / 1000) * FPS)))}
        playbackRate={speed}
        clickToPlay
        style={{ width: "100%" }}
      />
      {/* thin see-through control bar: shows on hover, and stays while paused */}
      <div className="tk-controls">
        <button type="button" className="tk-ctl" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} onClick={() => playerRef.current?.toggle()}>
          {playing ? (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.2v11.6a.8.8 0 0 0 1.2.7l9.4-5.8a.8.8 0 0 0 0-1.4L5.2 1.5A.8.8 0 0 0 4 2.2Z" fill="currentColor" /></svg>
          )}
        </button>
        <span className="tk-time">
          {clock(progress * total)} / {clock(total)}
        </span>
        <button type="button" className="tk-ctl tk-speed" aria-label={`Speed ${speed}×, click to change`} title="Speed" onClick={nextSpeed}>
          {speed}×
        </button>
      </div>
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
