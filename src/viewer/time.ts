// Tutorial time (what the viewer plays, pauses cut) <-> real time (when it happened in the recording).
import type { Step } from "./types";

/** Length of a step in the tutorial, ms. */
export const stepLength = (s: Step) => (s.timeline ? s.timeline[s.timeline.length - 1][0] : s.end - s.start);

const interp = (pts: [number, number][], x: number, from: 0 | 1, to: 0 | 1) => {
  if (x <= pts[0][from]) return pts[0][to];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (x <= b[from]) return b[from] === a[from] ? b[to] : a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return pts[pts.length - 1][to];
};

/** Tutorial ms -> real timestamp. */
export const realAt = (s: Step, v: number) => (s.timeline ? interp(s.timeline, v, 0, 1) : s.start + v);

/** Real timestamp -> tutorial ms. */
export const tutorialAt = (s: Step, t: number) => (s.timeline ? interp(s.timeline, t, 1, 0) : t - s.start);
