// "Film the person": record the page with rrweb while you click through it, then turn that
// session into a tutorial recording — split into steps, with long pauses cut out.
// Nothing is replayed, so nothing has to be found again.
import { fileURLToPath } from "node:url";
import { VIEWPORT, captionFor, collectAssets, createRecorderState, injectRecorder } from "./lib.mjs";

// Pacing of the finished tutorial (ms).
const PACE = {
  maxGap: 1000, // a pause longer than this (you deciding, a slow load) is shortened to this
  reaction: 8000, // page changes up to this long after your last action count as its result
  tail: 1500, // how long each step lingers after its last change
};

// rrweb event types / incremental sources we care about.
const META = 4;
const FULL = 2;
const INCR = 3;
const SRC = { mutation: 0, mouseMove: 1, mouseInteraction: 2, scroll: 3, input: 5, touchMove: 6, drag: 12 };

/** Start filming a page: rrweb + the action recorder (for steps, click positions and the editable script). */
export async function attachSession(page, { recordingFromStart, log, mask, maskInputs } = {}) {
  const events = [];
  await injectRecorder(page, (e) => events.push(e), { mask, maskInputs });
  const assets = collectAssets(page);
  const state = createRecorderState({ recordingFromStart, log });
  await page.exposeBinding("__tk_rec", (_s, msg) => state.handle(msg));
  await page.addInitScript({ path: fileURLToPath(new URL("./recorder-client.js", import.meta.url)) });
  return { events, assets, state };
}

/** Turn the filmed session into the JSON the viewer plays. Returns null if nothing was recorded. */
export async function buildRecording({ events, assets, state, source, settings, inline = true }) {
  const steps = state.steps();
  if (!steps.length || !events.length) return null;
  const all = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Start from the snapshot taken when you pressed Alt+R — everything before (logging in, finding
  // the page) is dropped. Component mode records from the very first snapshot.
  const t0 = state.startTs ?? all[0].timestamp;
  let from = 0;
  all.forEach((e, i) => {
    if (e.type === META && e.timestamp <= t0 + 1000) from = i;
  });
  // Your real mouse wanderings aren't needed (the viewer draws its own smooth cursor) — drop them.
  const kept = all.slice(from).filter((e) => !(e.type === INCR && [SRC.mouseMove, SRC.touchMove, SRC.drag].includes(e.data?.source)));
  const begin = Math.max(t0, kept[0].timestamp);

  // What counts as "something happening": your actions, plus the page's reaction to them.
  // (Page changes long after any action — a ticking clock, polling — don't keep the video running.)
  const actions = steps.flatMap((s) => s.actions);
  const userTimes = [
    ...actions.map((a) => a.ts),
    ...kept.filter((e) => e.type === INCR && [SRC.mouseInteraction, SRC.scroll, SRC.input].includes(e.data?.source)).map((e) => e.timestamp),
  ].sort((a, b) => a - b);
  const reacting = (t) => {
    // binary search for the last user action at or before t
    let lo = 0;
    let hi = userTimes.length - 1;
    let best = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (userTimes[m] <= t) (best = m), (lo = m + 1);
      else hi = m - 1;
    }
    return best >= 0 && t - userTimes[best] <= PACE.reaction;
  };
  const busy = [
    ...userTimes,
    ...kept.filter((e) => (e.type === FULL || (e.type === INCR && e.data?.source === SRC.mutation)) && reacting(e.timestamp)).map((e) => e.timestamp),
  ].sort((a, b) => a - b);

  // End a little after the last change (the viewer holds the final state from there).
  const lastBusy = busy.filter((t) => t >= begin).at(-1) ?? begin;
  const end = lastBusy + PACE.tail;

  const out = steps.map((s, i) => {
    const start = i === 0 ? begin : Math.max(begin, s.startTs ?? begin);
    const stop = i < steps.length - 1 ? Math.max(start, steps[i + 1].startTs ?? start) : Math.max(start, end);
    // One caption per action (same order as in the tutorial file, so they can be edited there).
    const captions = s.actions.map((a) => ({ t: a.ts, ...(a.tsEnd ? { until: a.tsEnd } : {}), text: captionFor(a) }));
    return { title: s.title, description: s.description, start, end: stop, timeline: timeline(start, stop, busy), captions };
  });

  // Where you clicked (for the smooth cursor), and when (for the ripples).
  const pointer = [...actions, ...state.points()]
    .filter((a) => a.at && a.ts >= begin)
    .sort((a, b) => a.ts - b.ts)
    .map((a) => ({ t: a.ts, x: Math.round(a.at.x), y: Math.round(a.at.y) }));
  const clicks = actions.filter((a) => a.action === "click").map((a) => a.ts);

  let eventsJson = JSON.stringify(kept);
  let inlined = 0;
  if (inline) ({ json: eventsJson, count: inlined } = await assets.inline(eventsJson));
  const doc = JSON.stringify({ viewport: VIEWPORT, source, mode: "filmed", ...(settings ? { settings } : {}), pointer, clicks, steps: out, events: "__EVENTS__" });
  return {
    json: doc.replace('"__EVENTS__"', () => eventsJson),
    info: { events: kept.length, steps: out.length, inlined, seconds: out.reduce((n, s) => n + s.timeline.at(-1)[0], 0) / 1000 },
  };
}

/**
 * Map "tutorial time" to "real time" for one step: play normally while something is happening,
 * and squeeze every quiet gap down to PACE.maxGap. Returned as [tutorialMs, realTimestamp] points;
 * the viewer interpolates between them.
 */
function timeline(start, end, busy) {
  const pts = [[0, start]];
  let v = 0;
  let prev = start;
  for (const t of [...busy.filter((t) => t > start && t < end), end]) {
    const gap = t - prev;
    if (gap <= 0) continue;
    if (gap > PACE.maxGap) {
      if (pts.at(-1)[1] !== prev) pts.push([v, prev]);
      v += PACE.maxGap;
      pts.push([v, t]);
    } else v += gap;
    prev = t;
  }
  if (pts.at(-1)[1] !== end) pts.push([v, end]);
  return pts.map(([a, b]) => [Math.round(a), b]);
}
