// npm run capture -- <tutorial-name> [--watch] [--safe] [--no-inline-assets]
//
// Reads tutorials/<name>.tutorial.json, performs the steps for real in Chrome (Playwright),
// records the page with rrweb, and writes public/recordings/<name>.json for the viewer.
//
//   --watch             show the browser and slow down, to see where it gets stuck
//   --safe              don't send changes to the server (POST/PUT/PATCH/DELETE get a fake 200 {})
//   --no-inline-assets  don't embed images/fonts in the recording
import fs from "node:fs";
import path from "node:path";
import { VIEWPORT, injectRecorder, openTarget, settle } from "./lib.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error("Usage: npm run capture -- <tutorial-name> [--watch] [--safe] [--no-inline-assets]");
  process.exit(1);
}
const scriptFile = `tutorials/${name}.tutorial.json`;
if (!fs.existsSync(scriptFile)) {
  console.error(`No ${scriptFile}. Create it with  npm run record  or by hand.`);
  process.exit(1);
}
const script = JSON.parse(fs.readFileSync(scriptFile, "utf8"));

const WATCH = flags.has("--watch");
const SAFE = flags.has("--safe") || script.safe === true;
const INLINE = !flags.has("--no-inline-assets") && script.inlineAssets !== false;

// Pacing (ms). Tweak to make the tutorial faster or slower.
const PACE = { stepIntro: 400, move: 700, afterAction: 600, typeDelay: 60, stepOutro: 500 };
// Things that mean "still loading" (MUI + generic). Determinate progress bars (with a value) don't count.
const BUSY =
  '[role=progressbar]:not([aria-valuenow]), [aria-busy="true"], .MuiCircularProgress-indeterminate, .MuiLinearProgress-indeterminate, .MuiSkeleton-root';

// {{time}} {{date}} {{rand}} {{ts}} in typed text — so each capture can type something new.
const now0 = new Date();
const pad = (n) => String(n).padStart(2, "0");
const VARS = {
  time: `${pad(now0.getHours())}${pad(now0.getMinutes())}${pad(now0.getSeconds())}`,
  date: `${now0.getFullYear()}-${pad(now0.getMonth() + 1)}-${pad(now0.getDate())}`,
  rand: String(Math.floor(1000 + Math.random() * 9000)),
  ts: String(now0.getTime()),
};
const fillVars = (s) => String(s).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => VARS[k] ?? m);

if (script.auth && !fs.existsSync(script.auth)) {
  console.warn(`⚠ Saved login ${script.auth} not found — capturing without being signed in.`);
}

const { page, pageUrl, close } = await openTarget({
  url: script.url,
  component: script.component,
  auth: script.auth,
  headless: !WATCH,
  slowMo: WATCH ? 150 : 0,
  port: 5181,
});
const sleep = (ms) => page.waitForTimeout(ms);
const now = () => page.evaluate(() => Date.now()); // same clock rrweb uses

const events = [];
await injectRecorder(page, (e) => events.push(e), { mask: script.mask, maskInputs: script.maskInputs });

// ---- Safe mode / blocked requests --------------------------------------------------------
const blocked = [];
const rules = (script.block || []).map((r) => {
  const m = String(r).match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
  return m ? { method: m[1].toUpperCase(), glob: m[2].trim() } : { method: null, glob: String(r).trim() };
});
if (SAFE) rules.push({ method: "WRITE", glob: "**/*" });
for (const r of rules) {
  await page.route(r.glob, (route) => {
    const req = route.request();
    const m = req.method();
    const hit = r.method === "WRITE" ? !["GET", "HEAD", "OPTIONS"].includes(m) : !r.method || r.method === m;
    if (!hit || req.resourceType() === "document") return route.fallback();
    blocked.push(`${m} ${req.url()}`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

// ---- Collect images/fonts so the recording works without access to your app ---------------
const assets = new Map();
const pendingAssets = [];
let assetBytes = 0;
if (INLINE) {
  page.on("response", (r) => {
    const type = r.request().resourceType();
    if (!["image", "font"].includes(type) || r.status() !== 200 || r.url().startsWith("data:")) return;
    pendingAssets.push(
      r
        .body()
        .then((b) => {
          if (b.length > 2_000_000 || assetBytes + b.length > 20_000_000) return;
          assetBytes += b.length;
          const ct = (r.headers()["content-type"] || "").split(";")[0].trim() || (type === "font" ? "font/woff2" : "image/png");
          assets.set(r.url(), `data:${ct};base64,${b.toString("base64")}`);
        })
        .catch(() => {}),
    );
  });
}

// ---- Finding elements ---------------------------------------------------------------------
const find = (t, root = page) => {
  let loc;
  if (t.testId) loc = root.getByTestId(t.testId);
  else if (t.label) loc = root.getByLabel(t.label, { exact: t.exact });
  else if (t.placeholder) loc = root.getByPlaceholder(t.placeholder, { exact: t.exact });
  else if (t.role) loc = root.getByRole(t.role, t.name !== undefined ? { name: t.name, exact: t.exact } : {});
  else if (t.text) loc = root.getByText(t.text, { exact: t.exact });
  else if (t.css) loc = root.locator(t.css);
  else throw new Error(`Unknown target ${JSON.stringify(t)}`);
  return t.nth != null ? loc.nth(t.nth) : loc.first();
};

// Looser versions of a target: without a trailing required "*" (MUI hides it), partial match, any position.
const variants = (t) => {
  const out = [t];
  const key = ["name", "label", "text", "placeholder"].find((k) => t[k] !== undefined);
  if (key) {
    const stripped = t[key].replace(/\s*\*+\s*$/, "").trim();
    if (stripped && stripped !== t[key]) out.push({ ...t, [key]: stripped });
    if (t.exact) out.push({ ...t, [key]: stripped || t[key], exact: false, nth: undefined });
  }
  if (t.nth != null) out.push({ ...t, nth: undefined });
  const seen = new Set();
  return out.filter((v) => {
    const k = JSON.stringify(v);
    return seen.has(k) ? false : (seen.add(k), true);
  });
};

/** Try every way we know to find the action's element (scoped to its dialog first). */
const locate = async (a, { visible = true, timeout = 15000 } = {}) => {
  const cands = [a.target, ...(a.alts || [])].filter(Boolean);
  const tries = [];
  if (a.within) {
    // A dialog's name often comes from its heading, which Playwright only treats as the name when
    // aria-labelledby is set — so also match "a dialog containing that text", then any dialog (topmost).
    const { role, name: scopeName } = a.within;
    const scopes = scopeName
      ? [page.getByRole(role, { name: scopeName }).last(), page.getByRole(role).filter({ hasText: scopeName }).last(), page.getByRole(role).last()]
      : [page.getByRole(role).last()];
    for (const scope of scopes) for (const c of cands) for (const v of variants(c)) tries.push({ v, loc: find(v, scope), scoped: true });
  }
  for (const c of cands)
    for (const v of variants(c)) {
      const unscoped = a.within ? { ...v, nth: undefined } : v; // positions were counted inside the dialog
      tries.push({ v: unscoped, loc: find(unscoped), scoped: false });
    }
  // If the element belongs to a dialog that IS open, never fall back to the page behind it.
  const dialogOpen = async () =>
    a.within && ["dialog", "alertdialog"].includes(a.within.role) && (await page.getByRole(a.within.role).last().isVisible().catch(() => false));

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const inDialog = await dialogOpen();
    for (const [i, t] of tries.entries()) {
      if (inDialog && !t.scoped) continue;
      const ok = visible ? await t.loc.isVisible().catch(() => false) : (await t.loc.count().catch(() => 0)) > 0;
      if (ok) {
        if (i > 0) console.log(`    (found it using ${JSON.stringify(t.v)}${t.scoped ? "" : a.within ? " outside the dialog" : ""})`);
        return t.loc;
      }
    }
    await sleep(250);
  }
  return null;
};

// ---- Waiting ------------------------------------------------------------------------------
let busyWaitEnabled = true;
const waitNotBusy = async (timeout = 15000) => {
  if (!busyWaitEnabled) return;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const busy = await page
      .evaluate(
        (sel) =>
          [...document.querySelectorAll(sel)].some((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
          }),
        BUSY,
      )
      .catch(() => false);
    if (!busy) return;
    await sleep(200);
  }
  console.warn("    (a loading indicator stayed on screen for 15 s — ignoring loading indicators from now on)");
  busyWaitEnabled = false;
};

/** Wait until the element is enabled and has stopped moving (animations). */
const waitActionable = async (loc) => {
  const end = Date.now() + 10000;
  let prev = null;
  while (Date.now() < end) {
    const enabled = await loc.isEnabled().catch(() => true);
    const box = await loc.boundingBox().catch(() => null);
    if (enabled && box && prev && Math.abs(box.x - prev.x) < 1 && Math.abs(box.y - prev.y) < 1 && Math.abs(box.width - prev.width) < 1) return;
    prev = box;
    await sleep(120);
  }
};

const afterAction = async () => {
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await waitNotBusy();
  await sleep(PACE.afterAction);
};

const fail = async (lines) => {
  const shot = `capture-failed-${name}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  throw new Error([...lines, `  Page was:   ${page.url()}`, `  Screenshot: ${shot}   ← open this to see what capture saw`].join("\n"));
};

// ---- Run ----------------------------------------------------------------------------------
try {
  await settle(page, pageUrl);
  if (!events.length) await fail([`rrweb didn't start on the page — is the app running at ${pageUrl}?`]);

  // Ended up on a login page instead of the app?
  if (script.url) {
    const hasPassword = await page.locator("input[type=password]").first().isVisible().catch(() => false);
    const wanted = new URL(script.url);
    const got = new URL(page.url());
    const redirected = got.host !== wanted.host || (got.pathname !== wanted.pathname && /log-?in|sign-?in|auth|sso|oauth/i.test(got.href));
    if (hasPassword || redirected) {
      await fail([
        "Capture landed on a login page instead of your app — the saved login has probably expired.",
        `  Run record again to refresh it:  npm run record -- --url ${script.url} ${name}`,
      ]);
    }
  }

  if (SAFE) console.log("  (safe mode: changes are not sent to the server)");
  await waitNotBusy();

  let pos = { x: VIEWPORT.width * 0.8, y: VIEWPORT.height * 0.85 };
  const cursor = [{ t: await now(), ...pos }];
  const clicks = [];
  const steps = [];

  for (const step of script.steps) {
    const start = await now();
    await sleep(PACE.stepIntro);

    for (const a of step.actions) {
      // Actions without an element
      if (a.action === "wait") {
        await sleep(a.ms ?? 1000);
        continue;
      }
      if (a.action === "goto") {
        await page.goto(new URL(a.url, page.url()).href, { waitUntil: "load" });
        await afterAction();
        console.log(`  ✓ ${step.title}: goto`);
        continue;
      }
      if (!a.target && a.action === "press") {
        await page.keyboard.press(a.key);
        await afterAction();
        console.log(`  ✓ ${step.title}: press ${a.key}`);
        continue;
      }
      if (!a.target && a.action === "scroll") {
        await page.mouse.wheel(0, a.y ?? 400);
        await sleep(400);
        continue;
      }
      // Clicks on the page background (recorded by older versions of `record`) do nothing — skip them.
      if (a.target?.css && /^(html|body)$/i.test(a.target.css.trim())) {
        console.warn(`  ↷ ${step.title}: skipped a click on "${a.target.css}" (empty space)`);
        continue;
      }

      await waitNotBusy();
      const loc = await locate(a, { visible: a.action !== "upload" });
      if (!loc) {
        await fail([
          `Step "${step.title}": couldn't find ${JSON.stringify(a.target)}${a.within ? ` inside ${JSON.stringify(a.within)}` : ""}.`,
          "  Likely: wrong start page, a dialog that wasn't opened by an earlier step, or the text changed.",
          `  Fix it in ${scriptFile} (or record again). Run with --watch to see it happen.`,
        ]);
      }
      if (a.action !== "upload") {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await waitActionable(loc);
      }

      // Cursor glides from its last position to the element.
      const box = await loc.boundingBox().catch(() => null);
      if (box) {
        const target =
          a.action === "type"
            ? { x: box.x + Math.min(48, box.width / 2), y: box.y + box.height / 2 }
            : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        cursor.push({ t: await now(), ...pos });
        await sleep(PACE.move);
        cursor.push({ t: await now(), ...target });
        pos = target;
        if (a.action !== "hover" && a.action !== "scroll") clicks.push(await now());
      }

      switch (a.action) {
        case "click":
          await loc.click({ timeout: 10000 }).catch(async (e) => {
            if (!/intercepts pointer events|not visible|Timeout/.test(e.message)) throw e;
            await fail([`Step "${step.title}": found ${JSON.stringify(a.target)} but something is covering it (a dialog, overlay or banner).`, "  Run with --watch to see what's on top."]);
          });
          break;
        case "hover":
          await loc.hover();
          break;
        case "type":
          await loc.click();
          await loc.fill("");
          await loc.pressSequentially(fillVars(a.text), { delay: PACE.typeDelay });
          break;
        case "press":
          await loc.press(a.key);
          break;
        case "select":
          await loc.selectOption({ label: a.value }).catch(() => loc.selectOption(a.value));
          break;
        case "upload": {
          const files = (a.files || []).map((f) => path.join("tutorials", "files", f));
          const missing = files.filter((f) => !fs.existsSync(f));
          if (missing.length) await fail([`Step "${step.title}": upload needs these files — put them in tutorials/files/:`, ...missing.map((f) => `    ${f}`)]);
          await loc.setInputFiles(files);
          break;
        }
        case "scroll":
          await loc.scrollIntoViewIfNeeded();
          break;
        default:
          throw new Error(`Unknown action "${a.action}" in ${scriptFile}`);
      }

      await afterAction();
      console.log(`  ✓ ${step.title}: ${a.action}${a.key ? ` ${a.key}` : ""}`);
    }

    await sleep(PACE.stepOutro);
    steps.push({ title: step.title, description: step.description, start, end: await now() });
  }

  await sleep(200); // let the last rrweb events arrive
  await Promise.all(pendingAssets);

  // Swap image/font URLs for embedded copies (longest URLs first so "a.png?v=2" isn't broken by "a.png").
  let eventsJson = JSON.stringify(events);
  let inlined = 0;
  for (const [u, data] of [...assets].sort((a, b) => b[0].length - a[0].length)) {
    if (eventsJson.includes(u)) {
      eventsJson = eventsJson.split(u).join(data);
      inlined++;
    }
  }

  fs.mkdirSync("public/recordings", { recursive: true });
  const out = `public/recordings/${name}.json`;
  const doc = JSON.stringify({ viewport: VIEWPORT, source: script.url ?? script.component, cursor, clicks, steps, events: "__EVENTS__" });
  fs.writeFileSync(out, doc.replace('"__EVENTS__"', () => eventsJson));

  console.log(
    `Saved ${out}  (${events.length} DOM events, ${steps.length} steps, ${inlined} images/fonts embedded, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`,
  );
  if (blocked.length) console.log(`  Blocked ${blocked.length} request(s): ${[...new Set(blocked)].slice(0, 5).join(", ")}${blocked.length > 5 ? ", …" : ""}`);
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await close();
}
