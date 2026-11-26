// The tutorial file -> recording rules, with no file access: used by npm run titles / docs / export
// (through apply.mjs) and by the editor page in the browser, so its preview matches exactly.

/**
 * Look-and-feel settings written into each tutorial file (edit, then `npm run titles`).
 * Keep in step with DEFAULT_SETTINGS in src/viewer/settings.ts.
 */
export const DEFAULT_SETTINGS = {
  zoom: 1.8,
  captions: true,
  colors: { accent: "#7c3aed", click: "#7c3aed", cursor: "#111111", captionBg: "rgba(17, 17, 27, 0.86)", captionText: "#ffffff" },
};

/** Check settings from a tutorial file; returns { settings, problems }. Unknown or invalid values are dropped. */
export function checkSettings(input) {
  const problems = [];
  const settings = {};
  if (input == null) return { settings, problems };
  if (typeof input !== "object") return { settings, problems: ['"settings" should be an object'] };
  for (const k of Object.keys(input)) if (!["zoom", "captions", "colors"].includes(k)) problems.push(`unknown setting "${k}" (ignored)`);
  if ("zoom" in input) {
    const z = input.zoom;
    if (z === true || z === false || (typeof z === "number" && z >= 1 && z <= 4)) settings.zoom = z === 1 ? false : z;
    else if (z === 0 || z === null || z === "false" || z === "off" || z === "none") settings.zoom = false;
    else problems.push(`"zoom" should be true, false or a number from 1 to 4 (got ${JSON.stringify(z)}) — ignored, so zoom stays on`);
  }
  if ("captions" in input) {
    if (typeof input.captions === "boolean") settings.captions = input.captions;
    else problems.push(`"captions" should be true or false`);
  }
  if ("colors" in input) {
    settings.colors = {};
    for (const [k, v] of Object.entries(input.colors || {})) {
      if (!(k in DEFAULT_SETTINGS.colors)) problems.push(`unknown color "${k}" — use ${Object.keys(DEFAULT_SETTINGS.colors).join(", ")}`);
      else if (typeof v !== "string" || !v.trim()) problems.push(`color "${k}" should be a CSS color like "#2563eb"`);
      else settings.colors[k] = v.trim();
    }
  }
  return { settings, problems };
}

/** A step's or action's "zoom": true / false (also "on"/"off", 1/0). undefined = not set. */
export function onOff(v, where, warn) {
  if (v === undefined || v === null) return undefined;
  if (v === true || v === "true" || v === "on" || v === "yes" || v === 1) return true;
  if (v === false || v === "false" || v === "off" || v === "no" || v === 0) return false;
  if (typeof v === "number" && v > 1) {
    warn(`⚠ ${where}: "zoom" here is on/off only — using on (the level comes from "settings")`);
    return true;
  }
  warn(`⚠ ${where}: "zoom" should be true or false (got ${JSON.stringify(v)}) — ignored`);
  return undefined;
}

/** A step's or action's "speed": 0.25 to 8 (2 = twice as fast, 0.5 = half speed). undefined = not set.
 *  (1 is kept: on an action it means "normal speed here", even in a faster step.) */
export function speedOf(v, where, warn) {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === "string" ? Number(v.replace(/x$/i, "")) : v;
  if (typeof n === "number" && n >= 0.25 && n <= 8) return n;
  warn(`⚠ ${where}: "speed" should be a number from 0.25 to 8, like 2 for twice as fast (got ${JSON.stringify(v)}) — ignored`);
  return undefined;
}

/**
 * Apply a tutorial file (script) to a recording. Returns a new recording; the original isn't changed
 * and the (large) events list is shared, not copied.
 */
export function applyScript(rec0, script, warn = () => {}, label = "the tutorial file") {
  const rec = { ...rec0, steps: rec0.steps.map((s) => ({ ...s, captions: (s.captions ?? []).map((c) => ({ ...c })) })) };
  const steps = script.steps ?? [];
  if (steps.length !== rec.steps.length) {
    warn(`⚠ ${label} has ${steps.length} steps but the recording has ${rec.steps.length} — matching them in order.`);
  }
  rec.steps.forEach((s, i) => {
    const from = steps[i];
    if (!from) return;
    s.title = from.title ?? s.title;
    s.description = from.description ?? "";
    // Zoom on/off for the whole step, or for one action ("zoom": false / true).
    const step = onOff(from.zoom, `step ${i + 1}`, warn);
    if (step === undefined) delete s.zoom;
    else s.zoom = step;
    // Speed for the whole step, or from one action until the next ("speed": 2 = twice as fast).
    const sp = speedOf(from.speed, `step ${i + 1}`, warn);
    if (sp === undefined) delete s.speed;
    else s.speed = sp;
    // Captions: matched to the actions in order. Set "caption": "" to hide one.
    s.captions.forEach((c, j) => {
      const a = from.actions?.[j];
      if (a && typeof a.caption === "string") c.text = a.caption;
      const z = onOff(a?.zoom, `step ${i + 1}, action ${j + 1}`, warn);
      if (z === undefined) delete c.zoom;
      else c.zoom = z;
      const v = speedOf(a?.speed, `step ${i + 1}, action ${j + 1}`, warn);
      if (v === undefined) delete c.speed;
      else c.speed = v;
    });
  });
  // Settings: zoom, captions, colors.
  // Also accepted at the top of the file, next to "title" (an easy slip) — and then it wins over
  // the "settings" block, since you most likely added it on purpose.
  const loose = Object.fromEntries(["zoom", "captions", "colors"].filter((k) => k in script).map((k) => [k, script[k]]));
  const { settings, problems } = checkSettings(Object.keys(loose).length ? { ...script.settings, ...loose } : script.settings);
  for (const p of problems) warn(`⚠ settings: ${p}`);
  if (Object.keys(settings).length) rec.settings = settings;
  else delete rec.settings;
  return rec;
}
