// One tutorial step as a Remotion clip.
// For every frame: work out the moment in the recording -> ask rrweb to show the page at that moment
// -> draw our own smooth cursor on top.
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Replayer } from "rrweb";
import "rrweb/dist/style.css";
import type { Recording } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Cursor position at time t (ms), eased between recorded keyframes. */
const cursorAt = (rec: Recording, t: number) => {
  const c = rec.cursor;
  if (t <= c[0].t) return c[0];
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i];
    const b = c[i + 1];
    if (t <= b.t) {
      if (b.t === a.t) return b;
      const k = interpolate(t, [a.t, b.t], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  return c[c.length - 1];
};

export const RrwebClip: React.FC<{ rec: Recording; step: number }> = ({ rec, step }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const host = useRef<HTMLDivElement>(null);
  const replayer = useRef<Replayer | null>(null);

  const s = rec.steps[step];
  const t0 = rec.events[0].timestamp;
  const t = s.start + (frame / fps) * 1000; // absolute time in the recording

  // Build the rrweb replayer once per recording.
  useLayoutEffect(() => {
    const el = host.current!;
    const r = new Replayer(rec.events, {
      root: el,
      skipInactive: false,
      showWarning: false,
      showDebug: false,
      mouseTail: false,
      triggerFocus: true,
    });
    replayer.current = r;
    return () => {
      r.destroy();
      replayer.current = null;
      el.innerHTML = "";
    };
  }, [rec]);

  // Every frame: jump the replay to exactly this moment.
  useLayoutEffect(() => {
    replayer.current?.pause(t - t0);
  }, [t, t0]);

  const { x, y } = cursorAt(rec, t);
  const pressed = rec.clicks.some((c) => t >= c && t < c + 160);
  const fade = Math.min(interpolate(frame, [0, 6], [0, 1], clamp), interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], clamp));

  return (
    <AbsoluteFill style={{ background: "#fff", opacity: fade }}>
      {/* rrweb draws the real recorded page in here */}
      <div ref={host} className="tk-host" style={{ position: "absolute", left: 0, top: 0, width: rec.viewport.width, height: rec.viewport.height, overflow: "hidden" }} />

      {/* click ripples */}
      {rec.clicks.map((c) => {
        const dt = t - c;
        if (dt < 0 || dt > 550) return null;
        return (
          <div
            key={c}
            style={{
              position: "absolute",
              left: x - 24,
              top: y - 24,
              width: 48,
              height: 48,
              borderRadius: 24,
              background: "#7c3aed",
              opacity: interpolate(dt, [0, 550], [0.45, 0]),
              transform: `scale(${interpolate(dt, [0, 550], [0.3, 1.7])})`,
            }}
          />
        );
      })}

      {/* our own cursor */}
      <svg
        width="28"
        height="32"
        viewBox="0 0 26 30"
        style={{ position: "absolute", left: x - 3, top: y - 2, transform: `scale(${pressed ? 0.85 : 1})`, transformOrigin: "3px 2px", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))" }}
      >
        <path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.3 L13 17 L21 17 Z" fill="#111" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};
