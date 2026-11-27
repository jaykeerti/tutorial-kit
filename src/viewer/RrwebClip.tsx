// One tutorial step as a Remotion clip.
// For every frame: work out the moment in the recording -> ask rrweb to show the page at that moment
// -> draw our own smooth cursor on top, zoom the "camera" in around clicks, and show a caption.
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender, getRemotionEnvironment, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Replayer } from "rrweb";
import "rrweb/dist/style.css";
import { realAt, tutorialAt } from "./time";
import { captionAt, clamp, cursorAt, filmedCursorAt, zoomAmount } from "./motion";
import { DEFAULT_SETTINGS, type Colors } from "./settings";
import type { Recording } from "./types";

export type ClipProps = {
  rec: Recording;
  step: number;
  /** How far to zoom in around clicks, or false for no zoom. */
  zoom: number | false;
  /** Follow the tutorial file's per-step / per-action zoom on/off (default). false = use zoom as is everywhere. */
  zoomPoints?: boolean;
  /** Show captions ("Click “Save”"). */
  captions: boolean;
  colors: Colors;
};

export const RrwebClip: React.FC<ClipProps> = ({ rec, step, zoom, zoomPoints = true, captions, colors }) => {
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
    // Only a new recording needs a new replayer — not edits to titles, captions or settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.events]);

  // Every frame: jump the replay to exactly this moment.
  useLayoutEffect(() => {
    const r = replayer.current;
    // rrweb focuses the recorded fields (so typing looks real), and focusing anything inside the replay
    // takes keyboard focus away from the page around it — you couldn't type in the editor or a search
    // box while a tutorial plays. Hand focus straight back (the caret stays where it was).
    // Only for a field you're typing in (not a button you just clicked), and never in video export,
    // so the replayed page still shows its focused field and caret.
    const had = document.activeElement as HTMLElement | null;
    const typing = !rendering && !!had && (had.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(had.tagName)) && !host.current?.contains(had);
    r?.pause(t - t0);
    if (typing && had !== document.activeElement && had!.isConnected) had!.focus({ preventScroll: true });
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
  // Which actions zoom: the action's own on/off, else its step's, else the tutorial's setting.
  const caps = (s.captions ?? []).filter((c) => c.t >= s.start && c.t <= s.end);
  const zoomsAt = (c?: { zoom?: boolean }) => (zoomPoints ? (c?.zoom ?? s.zoom ?? zoom !== false) : zoom !== false);
  // A click that isn't an action itself (into a field before typing) goes with the action after it.
  const ownerOf = (t: number) => caps.find((c) => c.t >= t) ?? caps.at(-1);
  const level = zoom || (DEFAULT_SETTINGS.zoom as number); // turned on for one action while off overall: default level
  // Zoom on clicks, and keep it for the whole time you're typing.
  const typedUntil = caps
    .filter((c) => c.until && zoomsAt(c))
    .flatMap((c) => {
      const a = tutorialAt(s, c.t);
      const b = tutorialAt(s, Math.min(c.until!, s.end));
      return Array.from({ length: Math.floor((b - a) / 1000) + 2 }, (_, i) => Math.min(b, a + i * 1000));
    });
  const clickTimes = rec.pointer ? rec.pointer.filter((q) => q.t >= s.start && q.t <= s.end).map((q) => q.t) : rec.clicks.filter((c) => c >= s.start && c <= s.end);
  const zoomOn = [...clickTimes.filter((t) => zoomsAt(ownerOf(t))).map((t) => tutorialAt(s, t)), ...typedUntil];
  const z = level > 1 && zoomOn.length ? 1 + (level - 1) * zoomAmount(zoomOn, v) : 1;
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
