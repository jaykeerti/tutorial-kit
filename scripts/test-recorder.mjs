// npm run test:recorder
// End-to-end self-test: records the fixtures in src/components with a real mouse/keyboard,
// checks what the recorder wrote, then runs capture on the result and checks the recording.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { createRecorderState, openTarget, scriptSteps, settle } from "./lib.mjs";
import { attachSession, buildRecording } from "./session.mjs";

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed++;
};
const section = (t) => console.log(`\n— ${t} —`);

// Every command at least loads (catches mistakes in scripts the tests below don't run, like record.mjs).
section("Scripts load");
{
  const { spawnSync } = await import("node:child_process");
  const bad = fs
    .readdirSync("scripts")
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => spawnSync(process.execPath, ["--check", `scripts/${f}`]).status !== 0);
  check(bad.length === 0, `all scripts have valid syntax${bad.length ? ` — broken: ${bad.join(", ")}` : ""}`);
}
const temp = [];
const writeTutorial = (name, obj) => {
  const f = `tutorials/${name}.tutorial.json`;
  fs.writeFileSync(f, JSON.stringify(obj, null, 2));
  temp.push(f, `public/recordings/${name}.json`, `capture-failed-${name}.png`);
};
// Async on purpose: the expired-login test serves the app from this process, so it must not block.
const capture = (name, ...flags) =>
  new Promise((resolve) => {
    let out = "";
    const p = spawn(process.execPath, ["scripts/capture.mjs", name, ...flags]);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => resolve({ ok: code === 0, out }));
  });

/** Open a fixture with the recorder attached. */
const openRecorder = async (component, port) => {
  const logs = [];
  const state = createRecorderState({ recordingFromStart: true, log: (...a) => logs.push(a.join(" ")) });
  const t = await openTarget({ component, headless: true, port });
  await t.page.exposeBinding("__tk_rec", (_s, m) => state.handle(m));
  await t.page.addInitScript({ path: fileURLToPath(new URL("./recorder-client.js", import.meta.url)) });
  await settle(t.page, t.pageUrl);
  // Like a person: move, press, release — real mouse events.
  const humanClick = async (locator) => {
    const b = await locator.boundingBox();
    await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await t.page.mouse.down();
    await t.page.mouse.up();
    await t.page.waitForTimeout(150);
  };
  return { ...t, state, logs, humanClick };
};

const actionsOf = (state) => state.steps().flatMap((s) => s.actions);

try {
  // ---------------------------------------------------------------------------------------
  section("MUI-style dropdown (opens on mousedown, hidden * in label)");
  {
    const r = await openRecorder("SelectDemo", 5183);
    await r.page.mouse.click(600, 600); // empty space — ignored
    await r.humanClick(r.page.locator("#env-select"));
    await r.humanClick(r.page.getByRole("option", { name: "Production" }));
    await r.humanClick(r.page.getByRole("button", { name: "Save" }));
    // Autocomplete: click into the text box to open the list, pick an option without typing.
    await r.humanClick(r.page.locator("#site"));
    await r.humanClick(r.page.getByRole("option", { name: "AAG" }));
    await r.page.waitForTimeout(200);
    const acts = actionsOf(r.state);
    check(acts.length === 5, `5 actions recorded, empty-space click ignored (got ${acts.length})`);
    check(acts[0]?.target?.role === "combobox" && acts[0]?.target?.name === "Environment", "dropdown recorded as combobox 'Environment' (no *, no value)");
    check(acts[1]?.target?.role === "option" && acts[1]?.target?.name === "Production", "option recorded as 'Production'");
    check(acts[3]?.action === "click" && JSON.stringify(acts[3]).includes("Site"), "click that opens an autocomplete is recorded");
    check(acts[4]?.target?.name === "AAG", "autocomplete option 'AAG' recorded");
    await r.close();

    writeTutorial("_select", { component: "SelectDemo", steps: [{ title: "Pick", description: "", actions: acts }] });
    const c1 = await capture("_select");
    const rec1 = fs.existsSync("public/recordings/_select.json") ? fs.readFileSync("public/recordings/_select.json", "utf8") : "";
    check(c1.ok && rec1.includes("Saved: Production") && rec1.includes("Site: AAG"), "replay picks Production and the autocomplete option AAG");
    if (!c1.ok) console.log(c1.out);

    writeTutorial("_old", {
      component: "SelectDemo",
      steps: [{ title: "Old-style target", description: "", actions: [
        { action: "click", target: { role: "combobox", name: "Environment *" } },
        { action: "click", target: { text: "Production", exact: true } },
        { action: "click", target: { role: "button", name: "Save", exact: true } },
      ] }],
    });
    const c = await capture("_old");
    check(c.ok, "capture copes with an old recording that has 'Environment *'");
  }

  // ---------------------------------------------------------------------------------------
  section("Real-app patterns: dialog, duplicate buttons, select, checkbox, Enter, spinner");
  let benchActions;
  {
    const r = await openRecorder("TestBench", 5184);
    const p = r.page;
    await r.humanClick(p.getByRole("button", { name: "Add part" }));
    await r.humanClick(p.getByLabel("Part name"));
    await p.keyboard.type("Widget", { delay: 20 });
    await p.selectOption("#category", { label: "Nuts" });
    await r.humanClick(p.getByText("Urgent"));
    await r.humanClick(p.getByRole("dialog").getByRole("button", { name: "Submit" }));
    await p.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    await r.humanClick(p.getByLabel("Search"));
    await p.keyboard.type("nuts", { delay: 20 });
    await p.keyboard.press("Enter");
    await r.humanClick(p.getByRole("button", { name: "Submit" }));
    await p.waitForTimeout(200);

    const acts = actionsOf(r.state);
    benchActions = acts;
    const kinds = acts.map((a) => a.action).join(",");
    check(kinds === "click,type,select,click,click,type,press,click", `actions in order: ${kinds}`);
    check(acts[1]?.target?.label === "Part name" && acts[1]?.text === "Widget", "typed 'Widget' into 'Part name' (no *), merged into one action");
    check(acts[2]?.value === "Nuts", "native <select> recorded as select 'Nuts'");
    check(acts.filter((a) => a.action === "click" && JSON.stringify(a).includes("Urgent")).length === 1, "checkbox label click recorded once (no double click)");
    check(acts[4]?.within?.role === "dialog" && acts[4]?.within?.name === "Add part", "dialog Submit is scoped to the 'Add part' dialog");
    check(!acts[7]?.within, "page Submit is not scoped");
    check(acts[6]?.key === "Enter" && acts[6]?.target?.label === "Search", "Enter in Search recorded");
    check(acts.every((a) => a.alts?.length), "every action has fallback ways to find its element");

    await r.close();
  }

  {
    const acts = JSON.parse(JSON.stringify(benchActions));
    acts[1].text = "Widget {{time}}";
    writeTutorial("_bench", {
      component: "TestBench",
      mask: [],
      steps: [
        { title: "Add a part", description: "", actions: acts.slice(0, 5) },
        { title: "Search and submit", description: "", actions: acts.slice(5) },
      ],
    });
    const c = await capture("_bench", "--safe");
    check(c.ok, "capture replays the whole TestBench recording (--safe)");
    if (!c.ok) console.log(c.out);
    const rec = fs.existsSync("public/recordings/_bench.json") ? fs.readFileSync("public/recordings/_bench.json", "utf8") : "";
    check(/Widget \d{6}/.test(rec), "{{time}} was replaced by the current time");
    check(rec.includes("Saved (200)"), "safe mode answered the POST with a fake 200 (nothing sent)");
    check(rec.includes("Page submits: 1") && rec.includes("Nuts · urgent"), "dialog Submit and page Submit each clicked the right button");
    check(rec.includes("Searched: nuts"), "Enter key replayed");
    check(rec.includes("data:image/svg+xml;base64"), "image embedded in the recording");
    check(!rec.includes("jane.doe@example.com"), "data-private text masked");
    check(c.out.includes("Blocked"), "capture reports blocked requests");
  }

  // ---------------------------------------------------------------------------------------
  section("Filming a session (npm run record) — nothing is replayed");
  {
    const t = await openTarget({ component: "TestBench", headless: true, port: 5186 });
    const session = await attachSession(t.page, { recordingFromStart: false, log: () => {} });
    await settle(t.page, t.pageUrl);
    const p = t.page;
    const click = async (loc) => {
      const b = await loc.boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
      await p.mouse.down();
      await p.mouse.up();
      await p.waitForTimeout(150);
    };
    // Before Alt+R (like logging in) — must not end up in the recording.
    await click(p.getByLabel("Search"));
    await p.keyboard.type("BEFORE-START", { delay: 10 });
    await p.getByLabel("Search").fill("");
    await p.keyboard.press("Alt+KeyR");
    await p.waitForTimeout(300);
    // Step 1, with a long "thinking" pause in the middle.
    await click(p.getByRole("button", { name: "Add part" }));
    await click(p.getByLabel("Part name"));
    await p.keyboard.type("Widget", { delay: 30 });
    await p.selectOption("#category", { label: "Nuts" });
    await click(p.getByText("Urgent"));
    await p.waitForTimeout(4000);
    await click(p.getByRole("dialog").getByRole("button", { name: "Submit" }));
    await p.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
    // Step 2.
    await p.keyboard.press("Alt+KeyN");
    await click(p.getByLabel("Search"));
    await p.keyboard.type("nuts", { delay: 30 });
    await p.keyboard.press("Enter");
    await click(p.getByRole("button", { name: "Submit" }));
    await p.waitForTimeout(500);
    const built = await buildRecording({ ...session, source: "TestBench" });
    const r_steps = session.state.steps();
    await t.close();

    check(!!built, "recording built from the session");
    const json = built?.json ?? "";
    const rec = built ? JSON.parse(json) : { steps: [], events: [], pointer: [] };
    check(rec.steps.length === 2, `2 steps (got ${rec.steps.length})`);
    check(!json.includes("BEFORE-START"), "nothing from before Alt+R is kept");
    check(json.includes("Saved (") && json.includes("Nuts · urgent") && json.includes("Page submits: 1") && json.includes("Searched: nuts"), "everything you did is in the recording");
    check(rec.pointer.length >= 6 && rec.pointer.every((q) => q.x >= 0 && q.y >= 0 && q.x <= 1280 && q.y <= 720), `click positions recorded (${rec.pointer.length})`);
    const s1 = rec.steps[0];
    const cut = s1 ? s1.end - s1.start - s1.timeline.at(-1)[0] : 0;
    check(cut > 2500, `the 4-second pause was cut (${(cut / 1000).toFixed(1)} s removed from step 1)`);
    check(!rec.events.some((e) => e.type === 3 && e.data?.source === 1), "raw mouse movements dropped (viewer draws its own cursor)");
    const caps = rec.steps.flatMap((x) => x.captions ?? []);
    check(caps.some((c) => c.text === "Click “Add part”") && caps.some((c) => c.text === "Type “Widget” in Part name" && c.until > c.t), "captions made from the actions (typing has an end time)");
    check(json.includes("data:image/svg+xml;base64"), "image embedded");
    check(!json.includes("jane.doe@example.com"), "data-private text masked");

    // The real viewer plays it.
    fs.mkdirSync("public/recordings", { recursive: true });
    fs.writeFileSync("public/recordings/_film.json", json);
    temp.push("public/recordings/_film.json");

    // Edit the tutorial file (title, a caption, settings) and apply it with npm run titles.
    const script = { component: "TestBench", settings: { zoom: false, colors: { accent: "#16a34a", click: "#dc2626", bogus: "x" } }, steps: scriptSteps(r_steps) };
    script.steps[0].title = "Add a part";
    script.steps[0].actions[0].caption = "Open the Add part dialog";
    writeTutorial("_film", script);
    const applied = await new Promise((resolve) => {
      let out = "";
      const pr = spawn(process.execPath, ["scripts/titles.mjs", "_film"]);
      pr.stdout.on("data", (d) => (out += d));
      pr.stderr.on("data", (d) => (out += d));
      pr.on("exit", (code) => resolve({ ok: code === 0, out }));
    });
    const rec2 = JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8"));
    check(applied.ok && rec2.steps[0].title === "Add a part" && rec2.steps[0].captions[0].text === "Open the Add part dialog", "npm run titles applies edited titles and captions");
    check(rec2.settings?.zoom === false && rec2.settings?.colors?.click === "#dc2626" && !("bogus" in rec2.settings.colors), "settings applied (zoom off, colors), invalid ones dropped");
    check(applied.out.includes('unknown color "bogus"'), "warns about an invalid setting");
    // "zoom": false written at the top of the file (not in "settings") still turns zoom off.
    writeTutorial("_film", { ...script, zoom: false, settings: { ...script.settings, zoom: 1.8 } });
    const { applyTutorialFile } = await import("./apply.mjs");
    applyTutorialFile("_film", { log: () => {}, warn: () => {} });
    check(JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8")).settings?.zoom === false, '"zoom": false at the top of the tutorial file turns zoom off too');
    // Per-step / per-action "speed" and "zoom" reach the recording.
    writeTutorial("_film", { ...script, steps: script.steps.map((st, i) => (i ? st : { ...st, speed: 2, zoom: false, actions: st.actions.map((a, j) => (j ? a : { ...a, speed: "1.5x", zoom: true })) })) });
    applyTutorialFile("_film", { log: () => {}, warn: () => {} });
    const r3 = JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8"));
    check(r3.steps[0].speed === 2 && r3.steps[0].zoom === false && r3.steps[0].captions[0].speed === 1.5 && r3.steps[0].captions[0].zoom === true && r3.steps[1].speed === undefined, '"speed" and "zoom" on a step and an action are applied');
    writeTutorial("_film", { ...script, steps: script.steps.map((st, i) => (i ? { ...st, deleted: true } : { ...st, actions: st.actions.map((a, j) => (j === 1 ? { ...a, deleted: true } : a)) })) });
    applyTutorialFile("_film", { log: () => {}, warn: () => {} });
    const r4 = JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8"));
    const c1 = r4.steps[0].captions[1];
    check(
      r4.steps[1].deleted === true && c1.deleted === true && r4.steps[0].cuts?.length === 1 && r4.steps[0].cuts[0][0] <= c1.t && r4.steps[0].cuts[0][1] > c1.t && r4.steps.length === 2,
      '"deleted" on a step and an action: kept in the recording, the action\'s stretch marked as cut',
    );
    writeTutorial("_film", { ...script, settings: { ...script.settings, zoom: "false" } });
    applyTutorialFile("_film", { log: () => {}, warn: () => {} });
    check(JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8")).settings?.zoom === false, '"zoom": "false" (in quotes) turns zoom off too');
    writeTutorial("_film", script);

    // Add it to the help site (npm run docs), with characters that would break an MDX page.
    script.title = "Film test";
    script.category = "Zz test";
    script.steps[0].actions[1].caption = "Type <b>{x}</b>";
    fs.writeFileSync("tutorials/_film.tutorial.json", JSON.stringify(script, null, 2));
    // A stand-in for a video from npm run export (real rendering is checked by hand — it takes a minute).
    fs.mkdirSync("videos", { recursive: true });
    fs.writeFileSync("videos/_film.webm", "not really a video");
    const docsRun = await new Promise((resolve) => {
      let out = "";
      const pr = spawn(process.execPath, ["scripts/docs.mjs", "_film"]);
      pr.stdout.on("data", (d) => (out += d));
      pr.stderr.on("data", (d) => (out += d));
      pr.on("exit", (code) => resolve({ ok: code === 0, out }));
    });
    const page = "help-site/docs/zz-test/_film.mdx";
    const body = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : "";
    check(docsRun.ok && body.includes('<TutorialPlayer name="_film" />') && body.includes("### 1. Add a part") && body.includes("Open the Add part dialog"), "npm run docs writes the help page with player and steps");
    check(body.includes("Type &lt;b&gt;&#123;x&#125;&lt;/b&gt;"), "special characters escaped for MDX");
    check(
      fs.existsSync("help-site/static/videos/_film.webm") && body.includes('<VideoDownload file="videos/_film.webm"') && body.includes('video="videos/_film.webm"'),
      "an exported video is copied, with a download link and <video> embed code",
    );
    fs.rmSync("videos/_film.webm", { force: true });
    fs.rmSync("help-site/static/videos/_film.webm", { force: true });
    check(fs.existsSync("help-site/static/recordings/_film.json") && fs.readFileSync("help-site/src/guides.json", "utf8").includes("Film test"), "recording copied and guide listed on the home page");
    // Hand-edited page (marker removed) is not overwritten.
    fs.writeFileSync(page, body.replace("tutorial_kit: generated", "").replace("## Steps", "## Steps (edited)"));
    await new Promise((resolve) => spawn(process.execPath, ["scripts/docs.mjs", "_film"]).on("exit", resolve));
    check(fs.readFileSync(page, "utf8").includes("## Steps (edited)"), "a page edited by hand is left alone");
    fs.rmSync("help-site/docs/zz-test", { recursive: true, force: true });
    fs.rmSync("help-site/static/recordings/_film.json", { force: true });
    await new Promise((resolve) => spawn(process.execPath, ["scripts/docs.mjs", "--rebuild-list"]).on("exit", resolve));
    const server = await createServer({ server: { port: 5187, strictPort: true }, logLevel: "silent" });
    await server.listen();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      // Timing (caption, zoom, cursor) is checked as plain functions of time — no waiting on playback,
      // so the result is the same on a fast or slow machine.
      const motion = await server.ssrLoadModule("/src/viewer/motion.ts");
      const time = await server.ssrLoadModule("/src/viewer/time.ts");
      const film = JSON.parse(fs.readFileSync("public/recordings/_film.json", "utf8"));
      const [s0, s1] = film.steps;
      const capAt = time.tutorialAt(s0, s0.captions[0].t);
      check(
        motion.captionAt(s0, capAt + 50)?.text === "Open the Add part dialog" && motion.captionAt(s0, capAt + 6000)?.text !== "Open the Add part dialog",
        "caption timing: shown at its action, gone a few seconds later",
      );
      // (The step's last click zooms out quickly by design, so use two.)
      check(
        motion.zoomAmount([3000, 6000], 0) === 0 && motion.zoomAmount([3000, 6000], 3000) === 1 && motion.zoomAmount([3000, 6000], 9000) === 0,
        "zoom timing: out at the start, in at a click, out after",
      );
      // "speed" from the tutorial file: one action, a whole step, and an action back at normal inside it.
      const sp = (extra, caps) => ({ title: "", description: "", start: 0, end: 10000, timeline: [[0, 0], [10000, 10000]], captions: caps, ...extra });
      const two = (a, b) => [{ t: 2000, text: "a", ...a }, { t: 6000, text: "b", ...b }];
      check(
        time.stepLength(sp({}, two({ speed: 2 }, {}))) === 8000 && time.stepLength(sp({ speed: 2 }, two({}, {}))) === 5000 && time.stepLength(sp({ speed: 2 }, two({}, { speed: 1 }))) === 7000,
        "speed: an action plays faster until the next one; a step's speed; normal speed inside a faster step",
      );
      const cutStep = sp({ cuts: [[2000, 6000]] }, two({ deleted: true }, {}));
      check(time.stepLength(cutStep) === 6000 && time.tutorialAt(cutStep, 6000) === 2000 && time.isCut(cutStep, 3000) && !time.isCut(cutStep, 6000), "a deleted action's stretch takes no time");
      check(time.shownSteps({ steps: [{ title: "a" }, { title: "b", deleted: true }] }).steps.length === 1, "deleted steps are left out of the player and the video");
      const p0 = film.pointer.find((q) => q.t >= s0.start);
      const at0 = motion.filmedCursorAt(film, s0, time.tutorialAt(s0, p0.t));
      check(Math.abs(at0.x - p0.x) < 1 && Math.abs(at0.y - p0.y) < 1, "cursor is on the click when it happens");

      // The player, opened paused at exact moments (&step=…&at=…) instead of waiting for it to play there.
      const v = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      const frame = v.frameLocator(".tk-host iframe");
      // Generous timeouts only cover loading (the first time after npm install, Vite prepares the libraries).
      const shows = (text) => frame.getByText(text).first().waitFor({ timeout: 90000 }).then(() => true, () => false);
      await v.goto(`http://localhost:5187/?t=_film&step=1&at=${Math.round(capAt + 50)}`);
      check(await v.locator(".tk-caption", { hasText: "Open the Add part dialog" }).first().waitFor({ timeout: 90000 }).then(() => true, () => false), "caption shown in the player");
      check(await shows("Parts"), "viewer shows the recorded page");
      check((await v.locator(".tk-step").count()) === 2, "viewer has 2 step cards");
      check((await v.locator(".tk").getAttribute("style"))?.includes("#16a34a"), "accent color from the tutorial file used");
      await v.goto(`http://localhost:5187/?t=_film&step=1&at=${Math.round(time.stepLength(s0) - 50)}`);
      check(await shows("Nuts · urgent"), "end of step 1 shows the saved part");
      await v.goto(`http://localhost:5187/?t=_film&step=2&at=${Math.round(time.stepLength(s1) - 50)}`);
      check(await shows("Page submits: 1"), "end of step 2 shows the result");
      // And it really plays: the progress bar moves.
      await v.goto("http://localhost:5187/?t=_film");
      const moving = await v
        .waitForFunction(() => /scaleX\(0\.[0-9]*[1-9]/.test(document.querySelector(".tk-step.active .tk-bar span")?.getAttribute("style") ?? ""), null, { timeout: 90000 })
        .then(() => true, () => false);
      check(moving, "the player plays by itself");
      // The control bar: pause stops it, speed changes and is remembered.
      await v.hover(".tk-player");
      await v.locator(".tk-ctl").first().click();
      const t1 = await v.locator(".tk-step.active .tk-bar span").getAttribute("style");
      await v.waitForTimeout(700);
      const t2 = await v.locator(".tk-step.active .tk-bar span").getAttribute("style");
      check(t1 === t2 && (await v.locator(".tk-ctl").first().getAttribute("aria-label")) === "Play", "control bar pauses the player");
      await v.locator(".tk-speed").click();
      await v.reload();
      check((await v.locator(".tk-speed").innerText({ timeout: 90000 })).trim() === "1.5×", "speed changes and is remembered");
      // Seek bar: pause, click in the middle → about halfway through the step.
      await v.locator(".tk-host iframe").waitFor({ timeout: 90000 });
      await v.hover(".tk-player");
      if ((await v.locator(".tk-ctl").first().getAttribute("aria-label")) === "Pause") await v.locator(".tk-ctl").first().click();
      const sb = await v.locator(".tk-seek").boundingBox();
      await v.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
      const now = Number(await v.locator(".tk-seek").getAttribute("aria-valuenow"));
      const max = Number(await v.locator(".tk-seek").getAttribute("aria-valuemax"));
      check(Math.abs(now - max / 2) <= 1, `seek bar jumps to where you click (${now} of ${max} s)`);
      // Zoom per step / per action: step 1 off, but on for its last action.
      const zoomed = () => v.evaluate(() => /scale\((?!1\))/.test(document.querySelector(".tk-host")?.parentElement?.style.transform ?? ""));
      const s0clicks = film.pointer.filter((q) => q.t >= s0.start && q.t <= s0.end).map((q) => Math.round(time.tutorialAt(s0, q.t)));
      const viewAt = async (at) => {
        await v.goto(`http://localhost:5187/?t=_film&step=1&at=${at}`);
        await v.locator(".tk-host iframe").waitFor({ timeout: 90000 });
        await v.waitForTimeout(400);
        return zoomed();
      };
      const zs = JSON.parse(fs.readFileSync("tutorials/_film.tutorial.json", "utf8"));
      zs.settings.zoom = 1.8;
      writeTutorial("_film", zs);
      const before = await viewAt(s0clicks[0]); // the player applies tutorial file edits on reload
      zs.steps[0].zoom = false;
      zs.steps[0].actions.at(-1).zoom = true;
      writeTutorial("_film", zs);
      const first = await viewAt(s0clicks[0]);
      const last = await viewAt(s0clicks.at(-1) - 150);
      check(before && !first && last, `"zoom" per step and per action: step off, its last action on (edits show on reload)`);
    } finally {
      await browser.close();
      await server.close();
    }
  }

  // ---------------------------------------------------------------------------------------
  section("Recording size (--size, --fullscreen)");
  {
    const { sizeFromArgs, parseArgs } = await import("./lib.mjs");
    check(
      sizeFromArgs(["--size", "1600x900"]).width === 1600 && sizeFromArgs(["--fullscreen"]) === "full" && sizeFromArgs([]).width === 1280,
      "size options read (--size 1600x900, --fullscreen, default 1280×720)",
    );
    check(parseArgs(["--url", "http://x/a", "--size", "1600x900", "my-guide"]).name === "my-guide", "the size isn't mistaken for the tutorial name");
    let bad = false;
    try {
      sizeFromArgs(["--size", "big"]);
    } catch {
      bad = true;
    }
    check(bad, "a wrong --size is reported");
    for (const size of [{ width: 1600, height: 900 }, "full"]) {
      const t = await openTarget({ component: "TestBench", headless: true, port: 5186, size });
      const session = await attachSession(t.page, { recordingFromStart: true, log: () => {} });
      await settle(t.page, t.pageUrl);
      const inner = await t.page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await t.page.getByRole("button", { name: "Add part" }).click();
      await t.page.waitForTimeout(400);
      const built = await buildRecording({ ...session, source: "TestBench", inline: false });
      await t.close();
      const vp = built ? JSON.parse(built.json).viewport : {};
      const want = size === "full" ? inner : size;
      check(vp.width === want.width && vp.height === want.height, `${size === "full" ? "full screen" : "1600×900"}: recording is the window's size (${vp.width}×${vp.height})`);
    }
  }

  // ---------------------------------------------------------------------------------------
  // The commands you type, run for real one after another — record (on a URL, full screen), titles,
  // docs, export — like you'd use them. Catches mistakes the checks above can't see.
  section("Commands, run for real: record → titles → docs → export");
  {
    const run = (script, args, env = {}) => {
      let out = "";
      const pr = spawn(process.execPath, [`scripts/${script}`, ...args], { env: { ...process.env, ...env } });
      pr.stdout.on("data", (d) => (out += d));
      pr.stderr.on("data", (d) => (out += d));
      const done = new Promise((resolve) => pr.on("exit", (code) => resolve({ ok: code === 0, out: () => out })));
      return { pr, done, out: () => out };
    };
    const until = async (fn, ms) => {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 200))) if (await fn()) return true;
      return false;
    };
    const name = "_cmd";
    const url = "http://localhost:5192/harness.html?c=TestBench";
    const authFile = `.auth/localhost_5192.json`;
    const guidesDirExisted = fs.existsSync("help-site/docs/guides");
    temp.push(`tutorials/${name}.tutorial.json`, `public/recordings/${name}.json`, authFile, `videos/${name}.webm`, `help-site/static/recordings/${name}.json`, `help-site/static/videos/${name}.webm`, `help-site/docs/guides/${name}.mdx`);
    const server = await createServer({ server: { port: 5192, strictPort: true }, logLevel: "silent" });
    await server.listen();
    let cdp;
    try {
      // npm run record -- --url … _cmd --fullscreen
      const rec = run("record.mjs", ["--url", url, name, "--fullscreen"], { TK_TEST_CDP_PORT: "9339" });
      const ready = await until(() => rec.out().includes("Alt+R"), 90000);
      check(ready, "npm run record starts and asks for Alt+R");
      if (ready) {
        cdp = await chromium.connectOverCDP("http://127.0.0.1:9339");
        const p = cdp.contexts().flatMap((c) => c.pages()).find((x) => x.url().includes("harness.html"));
        await p.getByRole("button", { name: "Add part" }).waitFor();
        await p.keyboard.press("Alt+KeyR");
        await p.waitForTimeout(300);
        await p.getByRole("button", { name: "Add part" }).click();
        await p.getByLabel("Part name").click();
        await p.keyboard.type("Bolt", { delay: 30 });
        await p.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
        await p.waitForTimeout(500);
        await p.keyboard.press("Alt+KeyN");
        await p.getByLabel("Search").click();
        await p.keyboard.type("bolt", { delay: 30 });
        await p.waitForTimeout(500);
        await p.close(); // = closing the window
      }
      const r = await Promise.race([rec.done, new Promise((res) => setTimeout(() => res({ ok: false, out: () => "timed out" }), 120000))]);
      if (!r.ok) rec.pr.kill();
      const recJson = fs.existsSync(`public/recordings/${name}.json`) ? JSON.parse(fs.readFileSync(`public/recordings/${name}.json`, "utf8")) : null;
      check(r.ok && recJson?.steps.length === 2 && fs.existsSync(`tutorials/${name}.tutorial.json`), `npm run record saves the recording and tutorial file (2 steps)${r.ok ? "" : `
${r.out().slice(-600)}`}`);
      check(/Size: \d+×\d+/.test(r.out()) && recJson?.viewport.width > 0, "full screen size recorded and reported");
      check(fs.existsSync(authFile), "login state saved for next time");

      // Edit the tutorial file like you would, then npm run titles / docs / export.
      const tf = JSON.parse(fs.readFileSync(`tutorials/${name}.tutorial.json`, "utf8"));
      tf.title = "Command test";
      tf.steps[0].title = "Add a bolt";
      fs.writeFileSync(`tutorials/${name}.tutorial.json`, JSON.stringify(tf, null, 2));
      const titles = await run("titles.mjs", [name]).done;
      check(titles.ok && JSON.parse(fs.readFileSync(`public/recordings/${name}.json`, "utf8")).steps[0].title === "Add a bolt", "npm run titles works");
      const exp = await run("export.mjs", [name, "--no-cards", "--scale", "0.5"]).done;
      const vid = `videos/${name}.webm`;
      check(exp.ok && fs.existsSync(vid) && fs.statSync(vid).size > 10000, `npm run export makes a video${exp.ok ? "" : `
${exp.out().slice(-600)}`}`);
      const docs = await run("docs.mjs", [name]).done;
      const pageFile = `help-site/docs/guides/${name}.mdx`;
      check(docs.ok && fs.existsSync(pageFile) && fs.readFileSync(pageFile, "utf8").includes("VideoDownload"), "npm run docs adds the page, with the video");
    } finally {
      await cdp?.close().catch(() => {});
      await server.close();
      for (const f of temp) fs.rmSync(f, { force: true });
      if (!guidesDirExisted) fs.rmSync("help-site/docs/guides", { recursive: true, force: true });
      await new Promise((resolve) => spawn(process.execPath, ["scripts/docs.mjs", "--rebuild-list"]).on("exit", resolve));
    }
  }

  // ---------------------------------------------------------------------------------------
  section("Editor page (npm run dev → /edit): Record buttons, edit, save, export, help site");
  {
    const name = "_edrec";
    const port = 5193;
    const until = async (fn, ms) => {
      for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await fn()) return true;
      return false;
    };
    const guidesDirExisted = fs.existsSync("help-site/docs/guides");
    temp.push(`tutorials/${name}.tutorial.json`, `public/recordings/${name}.json`, `.auth/localhost_${port}.json`, `videos/${name}.webm`, `help-site/static/recordings/${name}.json`, `help-site/static/videos/${name}.webm`, `help-site/docs/guides/${name}.mdx`);
    temp.push(`exports/docusaurus/docs/guides/${name}.mdx`, `exports/docusaurus/static/recordings/${name}.json`, `exports/docusaurus/static/videos/${name}.webm`);
    const exportsExisted = fs.existsSync("exports");
    // The recording the editor starts runs headless, and we drive its Chrome over this port.
    process.env.TK_TEST_CDP_PORT = "9340";
    const server = await createServer({ server: { port, strictPort: true }, logLevel: "silent" });
    await server.listen();
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    let cdp;
    try {
      const e = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      await e.goto(`http://localhost:${port}/edit`);
      const recordBtn = e.getByRole("button", { name: "● Record new" });
      await recordBtn.waitFor({ timeout: 90000 });
      if (!(await e.getByLabel("Page address").isVisible())) await recordBtn.click();
      await e.getByLabel("Page address").fill(`http://localhost:${port}/harness.html?c=TestBench`);
      await e.getByLabel("Tutorial name").fill(name);
      await e.getByRole("button", { name: "Open Chrome" }).click();
      const startBtn = e.getByRole("button", { name: "● Start recording" });
      const ready = await startBtn.waitFor({ timeout: 90000 }).then(() => true, () => false);
      check(ready, "Record: opens Chrome and waits for Start");
      if (ready) {
        cdp = await chromium.connectOverCDP("http://127.0.0.1:9340");
        const p = cdp.contexts().flatMap((c) => c.pages()).find((x) => x.url().includes("harness.html"));
        await p.getByRole("button", { name: "Add part" }).waitFor();
        await startBtn.click();
        await e.getByText("Recording — step 1").waitFor({ timeout: 15000 });
        await p.getByRole("button", { name: "Add part" }).click();
        await p.getByLabel("Part name").click();
        await p.keyboard.type("Bolt", { delay: 30 });
        await p.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
        const counted = await until(async () => /step 1, [1-9]/.test(await e.locator(".ed-rec-status").innerText()), 10000);
        await e.getByRole("button", { name: "Next step" }).click();
        await p.getByLabel("Search").click();
        await p.keyboard.type("bolt", { delay: 30 });
        const step2 = await until(async () => /step 2/.test(await e.locator(".ed-rec-status").innerText()), 10000);
        check(counted && step2, "Record: Start, actions counted, Next step");
        await e.getByRole("button", { name: "■ Stop & save" }).click();
        const opened = (await until(() => fs.existsSync(`tutorials/${name}.tutorial.json`), 120000)) && (await until(() => e.url().includes(`t=${name}`), 15000)) && (await e.getByLabel("Step 2 title").waitFor({ timeout: 30000 }).then(() => true, () => false));
        const recJson = fs.existsSync(`public/recordings/${name}.json`) ? JSON.parse(fs.readFileSync(`public/recordings/${name}.json`, "utf8")) : null;
        const recLog = opened ? "" : await e.evaluate(async () => { for (let i = 1; i < 9; i++) { const r = await fetch(`/__tk/job/${i}`); if (r.ok) { const j = await r.json(); if (j.kind === "record") return j.log.slice(-1500); } } return "(no log)"; });
        check(opened && recJson?.steps.length === 2, `Record: Stop & save makes a 2-step tutorial and opens it in the editor${opened ? "" : `
${recLog}`}`);
        if (!opened) throw new Error("recording wasn't saved");

        // Typing in the editor while the player plays: the replay mustn't take the keyboard focus.
        const desc = e.getByLabel("Step 1 description");
        await desc.click();
        await desc.press("End");
        await e.keyboard.type("abcdefghijklmnopqrst", { delay: 80 });
        check((await desc.inputValue()).endsWith("abcdefghijklmnopqrst"), "typing in the editor while the player plays keeps every key");
        // The preview stays in view while the form scrolls.
        const top0 = (await e.locator(".tk-player").boundingBox()).y;
        await e.mouse.move(1200, 600);
        await e.mouse.wheel(0, 1200);
        await e.waitForTimeout(400);
        check((await e.evaluate(() => scrollY)) > 200 && Math.abs((await e.locator(".tk-player").boundingBox()).y - top0) < 40, "the preview stays in view while the form scrolls");
        await e.evaluate(() => scrollTo(0, 0));
        await e.getByLabel("Step 1 title").fill("Add a bolt");
        await e.getByRole("button", { name: "Save", exact: true }).click();
        check(await until(() => JSON.parse(fs.readFileSync(`tutorials/${name}.tutorial.json`, "utf8")).steps[0].title === "Add a bolt", 10000), "Save writes the tutorial file");

        // Delete an action, and a step; restore them.
        const len1 = async () => Number((await e.locator(".ed-card-meta").first().innerText()).match(/[\d.]+/)[0]);
        const before = await len1();
        // (the step's last action: its stretch runs to the end of the step, so the cut is always visible)
        await e.getByRole("button", { name: /^Delete step 1, action \d+$/ }).last().click();
        const shorter = await until(async () => (await len1()) < before, 5000);
        await e.getByRole("button", { name: "Delete step", exact: true }).nth(1).click();
        const oneCard = await until(async () => (await e.locator(".tk-step").count()) === 1, 5000);
        await e.getByRole("button", { name: "Save", exact: true }).click();
        const savedDel = await until(() => {
          const t = JSON.parse(fs.readFileSync(`tutorials/${name}.tutorial.json`, "utf8"));
          return t.steps[0].actions.at(-1).deleted === true && t.steps[1].deleted === true;
        }, 10000);
        check(shorter && oneCard && savedDel, `Delete an action (step gets shorter) and a step (player leaves it out), then Save${shorter && oneCard && savedDel ? "" : ` (shorter ${shorter}, one card ${oneCard}, saved ${savedDel}; ${await e.locator(".ed-msg").allInnerTexts()})`}`);
        await e.getByRole("button", { name: "Restore step" }).click();
        await e.getByRole("button", { name: "Restore", exact: true }).click();
        await e.getByRole("button", { name: "Save", exact: true }).click();
        check(
          await until(() => {
            const t = JSON.parse(fs.readFileSync(`tutorials/${name}.tutorial.json`, "utf8"));
            return !t.steps[0].actions.at(-1).deleted && !t.steps[1].deleted;
          }, 10000) && (await until(async () => (await e.locator(".tk-step").count()) === 2, 5000)),
          "Restore brings them back",
        );

        // Delete the whole tutorial (moved into deleted/), then Undo.
        await e.getByRole("button", { name: "Delete tutorial" }).click();
        const box = e.getByRole("region", { name: "Delete this tutorial" });
        await box.waitFor();
        const listed = await box.locator("code").allInnerTexts();
        await box.getByRole("button", { name: "Delete tutorial" }).click();
        const moved = await until(() => !fs.existsSync(`tutorials/${name}.tutorial.json`) && !fs.existsSync(`public/recordings/${name}.json`), 10000);
        const kept = fs.existsSync("deleted") && fs.readdirSync("deleted").some((d) => d.startsWith(`${name}-`) && fs.existsSync(`deleted/${d}/tutorials/${name}.tutorial.json`));
        check(listed.includes(`tutorials/${name}.tutorial.json`) && moved && kept, "Delete tutorial lists its files, then moves them into deleted/");
        await e.getByRole("button", { name: "Undo", exact: true }).click();
        check(
          await until(() => fs.existsSync(`tutorials/${name}.tutorial.json`) && fs.existsSync(`public/recordings/${name}.json`), 10000) && !fs.readdirSync("deleted").some((d) => d.startsWith(`${name}-`)),
          "Undo puts the tutorial back",
        );
        if (fs.existsSync("deleted") && !fs.readdirSync("deleted").length) fs.rmdirSync("deleted");

        await e.getByLabel("Title cards").uncheck();
        await e.getByLabel("Size").selectOption("0.5");
        await e.getByRole("button", { name: "Export video" }).click();
        const made = await e.locator(".ed-done video").waitFor({ timeout: 240000 }).then(() => true, () => false);
        check(made && fs.existsSync(`videos/${name}.webm`), `Export video makes the video and shows it${made ? "" : `
${await e.locator(".ed-log").innerText().catch(() => "")}`}`);
        await e.getByRole("button", { name: "Add to help site" }).click();
        check(await until(() => fs.existsSync(`help-site/docs/guides/${name}.mdx`), 60000), "Add to help site writes the page");
        // Export for Docusaurus: a folder to copy into your own site.
        await e.getByRole("button", { name: "Export for Docusaurus" }).click();
        const dx = "exports/docusaurus";
        const dxOk = await until(
          () =>
            fs.existsSync(`${dx}/docs/guides/${name}.mdx`) &&
            fs.existsSync(`${dx}/static/recordings/${name}.json`) &&
            fs.existsSync(`${dx}/src/components/TutorialPlayer/index.tsx`) &&
            fs.readFileSync(`${dx}/src/tutorial-kit/Tutorial.css`, "utf8").startsWith("/*") &&
            fs.readFileSync(`${dx}/HOW-TO-ADD.md`, "utf8").includes("npm install remotion@"),
          15000,
        );
        const dxPage = dxOk ? fs.readFileSync(`${dx}/docs/guides/${name}.mdx`, "utf8") : "";
        check(dxOk && dxPage.includes("<TutorialPlayer") && !dxPage.includes("EmbedSnippet") && (await e.getByText("HOW-TO-ADD.md").isVisible()), "Export for Docusaurus makes the folder (page, recording, player, how-to)");

        // Import: the recording alone (a tutorial file is made from it), then with its tutorial file.
        const imp = "_edimp";
        temp.push(`tutorials/${imp}.tutorial.json`, `public/recordings/${imp}.json`);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tk-import-"));
        fs.copyFileSync(`public/recordings/${name}.json`, path.join(dir, `${imp}.json`));
        fs.copyFileSync(`tutorials/${name}.tutorial.json`, path.join(dir, `${imp}.tutorial.json`));
        fs.writeFileSync(path.join(dir, "other.json"), JSON.stringify({ hello: 1 }));
        await e.getByRole("button", { name: "⇪ Import" }).click();
        await e.getByLabel("Choose the recording").setInputFiles([path.join(dir, "other.json")]);
        check(await e.getByText("not a tutorial-kit recording or tutorial file").waitFor({ timeout: 5000 }).then(() => true, () => false), "Import: a JSON that isn't ours is turned away");
        await e.getByLabel("Choose the recording").setInputFiles([path.join(dir, `${imp}.json`)]);
        await e.getByRole("button", { name: "Import", exact: true }).click();
        const madeOk = await until(() => e.url().includes(`t=${imp}`), 15000);
        const madeScript = fs.existsSync(`tutorials/${imp}.tutorial.json`) ? JSON.parse(fs.readFileSync(`tutorials/${imp}.tutorial.json`, "utf8")) : null;
        const shown = await e.getByLabel("Step 2 title").waitFor({ timeout: 15000 }).then(() => true, () => false);
        if (!(madeOk && shown && madeScript?.steps?.[0]?.title === "Add a bolt")) console.log("   import details:", { madeOk, shown, titles: madeScript?.steps?.map((x) => x.title), messages: await e.locator(".ed-msg").allInnerTexts() });
        check(madeOk && madeScript?.steps?.length === 2 && madeScript.steps[0].title === "Add a bolt" && shown, `Import: a recording alone gets a tutorial file and opens in the editor${madeOk ? "" : ` (address: ${e.url()})`}${madeScript ? "" : " (no tutorial file)"}`);
        const withTitle = JSON.parse(fs.readFileSync(path.join(dir, `${imp}.tutorial.json`), "utf8"));
        withTitle.title = "Imported with its file";
        fs.writeFileSync(path.join(dir, `${imp}.tutorial.json`), JSON.stringify(withTitle));
        await e.getByRole("button", { name: "⇪ Import" }).click();
        // One at a time, as from two different folders.
        await e.getByLabel("Choose the recording").setInputFiles([path.join(dir, `${imp}.json`)]);
        await e.getByText(`${imp}.json`, { exact: true }).waitFor({ timeout: 5000 });
        await e.getByLabel("Choose the tutorial file").setInputFiles([path.join(dir, `${imp}.tutorial.json`)]);
        await e.getByText(`${imp}.tutorial.json`, { exact: true }).waitFor({ timeout: 5000 });
        // (names starting with _ aren't in the editor's list, so it may not say "and replace")
        await e.getByRole("button", { name: /^Import( and replace)?$/ }).click();
        check(await until(() => JSON.parse(fs.readFileSync(`tutorials/${imp}.tutorial.json`, "utf8")).title === "Imported with its file", 15000), "Import: recording + tutorial file, replacing an existing one");
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      delete process.env.TK_TEST_CDP_PORT;
      await cdp?.close().catch(() => {});
      await browser.close();
      await server.close();
      for (const f of temp) fs.rmSync(f, { force: true });
      if (!guidesDirExisted) fs.rmSync("help-site/docs/guides", { recursive: true, force: true });
      if (!exportsExisted) fs.rmSync("exports", { recursive: true, force: true });
      await new Promise((resolve) => spawn(process.execPath, ["scripts/docs.mjs", "--rebuild-list"]).on("exit", resolve));
    }
  }

  // ---------------------------------------------------------------------------------------
  section("Expired login");
  {
    const server = await createServer({ server: { port: 5185, strictPort: true }, logLevel: "silent" });
    await server.listen();
    try {
      writeTutorial("_login", {
        url: "http://localhost:5185/harness.html?c=LoginDemo",
        steps: [{ title: "Open", description: "", actions: [{ action: "click", target: { role: "button", name: "New request" } }] }],
      });
      const c = await capture("_login");
      check(!c.ok && c.out.includes("login page"), "capture says the login expired instead of 'couldn't find'");
      check(fs.existsSync("capture-failed-_login.png"), "failure screenshot saved");
    } finally {
      await server.close();
    }
  }
} finally {
  for (const f of temp) fs.rmSync(f, { force: true });
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
