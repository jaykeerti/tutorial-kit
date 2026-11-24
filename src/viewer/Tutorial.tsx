// The reusable tutorial section: numbered step cards + player.
// Usage anywhere in a React app:  <Tutorial src="/recordings/ticket-form.json" />
import { Player, PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { RrwebClip } from "./RrwebClip";
import type { Recording } from "./types";
import "./Tutorial.css";

const FPS = 30;

export function Tutorial({ src }: { src: string }) {
  const [rec, setRec] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
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

  if (error) return <p className="tk-error">Couldn't load tutorial: {error}. Did you run <code>npm run capture</code>?</p>;
  if (!rec) return <div className="tk-loading">Loading tutorial…</div>;

  return (
    <section className="tk">
      <ol className="tk-steps">
        {rec.steps.map((s, i) => (
          <li key={i}>
            <button className={i === active ? "tk-step active" : "tk-step"} onClick={() => setActive(i)}>
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
      <div className="tk-player">
        <Player
          key={active}
          ref={playerRef}
          component={RrwebClip}
          inputProps={{ rec, step: active }}
          durationInFrames={frames(rec, active)}
          fps={FPS}
          compositionWidth={rec.viewport.width}
          compositionHeight={rec.viewport.height}
          autoPlay
          clickToPlay
          style={{ width: "100%" }}
        />
      </div>
    </section>
  );
}

const frames = (rec: Recording, i: number) => Math.max(1, Math.ceil(((rec.steps[i].end - rec.steps[i].start) / 1000) * FPS));
