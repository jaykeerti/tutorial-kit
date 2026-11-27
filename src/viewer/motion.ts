// What the player shows at each moment: where the cursor is, how far zoomed in, which caption.
// Plain functions of time (no rendering), so they behave the same on every machine and are tested directly.
import { Easing, interpolate } from "remotion";
import { isCut, tutorialAt } from "./time";
import type { Recording, Step } from "./types";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const GLIDE = 650; // ms the cursor takes to travel to the next click

/**
 * Filmed recordings: the cursor rests where you last clicked, then glides to the next click
 * just before it happens. Times here are tutorial time (pauses already cut).
 */
export const filmedCursorAt = (rec: Recording, s: Step, v: number) => {
  const p = rec.pointer ?? [];
  const before = p.filter((q) => q.t < s.start).at(-1);
  let from = before ?? { x: rec.viewport.width / 2, y: rec.viewport.height * 0.6 };
  let fromV = 0;
  for (const q of p) {
    if (q.t < s.start || isCut(s, q.t)) continue; // deleted actions' clicks: glide straight past them
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
export const cursorAt = (rec: Recording, t: number) => {
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
export const ZOOM = { before: 900, after: 1300, afterLast: 300, in: 600, out: 700, merge: 900 };
const ease = (x: number) => Easing.inOut(Easing.cubic)(Math.min(1, Math.max(0, x)));

/** How far zoomed in (0..1) at tutorial time v, given the times of the clicks. */
export const zoomAmount = (clickTimes: number[], v: number) => {
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
export const captionAt = (s: Step, v: number) => {
  const caps = (s.captions ?? [])
    .filter((c) => c.text && !c.deleted && c.t >= s.start - 1 && c.t <= s.end)
    .map((c) => ({ v: tutorialAt(s, c.t), until: tutorialAt(s, c.until ?? c.t), text: c.text }));
  for (let i = 0; i < caps.length; i++) {
    const start = caps[i].v - 250;
    const end = Math.min(caps[i + 1] ? caps[i + 1].v - 250 : Infinity, Math.max(caps[i].v + 3000, caps[i].until + 1200));
    if (v >= start && v < end) return { text: caps[i].text, opacity: Math.min(ease((v - start) / 200), ease((end - v) / 200)) };
  }
  return null;
};
