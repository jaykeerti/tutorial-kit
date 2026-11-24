# tutorial-kit

Turn a click-through of your React app into an animated, step-by-step tutorial —
like the "how it works" sections on product sites — without screen recording and without an LLM.

```
 ┌──────────┐     ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
 │  record  │ ──▶ │ script .json │ ──▶ │     capture      │ ──▶ │  <Tutorial /> page  │
 │ (you     │     │ (steps, what │     │ (robot replays it│     │ (Remotion plays the │
 │  click)  │     │  to click)   │     │  + rrweb records)│     │  recording + cursor)│
 └──────────┘     └──────────────┘     └──────────────────┘     └─────────────────────┘
```

> **Status: prototype.** Tested end-to-end on the demo components and on an MUI app. Expect rough edges.

---

## Contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Quick start (demo)](#quick-start-demo)
- [Use it on your own app](#use-it-on-your-own-app)
  - [Option A — your running app (URL mode)](#option-a--your-running-app-url-mode)
  - [Option B — a single component (component mode)](#option-b--a-single-component-component-mode)
- [Keyboard shortcuts while recording](#keyboard-shortcuts-while-recording)
- [The script file](#the-script-file)
- [Capture options](#capture-options)
- [Show the tutorial in your React app](#show-the-tutorial-in-your-react-app)
- [Commands](#commands)
- [What it handles for you](#what-it-handles-for-you)
- [Troubleshooting](#troubleshooting)
- [Real data, privacy & safety](#real-data-privacy--safety)
- [Project layout](#project-layout)
- [Known limits](#known-limits)
- [Roadmap](#roadmap)

---

## How it works

| Stage | Tool | What happens |
|---|---|---|
| **Record** | Playwright | Opens Chrome. You click and type through the task once. Each action is saved with **several ways to find the element again** (test id, role + name, label, text, CSS path) and **which dialog it was in**. When you close the window, the recording is **checked immediately** by replaying it. |
| **Capture** | Playwright + rrweb | A headless Chrome replays the script **for real**, waiting for spinners, animations and disabled buttons. rrweb records every DOM change (structure + styles, not pixels); images and fonts are embedded. Output: `public/recordings/<name>.json`. |
| **Play** | Remotion | For every video frame, rrweb rebuilds the page *exactly as it was at that moment*, and a smooth fake cursor with click ripples is drawn on top. Step cards, progress bars and auto-advance come from `<Tutorial />`. |

Your app's code is **never modified** — rrweb is injected into the page from outside by Playwright.

## Requirements

- Node.js 18+ (tested on 20 and 22)
- Google Chrome installed (Playwright drives your installed Chrome — no extra browser download)
- Windows or macOS

```bash
npm install
npm run test:recorder     # optional: self-test, should end with "All checks passed"
```

## Quick start (demo)

```bash
npm run dev                          # viewer at http://localhost:5180
npm run capture -- ticket-form       # (re)build the demo recording
```

Open **http://localhost:5180/?t=ticket-form**.

---

## Use it on your own app

### Option A — your running app (URL mode)

Best for real apps. No wrappers or mocks needed. Use a **test account / staging environment** — see [safety](#real-data-privacy--safety).

**1. Start your app** as usual, e.g. `npm start` → `http://localhost:3000`.

**2. Record:**

```bash
npm run record -- --url http://localhost:3000/tickets create-ticket
```

In the Chrome window that opens:

1. **Log in** if needed, and go to the screen where the tutorial starts — **with no dialogs open**.
2. Click inside the page, then press **Alt + R** (Mac: **⌥ Option + R**). The terminal prints `● Recording started`.
   Pressing it again **starts over**.
3. Do the task. Press **Alt + N** (Mac: **⌥ Option + N**) before each new step.
4. **Close the window.**

What happens next, automatically:
- `tutorials/create-ticket.tutorial.json` — the script — is saved
- `.auth/localhost_3000.json` — your saved login — is saved (**keep private**)
- the script is **replayed once** to check it works, and the tutorial is built.
  You'll see `✅ Tutorial works` or a clear explanation of what to fix.

> The check replays your steps **for real** (it really clicks Submit). Add `--no-capture` to skip it,
> or put `"safe": true` in the script first (see [Capture options](#capture-options)).

**3. Give the steps real titles** in the script (replace `"Step 1"`, `"Step 2"`… and the descriptions), then refresh:

```bash
npm run capture -- create-ticket
```

**4. View** — `npm run dev` → `http://localhost:5180/?t=create-ticket`

> Re-run `capture` whenever the UI changes — no need to record again.

### Option B — a single component (component mode)

Best for isolated components or demo data.

1. Put the component in `src/components/MyThing.tsx` (as a **default export**).
2. If it needs providers (router, store, theme, auth), wrap it in `src/harness.tsx`.
3. `npm run record -- MyThing my-thing` (records immediately; Alt+N = new step; close the window to finish).
4. View at `http://localhost:5180/?t=my-thing`.

Preview any component on its own at `http://localhost:5180/harness.html?c=MyThing`.

---

## Keyboard shortcuts while recording

| Windows / Linux | Mac | Does |
|---|---|---|
| Alt + R | ⌥ Option + R | Start recording (press again to start over) |
| Alt + N | ⌥ Option + N | Start a new step |
| *close the window* | *close the window* | Finish |

Click inside the page first so it has keyboard focus. The shortcuts never type into fields.

---

## The script file

`tutorials/<name>.tutorial.json` — written by `record`, editable by hand:

```json
{
  "url": "http://localhost:3000/tickets",
  "auth": ".auth/localhost_3000.json",
  "safe": false,
  "mask": [".customer-email"],
  "steps": [
    {
      "title": "Add a part",
      "description": "Open the dialog and give the part a name.",
      "actions": [
        { "action": "click", "target": { "role": "button", "name": "Add part", "exact": true },
          "alts": [{ "text": "Add part", "exact": true }, { "css": "body > div > button:nth-of-type(1)" }] },
        { "action": "type", "target": { "label": "Part name" }, "text": "Bracket {{time}}",
          "within": { "role": "dialog", "name": "Add part" } },
        { "action": "click", "target": { "role": "button", "name": "Submit", "exact": true },
          "within": { "role": "dialog", "name": "Add part" } }
      ]
    }
  ]
}
```

Use `"component": "TicketForm"` instead of `"url"` for component mode.

### Actions

| Action | Fields | Recorded automatically? |
|---|---|---|
| `click` | `target` | ✅ |
| `type` | `target`, `text` (supports [variables](#variables)) | ✅ (not password fields) |
| `select` | `target`, `value` (option text) — native `<select>` | ✅ |
| `press` | `key` (`Enter`, `Escape`, `Tab`, `Shift+Tab`…), optional `target` | ✅ Enter / Escape / Tab |
| `upload` | `target`, `files` (names in `tutorials/files/`) | ✅ (put the files in `tutorials/files/`) |
| `hover` | `target` | ✍️ add by hand (e.g. menus that open on hover) |
| `scroll` | `target`, or `y` (pixels) | ✍️ add by hand |
| `goto` | `url` (absolute or relative) | ✍️ add by hand |
| `wait` | `ms` | ✍️ add by hand |

### Targets — how an element is found

`target` is tried first, then each entry in `alts`, each also in a looser form
(without a trailing `*`, partial match). If the action has `within`, the search starts inside that dialog/panel.

| Target | Matches | Example |
|---|---|---|
| `testId` | `data-testid="…"` | `{ "testId": "new-ticket" }` ← **most robust** |
| `label` | a form field by its label | `{ "label": "Title" }` |
| `placeholder` | a field by its placeholder | `{ "placeholder": "Search…" }` |
| `role` + `name` | button, link, tab, combobox, option… | `{ "role": "button", "name": "Save" }` |
| `text` | any element by visible text | `{ "text": "My tickets" }` |
| `css` | CSS selector | `{ "css": "#toolbar > button:nth-of-type(2)" }` |

Extras on any target: `"exact": true` (whole-text match), `"nth": 1` (the 2nd match, counted inside `within`).

**Tip:** add `data-testid` to the controls your tutorials use — tutorials then survive text and layout changes.

### Variables

Use these in `type` text so each capture types something new (handy when your app rejects duplicates):

| Variable | Example |
|---|---|
| `{{time}}` | `142305` |
| `{{date}}` | `2026-11-24` |
| `{{rand}}` | `4821` |
| `{{ts}}` | `1795620185000` |

---

## Capture options

On the command line:

```bash
npm run capture -- <name> --watch              # show the browser, slowed down — see where it gets stuck
npm run capture -- <name> --safe               # don't send changes to the server
npm run capture -- <name> --no-inline-assets   # don't embed images/fonts
```

In the script file:

| Field | Meaning |
|---|---|
| `"safe": true` | Same as `--safe`: POST/PUT/PATCH/DELETE requests get a fake `200 {}` instead of reaching the server. Screens that depend on the real response may look different. |
| `"block": ["POST **/api/submit*", "**/analytics/**"]` | Only block these requests (method optional; glob URLs). |
| `"mask": [".email", "#customer-name"]` | Text in these elements becomes `***` in the recording. `[data-private]` is always masked. |
| `"maskInputs": true` | Hide everything typed into inputs. |
| `"inlineAssets": false` | Same as `--no-inline-assets`. |

Elements with `data-tk-block` are left out of the recording entirely.

Pacing lives in `PACE` at the top of `scripts/capture.mjs` (cursor move 700 ms, typing 60 ms/char, …).

---

## Show the tutorial in your React app

The viewer is one component: `src/viewer/Tutorial.tsx`.

1. In your app: `npm i remotion @remotion/player rrweb` (keep all `remotion` / `@remotion/*` versions identical).
2. Copy `src/viewer/` (`Tutorial.tsx`, `Tutorial.css`, `RrwebClip.tsx`, `types.ts`) into your app.
3. Copy the recording JSON into your app's `public/` folder.
4. Use it:

```tsx
import { Tutorial } from "./viewer/Tutorial";

<Tutorial src="/recordings/create-ticket.json" />
```

Load it lazily so Remotion (~500 KB) only downloads when needed:

```tsx
const Tutorial = React.lazy(() => import("./viewer/Tutorial").then((m) => ({ default: m.Tutorial })));
<Suspense fallback={<div style={{ aspectRatio: "16/9" }} />}><Tutorial src="…" /></Suspense>
```

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Viewer + harness at `http://localhost:5180` |
| `npm run record -- --url <url> <name> [--no-capture]` | Record on your running app, then check it |
| `npm run record -- <Component> [name] [--no-capture]` | Record on a component from `src/components/` |
| `npm run capture -- <name> [--watch] [--safe] [--no-inline-assets]` | Build `public/recordings/<name>.json` from the script |
| `npm run test:recorder` | Self-test of record + capture on the fixtures |
| `npm run typecheck` | TypeScript check |

Viewer URL: `http://localhost:5180/?t=<name>`

---

## What it handles for you

| Situation | How |
|---|---|
| Buttons renamed / moved | Several ways to find each element (`alts`) + looser matching |
| Two buttons with the same text (e.g. "Submit" on the page and in a dialog) | Records the dialog/panel it's in (`within`) and its position (`nth`); never clicks behind an open dialog |
| MUI required fields (`Name *`) | Ignores the hidden `*`; capture also retries without it |
| MUI / custom dropdowns that open on mousedown | Records the dropdown itself, not the page background |
| Clicking a checkbox's label | Recorded once, not twice |
| Clicks on empty space | Ignored |
| Spinners, skeletons, animations, disabled buttons | Waits until loading indicators are gone and the element is enabled and still |
| Search-as-you-type lists from the server | Keeps looking for up to 15 s |
| Recording started with a dialog already open | Warns you to close it and press Alt+R again |
| Saved login expired | Says so, instead of "couldn't find the button" |
| Your app rejects duplicate data | `{{time}}` / `{{rand}}` variables |
| You don't want real records created | `--safe` / `"safe": true` / `"block"` |
| Viewers can't reach your app's images (behind login) | Images and fonts are embedded in the recording |
| Personal data on screen | `[data-private]`, `"mask"`, `"maskInputs"` |
| Something still fails | Clear message + `capture-failed-<name>.png` screenshot + `--watch` |

---

## Troubleshooting

| Message / problem | Fix |
|---|---|
| `couldn't find {...}` | Open `capture-failed-<name>.png` to see the screen. Usually: wrong start page, a dialog that no step opened, or changed text. Run with `--watch` to watch it happen. Fix the target in the script or record again. |
| `Capture landed on a login page` | Your saved login expired. Record again (log in, Alt+R, close). |
| `found … but something is covering it` | A dialog, cookie banner or overlay is on top. Add a step that closes it, or run with `--watch`. |
| `⚠ A dialog/modal is open` while recording | Close the dialog, press Alt+R again — the step that opens it must be recorded. |
| `rrweb didn't start… is the app running?` | Start your app first; check the `url` in the script. |
| Everything is in one step | Press Alt+N / ⌥ Option+N between steps — or split `actions` into steps by hand. |
| Nothing recorded in URL mode | You didn't press Alt+R / ⌥ Option+R after logging in. |
| `upload needs these files` | Put the named files in `tutorials/files/`. |
| `a loading indicator stayed on screen for 15 s` | Your app shows a permanent spinner/progress bar; capture stops waiting for indicators after that. |
| Component mode: blank page | The component needs providers — wrap it in `src/harness.tsx`. |

---

## Real data, privacy & safety

- **Actions are real.** In URL mode, "Submit" really submits — during the post-record check and **every capture**. Use a test account or staging, or `"safe": true`.
- **Recordings contain page text** and embedded images. Treat `public/recordings/*.json` like a screenshot of your app. Mask personal data with `data-private` / `"mask"`.
- **Passwords are never recorded**, and nothing before Alt+R is recorded. But `.auth/` holds a live session — it's in `.gitignore`; never share it.
- `capture-failed-*.png` screenshots may show real data — also in `.gitignore`.

---

## Project layout

```
tutorial-kit/
├── scripts/
│   ├── lib.mjs              open browser (URL / component), inject rrweb, recorder state
│   ├── recorder-client.js   runs in the page while recording: what was clicked, and how to find it
│   ├── record.mjs           you click → tutorials/<name>.tutorial.json → auto-check with capture
│   ├── capture.mjs          script → robot replay + rrweb → public/recordings/<name>.json
│   └── test-recorder.mjs    self-test (npm run test:recorder)
├── src/
│   ├── components/          drop components here (component mode); also test fixtures:
│   │                        SelectDemo (MUI-like dropdown), TestBench (dialog, duplicates, …), LoginDemo
│   ├── harness.tsx          mounts a component by name; add providers here
│   └── viewer/              <Tutorial /> — reuse in your app
├── tutorials/               scripts (*.tutorial.json); files/ for uploads
├── public/recordings/       captured recordings
├── .auth/                   saved logins — NEVER commit
├── index.html               viewer page
└── harness.html             component harness page
```

## Known limits

- `<canvas>`, WebGL and `<video>` content isn't captured.
- Native `<select>` menus are drawn by the OS — the open list won't show (the chosen value will).
- Hover-only menus need a `hover` action added by hand.
- Drag-and-drop isn't supported yet.
- Links that open a **new tab** aren't followed (the recording stays on the first tab).
- Cross-origin iframes aren't recorded.
- Remotion license: free for individuals and companies of up to 3 people; larger companies need a company license (then add `acknowledgeRemotionLicense` to `<Player>`).

## Roadmap

- [ ] Highlight box / caption overlay per step
- [ ] Drag-and-drop and new-tab support
- [ ] MP4 / WebM export of each step
- [ ] Browser-frame chrome around the page
- [ ] Publish as an npm package (`npx tutorial-kit record …`)
- [ ] CI job that re-captures when the UI changes
