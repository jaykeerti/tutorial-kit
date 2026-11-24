// npm run test:recorder
// End-to-end self-test: records the fixtures in src/components with a real mouse/keyboard,
// checks what the recorder wrote, then runs capture on the result and checks the recording.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createRecorderState, openTarget, settle } from "./lib.mjs";

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed++;
};
const section = (t) => console.log(`\n— ${t} —`);
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

    // Dialog open when pressing Alt+R → warning.
    await p.reload();
    await p.waitForTimeout(500);
    await r.humanClick(p.getByRole("button", { name: "Add part" }));
    await p.keyboard.press("Alt+KeyR");
    await p.waitForTimeout(200);
    check(r.logs.some((l) => l.includes("A dialog/modal is open")), "warns when recording starts with a dialog open");
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
