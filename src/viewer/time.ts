// Tutorial time (what the viewer plays, pauses cut) <-> real time (when it happened in the recording).
import type { Recording, Step } from "./types";


const interp = (pts: [number, number][], x: number, from: 0 | 1, to: 0 | 1) => {
  if (x <= pts[0][from]) return pts[0][to];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (x <= b[from]) return b[from] === a[from] ? b[to] : a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return pts[pts.length - 1][to];
};

type Line = [number, number][];
const lines = new WeakMap<Step, Line>();

/**
 * The step's timeline with your "speed" settings from the tutorial file worked in: each action plays
 * from when it happens until the next action at its own speed (else the step's, else normal).
 */
const line = (s: Step): Line => {
  let l = lines.get(s);
  if (l) return l;
  const base: Line = s.timeline ?? [
    [0, s.start],
    [s.end - s.start, s.end],
  ];
  const caps = (s.captions ?? []).filter((c) => c.t >= s.start && c.t <= s.end).sort((a, b) => a.t - b.t);
  const speedAt = (r: number) => {
    let c: (typeof caps)[number] | undefined;
    for (const x of caps) if (x.t <= r) c = x;
    return c?.speed ?? s.speed ?? 1;
  };
  const cuts = s.cuts ?? [];
  if (!s.speed && !caps.some((c) => c.speed) && !cuts.length) l = base;
  else {
    const reals = [...new Set([...base.map((p) => p[1]), ...caps.map((c) => c.t), ...cuts.flat()])].sort((a, b) => a - b);
    l = [[0, reals[0]]];
    for (let i = 1; i < reals.length; i++) {
      const dv = interp(base, reals[i], 1, 0) - interp(base, reals[i - 1], 1, 0);
      const mid = (reals[i - 1] + reals[i]) / 2;
      const cut = cuts.some(([a, b]) => mid > a && mid < b); // deleted actions take no time
      l.push([l[i - 1][0] + (cut ? 0 : dv / speedAt(reals[i - 1])), reals[i]]);
    }
  }
  lines.set(s, l);
  return l;
};

/** Is this moment inside a deleted action (cut out of the video)? */
export const isCut = (s: Step, t: number) => (s.cuts ?? []).some(([a, b]) => t >= a && t < b);

const shown = new WeakMap<Recording, Recording>();
/** The recording without its deleted steps — what the player, the video and the help site show. */
export const shownSteps = (rec: Recording): Recording => {
  if (!rec.steps.some((s) => s.deleted)) return rec;
  let r = shown.get(rec);
  if (!r) shown.set(rec, (r = { ...rec, steps: rec.steps.filter((s) => !s.deleted) }));
  return r;
};

/** Length of a step in the tutorial, ms. */
export const stepLength = (s: Step) => line(s)[line(s).length - 1][0];

/** Tutorial ms -> real timestamp. */
export const realAt = (s: Step, v: number) => interp(line(s), v, 0, 1);

/** Real timestamp -> tutorial ms. */
export const tutorialAt = (s: Step, t: number) => interp(line(s), t, 1, 0);
