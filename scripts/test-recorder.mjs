// npm run test:recorder
// Clicks through src/components/SelectDemo.tsx with a real mouse, checks what the recorder writes down,
// then replays that script with capture's locators to make sure it works end to end.
import { fileURLToPath } from "node:url";
import { openTarget, settle } from "./lib.mjs";

const recorded = [];
const { page, pageUrl, close } = await openTarget({ component: "SelectDemo", headless: true, port: 5183 });
await page.exposeBinding("__tk_rec", (_src, a) => recorded.push(a));
await page.addInitScript({ path: fileURLToPath(new URL("./recorder-client.js", import.meta.url)) });

let failed = false;
const check = (ok, msg) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed = true;
};

// Like a person: press the mouse on an element, release, with real mouse events.
const humanClick = async (locator) => {
  const b = await locator.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
};

try {
  await settle(page, pageUrl);

  await page.mouse.click(600, 600); // click on empty space — should be ignored
  await humanClick(page.locator("[role=combobox]")); // opens on mousedown; click lands on <body>
  await humanClick(page.getByRole("option", { name: "Production" }));
  await humanClick(page.getByRole("button", { name: "Save" }));

  const clicks = recorded.filter((a) => a.action === "click").map((a) => a.target);
  console.log("recorded:", JSON.stringify(clicks));

  check(clicks.length === 3, "3 clicks recorded (empty-space click ignored)");
  check(clicks[0]?.role === "combobox" && clicks[0]?.name === "Environment", "dropdown open recorded as the 'Environment' combobox, not <body>");
  check(clicks[1]?.role === "option" && clicks[1]?.name === "Production", "option recorded as role=option 'Production'");
  check(clicks[2]?.role === "button" && clicks[2]?.name === "Save", "Save button recorded");

  // Replay with the same locators capture uses.
  await page.reload();
  await page.waitForTimeout(300);
  for (const t of clicks) await page.getByRole(t.role, { name: t.name, exact: t.exact }).first().click();
  check(await page.getByText("Saved: Production").isVisible(), "replaying the recorded clicks selects Production and saves");
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
