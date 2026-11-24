// npm run capture -- <tutorial-name>
// Reads tutorials/<name>.tutorial.json, performs the steps for real in Chrome (Playwright),
// records the page with rrweb, and writes public/recordings/<name>.json for the viewer.
//
// The script either has  "url": "http://localhost:3000/..."   (your running app)
//                     or  "component": "TicketForm"            (a file in src/components)
import fs from "node:fs";
import { VIEWPORT, injectRecorder, openTarget, settle } from "./lib.mjs";

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run capture -- <tutorial-name>");
  process.exit(1);
}
const scriptFile = `tutorials/${name}.tutorial.json`;
if (!fs.existsSync(scriptFile)) {
  console.error(`No ${scriptFile}. Create it with  npm run record  or by hand.`);
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(scriptFile, "utf8"));

// Pacing (ms). Tweak to make the tutorial faster or slower.
const PACE = { stepIntro: 400, move: 700, afterAction: 600, typeDelay: 60, stepOutro: 500 };

if (script.auth && !fs.existsSync(script.auth)) {
  console.warn(`⚠ Saved login ${script.auth} not found — capturing without being signed in.`);
}

const { page, pageUrl, close } = await openTarget({
  url: script.url,
  component: script.component,
  auth: script.auth,
  headless: true,
  port: 5181,
});

const events = [];
await injectRecorder(page, (e) => events.push(e));

try {
  await settle(page, pageUrl);
  if (!events.length) throw new Error("rrweb didn't start on the page — is the app running at " + pageUrl + "?");

  const now = () => page.evaluate(() => Date.now()); // same clock rrweb uses
  const sleep = (ms) => page.waitForTimeout(ms);

  // Turn a human-readable target into a Playwright locator.
  const find = (t) => {
    if (t.testId) return page.getByTestId(t.testId);
    if (t.label) return page.getByLabel(t.label, { exact: t.exact });
    if (t.role) return page.getByRole(t.role, { name: t.name, exact: t.exact });
    if (t.text) return page.getByText(t.text, { exact: t.exact });
    if (t.css) return page.locator(t.css);
    throw new Error(`Unknown target ${JSON.stringify(t)}`);
  };

  let pos = { x: VIEWPORT.width * 0.8, y: VIEWPORT.height * 0.85 };
  const cursor = [{ t: await now(), ...pos }];
  const clicks = [];
  const steps = [];

  for (const step of script.steps) {
    const start = await now();
    await sleep(PACE.stepIntro);

    for (const a of step.actions) {
      if (a.action === "wait") {
        await sleep(a.ms);
        continue;
      }
      const loc = find(a.target).first();
      try {
        await loc.waitFor({ state: "visible", timeout: 15000 });
      } catch {
        throw new Error(`Step "${step.title}": couldn't find ${JSON.stringify(a.target)} on the page. Check the name/label in ${scriptFile}.`);
      }
      await loc.scrollIntoViewIfNeeded();
      const box = await loc.boundingBox();
      const target =
        a.action === "type"
          ? { x: box.x + Math.min(48, box.width / 2), y: box.y + box.height / 2 }
          : { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Cursor glides from its last position to the target.
      cursor.push({ t: await now(), ...pos });
      await sleep(PACE.move);
      cursor.push({ t: await now(), ...target });
      pos = target;
      clicks.push(await now());

      if (a.action === "click") await loc.click();
      else if (a.action === "type") {
        await loc.click();
        await loc.fill("");
        await loc.pressSequentially(a.text, { delay: PACE.typeDelay });
      } else throw new Error(`Unknown action ${a.action}`);

      // Let the app react (API calls, animations) before moving on.
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await sleep(PACE.afterAction);
      console.log(`  ✓ ${step.title}: ${a.action}`);
    }

    await sleep(PACE.stepOutro);
    steps.push({ title: step.title, description: step.description, start, end: await now() });
  }

  await sleep(200); // let the last rrweb events arrive
  fs.mkdirSync("public/recordings", { recursive: true });
  const out = `public/recordings/${name}.json`;
  fs.writeFileSync(out, JSON.stringify({ viewport: VIEWPORT, source: script.url ?? script.component, events, cursor, clicks, steps }));
  console.log(`Saved ${out}  (${events.length} DOM events, ${steps.length} steps, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} finally {
  await close();
}
