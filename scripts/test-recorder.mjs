// npm run test:recorder
// End-to-end self-test: records the fixtures in src/components with a real mouse/keyboard,
// checks what the recorder wrote, then runs capture on the result and checks the recording.
import fs from "node:fs";
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
      const v = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      await v.goto("http://localhost:5187/?t=_film");
      // The first time after npm install, Vite prepares the libraries before the page appears — give it time.
      await v.locator(".tk-step").first().waitFor({ timeout: 90000 }).catch(() => {});
      // The first caption is on screen for ~3 s near the start. The player loops through the steps, so
      // if a slow machine misses it, it comes round again — wait long enough for a full loop.
      check(await v.locator(".tk-caption", { hasText: "Open the Add part dialog" }).first().waitFor({ timeout: 60000 }).then(() => true, () => false), "caption shown while playing");
      const frame = v.frameLocator(".tk-host iframe");
      const shows = (text, timeout) => frame.getByText(text).first().waitFor({ timeout }).then(() => true, () => false);
      check(await shows("Parts", 15000), "viewer shows the recorded page");
      check((await v.locator(".tk-step").count()) === 2, "viewer has 2 step cards");
      check((await v.locator(".tk").getAttribute("style"))?.includes("#16a34a"), "accent color from the tutorial file used");
      check(await shows("Nuts · urgent", 20000), "step 1 plays through to the saved part");
      await v.locator(".tk-step").nth(1).click();
      check(await shows("Page submits: 1", 20000), "step 2 plays through to the end");
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
