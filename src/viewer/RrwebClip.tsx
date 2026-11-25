// One tutorial step as a Remotion clip.
// For every frame: work out the moment in the recording -> ask rrweb to show the page at that moment
// -> draw our own smooth cursor on top, zoom the "camera" in around clicks, and show a caption.
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, getRemotionEnvironment, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Replayer } from "rrweb";
import "rrweb/dist/style.css";
import { realAt, tutorialAt } from "./time";
import type { Colors } from "./settings";
import type { Recording, Step } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const GLIDE = 650; // ms the cursor takes to travel to the next click

/**
 * Filmed recordings: the cursor rests where you last clicked, then glides to the next click
 * just before it happens. Times here are tutorial time (pauses already cut).
 */
const filmedCursorAt = (rec: Recording, s: Step, v: number) => {
  const p = rec.pointer ?? [];
  const before = p.filter((q) => q.t < s.start).at(-1);
  let from = before ?? { x: rec.viewport.width / 2, y: rec.viewport.height * 0.6 };
  let fromV = 0;
  for (const q of p) {
    if (q.t < s.start) continue;
    if (q.t > s.end) break;
    const qv = tutorialAt(s, q.t);
    if (v <= qv) {
      const k = interpolate(v, [Math.max(fromV, qv - GLIDE), qv], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
      return { x: from.x + (q.x - from.x) * k, y: from.y + (q.y - from.y) * k };
    }
    from = q;
    fromV = qv;
  }
  return from;
};

/** Robot recordings: cursor position at time t (ms), eased between recorded keyframes. */
const cursorAt = (rec: Recording, t: number) => {
  const c = rec.cursor!;
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

// Zoom: starts this long before a click, holds this long after it; clicks close together share one zoom.
// The step's last click usually shows its result somewhere else (a list, a toast) — zoom out quickly after it.
const ZOOM = { before: 900, after: 1300, afterLast: 300, in: 600, out: 700, merge: 900 };
const ease = (x: number) => Easing.inOut(Easing.cubic)(Math.min(1, Math.max(0, x)));

/** How far zoomed in (0..1) at tutorial time v, given the times of the clicks. */
const zoomAmount = (clickTimes: number[], v: number) => {
  const segs: { a: number; b: number }[] = [];
  const sorted = [...clickTimes].sort((x, y) => x - y);
  for (const [i, c] of sorted.entries()) {
    const a = c - ZOOM.before;
    const b = c + (i === sorted.length - 1 ? ZOOM.afterLast : ZOOM.after);
    const last = segs[segs.length - 1];
    if (last && a <= last.b + ZOOM.merge) last.b = b;
    else segs.push({ a, b });
  }
  const amount = segs.reduce((m, g) => Math.max(m, Math.min(ease((v - g.a) / ZOOM.in), ease((g.b - v) / ZOOM.out))), 0);
  return Math.min(amount, ease(v / ZOOM.in)); // every step starts zoomed out
};

/** The caption showing at tutorial time v (each shows from just before its action, for up to 3 s). */
const captionAt = (s: Step, v: number) => {
  const caps = (s.captions ?? [])
    .filter((c) => c.text && c.t >= s.start - 1 && c.t <= s.end)
    .map((c) => ({ v: tutorialAt(s, c.t), until: tutorialAt(s, c.until ?? c.t), text: c.text }));
  for (let i = 0; i < caps.length; i++) {
    const start = caps[i].v - 250;
    const end = Math.min(caps[i + 1] ? caps[i + 1].v - 250 : Infinity, Math.max(caps[i].v + 3000, caps[i].until + 1200));
    if (v >= start && v < end) return { text: caps[i].text, opacity: Math.min(ease((v - start) / 200), ease((end - v) / 200)) };
  }
  return null;
};

export type ClipProps = {
  rec: Recording;
  step: number;
  /** How far to zoom in around clicks, or false for no zoom. */
  zoom: number | false;
  /** Show captions ("Click “Save”"). */
  captions: boolean;
  colors: Colors;
};

export const RrwebClip: React.FC<ClipProps> = ({ rec, step, zoom, captions, colors }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const host = useRef<HTMLDivElement>(null);
  const replayer = useRef<Replayer | null>(null);
  const rendering = getRemotionEnvironment().isRendering;

  const s = rec.steps[step];
  const t0 = rec.events[0].timestamp;
  const v = (frame / fps) * 1000; // time in the tutorial
  const t = realAt(s, v); // the moment in the recording to show

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
      // We show each frame by pausing the replay at that moment, and rrweb freezes CSS animations
      // while paused — rows that fade in would stay invisible, spinners still. Keep them running.
      // (The id selector only raises specificity above rrweb's own rule.)
      insertStyleRules: [
        ".rrweb-paused *:not(#__tk), .rrweb-paused:not(#__tk) { animation-play-state: running !important; }",
        // Video export renders frames much slower than real time, so running animations would land at
        // random points. Skip them: every frame shows the finished state.
        ...(rendering
          ? [
              "*:not(#__tk), *:not(#__tk)::before, *:not(#__tk)::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }",
            ]
          : []),
      ],
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
    const r = replayer.current;
    r?.pause(t - t0);
    if (!rendering || !r) return;
    // Video export: wait for the page's images and fonts before this frame is taken.
    const h = delayRender("rrweb frame");
    const doc = r.iframe.contentDocument;
    const imgs = doc ? [...doc.images].filter((i) => !i.complete) : [];
    Promise.all([...imgs.map((i) => i.decode().catch(() => {})), doc?.fonts?.ready.catch(() => {})]).then(() =>
      requestAnimationFrame(() => continueRender(h)),
    );
  }, [t, t0, rendering]);

  const cursor = (vv: number) => (rec.cursor ? cursorAt(rec, realAt(s, vv)) : filmedCursorAt(rec, s, vv));
  const { x, y } = cursor(v);
  // Click times in tutorial time, for this step only.
  const clicks = rec.clicks.filter((c) => c >= s.start && c <= s.end).map((c) => tutorialAt(s, c));
  const pressed = clicks.some((c) => v >= c && v < c + 160);
  const fade = Math.min(interpolate(frame, [0, 6], [0, 1], clamp), interpolate(frame, [durationInFrames - 6, durationInFrames - 1], [1, 0], clamp));

  // Camera: zoom in around clicks, centred near the cursor, never past the page edges.
  const { width: W, height: H } = rec.viewport;
  // Zoom on clicks, and keep it for the whole time you're typing.
  const typedUntil = (s.captions ?? [])
    .filter((c) => c.until && c.t >= s.start && c.t <= s.end)
    .flatMap((c) => {
      const a = tutorialAt(s, c.t);
      const b = tutorialAt(s, Math.min(c.until!, s.end));
      return Array.from({ length: Math.floor((b - a) / 1000) + 2 }, (_, i) => Math.min(b, a + i * 1000));
    });
  const zoomOn = [...(rec.pointer ? rec.pointer.filter((q) => q.t >= s.start && q.t <= s.end).map((q) => tutorialAt(s, q.t)) : clicks), ...typedUntil];
  const z = zoom && zoom > 1 ? 1 + (zoom - 1) * zoomAmount(zoomOn, v) : 1;
  // Aim slightly ahead of the cursor, so zooming in shows where it's heading — not empty space on the way.
  const f = cursor(v + 500);
  const tx = Math.min(0, Math.max(W - W * z, W / 2 - f.x * z));
  const ty = Math.min(0, Math.max(H - H * z, H / 2 - f.y * z));

  const caption = captions ? captionAt(s, v) : null;

  return (
    <AbsoluteFill style={{ background: "#fff", opacity: fade, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        {/* rrweb draws the real recorded page in here */}
        <div ref={host} className="tk-host" style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden" }} />

        {/* click ripples */}
        {clicks.map((c) => {
          const dt = v - c;
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
                background: colors.click,
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
          <path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.3 L13 17 L21 17 Z" fill={colors.cursor} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>

      {/* caption — outside the camera, so it never zooms */}
      {caption && (
        <div className="tk-caption" style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", opacity: caption.opacity }}>
          <span
            style={{
              maxWidth: W * 0.8,
              background: colors.captionBg,
              color: colors.captionText,
              font: "600 26px/1.3 system-ui, -apple-system, 'Segoe UI', sans-serif",
              padding: "12px 24px",
              borderRadius: 14,
              boxShadow: "0 8px 30px rgba(0,0,0,.25)",
              transform: `translateY(${(1 - caption.opacity) * 8}px)`,
            }}
          >
            {caption.text}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
