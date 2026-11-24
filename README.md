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

> **Status: prototype.** Works end-to-end on the demo component. Expect rough edges on real apps.

---

## Contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Quick start (demo)](#quick-start-demo)
- [Use it on your own app](#use-it-on-your-own-app)
  - [Option A — your running app (URL mode)](#option-a--your-running-app-url-mode)
  - [Option B — a single component (component mode)](#option-b--a-single-component-component-mode)
- [The script file](#the-script-file)
- [Show the tutorial in your React app](#show-the-tutorial-in-your-react-app)
- [Commands](#commands)
- [Project layout](#project-layout)
- [Tuning](#tuning)
- [Troubleshooting](#troubleshooting)
- [Real data, privacy & safety](#real-data-privacy--safety)
- [Known limits](#known-limits)
- [Roadmap](#roadmap)

---

## How it works

| Stage | Tool | What happens |
|---|---|---|
| **Record** *(optional)* | Playwright | Opens Chrome. You click and type through the task once. Each action is saved as a human-readable step ("click the button named *New ticket*", "type *…* into *Title*"). |
| **Capture** | Playwright + rrweb | A headless Chrome replays the script **for real** on your app. rrweb records every DOM change (structure + styles, not pixels). The cursor targets are measured from the real elements. Output: `public/recordings/<name>.json`. |
| **Play** | Remotion | For every video frame, rrweb shows the page *exactly as it was at that moment*, and a smooth fake cursor with click ripples is drawn on top. Step cards, progress bars and auto-advance come from `<Tutorial />`. |

Your app's code is **never modified** — rrweb is injected into the page from outside by Playwright.

## Requirements

- Node.js 18+ (tested on 22)
- Google Chrome installed (Playwright drives your installed Chrome — no extra browser download)

```bash
npm install
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

Best when you're happy to use real (or staging) data. No wrappers or mocks needed.

**1. Start your app** as usual, e.g. `npm start` → `http://localhost:3000`.

**2. Record** the task:

```bash
npm run record -- --url http://localhost:3000/tickets create-ticket
```

In the Chrome window that opens:

1. **Log in** if needed, and go to the screen where the tutorial should start.
2. Click inside the page, then press **Alt + R** (Mac: **⌥ Option + R**) → recording starts (nothing before this is recorded, so your login isn't).
3. Do the task. Press **Alt + N** (Mac: **⌥ Option + N**) before each new step.
4. **Close the window** to finish.

This writes:
- `tutorials/create-ticket.tutorial.json` — the script
- `.auth/localhost_3000.json` — your saved login (cookies/localStorage), reused by capture. **Keep private.**

**3. Name your steps.** Open the script and replace `"Step 1"`, `"Step 2"`… with real titles and descriptions.

**4. Capture:**

```bash
npm run capture -- create-ticket
```

**5. View** (your app must still be running so images/fonts load):

```
npm run dev   →   http://localhost:5180/?t=create-ticket
```

> Re-run step 4 whenever the UI changes — no need to record again.

### Option B — a single component (component mode)

Best for isolated components, demo data, or when you don't want to touch a real backend.

1. Put the component in `src/components/MyThing.tsx` (as a **default export**).
2. If it needs providers (router, store, theme, auth), wrap it in `src/harness.tsx`.
3. Record and capture:

```bash
npm run record  -- MyThing my-thing        # Alt+N = new step, close window to finish
npm run capture -- my-thing
```

4. View at `http://localhost:5180/?t=my-thing`.

You can preview any component on its own at `http://localhost:5180/harness.html?c=MyThing`.

---

## The script file

`tutorials/<name>.tutorial.json` — written by `record`, or by hand:

```json
{
  "url": "http://localhost:3000/tickets",
  "auth": ".auth/localhost_3000.json",
  "steps": [
    {
      "title": "Open a new ticket",
      "description": "Click “New ticket” at the top right.",
      "actions": [
        { "action": "click", "target": { "role": "button", "name": "+ New ticket", "exact": true } }
      ]
    },
    {
      "title": "Describe the problem",
      "description": "Give the ticket a short, clear title.",
      "actions": [
        { "action": "type", "target": { "label": "Title" }, "text": "Printer on 3rd floor is jammed" }
      ]
    }
  ]
}
```

Use `"component": "TicketForm"` instead of `"url"` for component mode.

### Actions

| Action | Fields | Example |
|---|---|---|
| `click` | `target` | `{ "action": "click", "target": { "role": "button", "name": "Save" } }` |
| `type` | `target`, `text` | `{ "action": "type", "target": { "label": "Email" }, "text": "demo@company.com" }` |
| `wait` | `ms` | `{ "action": "wait", "ms": 1000 }` — pause, e.g. to let a result show |

### Targets — how an element is found

Checked in this order; use whichever is most stable for your UI:

| Target | Matches | Example |
|---|---|---|
| `testId` | `data-testid="…"` | `{ "testId": "new-ticket" }` ← **most robust** |
| `label` | a form field by its label / aria-label | `{ "label": "Title" }` |
| `role` + `name` | button, link, tab… by accessible name | `{ "role": "button", "name": "Save" }` |
| `text` | any element by visible text | `{ "text": "My tickets" }` |
| `css` | CSS selector (last resort) | `{ "css": ".toolbar button:nth-child(2)" }` |

Add `"exact": true` to require a full match (otherwise `"Save"` also matches `"Save draft"`).

**Tip:** adding `data-testid` to the buttons/inputs your tutorials use makes them survive text and layout changes.

---

## Show the tutorial in your React app

The viewer is one component: `src/viewer/Tutorial.tsx`.

1. Install in your app: `npm i remotion @remotion/player rrweb` (keep all `remotion` / `@remotion/*` versions identical).
2. Copy `src/viewer/` (`Tutorial.tsx`, `Tutorial.css`, `RrwebClip.tsx`, `types.ts`) into your app.
3. Copy the recording JSON into your app's `public/` folder.
4. Use it:

```tsx
import { Tutorial } from "./viewer/Tutorial";

<Tutorial src="/recordings/create-ticket.json" />
```

Tip — load it lazily so Remotion (~500 KB) only downloads when the tutorial is shown:

```tsx
const Tutorial = React.lazy(() => import("./viewer/Tutorial").then((m) => ({ default: m.Tutorial })));
<Suspense fallback={<div style={{ aspectRatio: "16/9" }} />}><Tutorial src="…" /></Suspense>
```

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Viewer + harness at `http://localhost:5180` |
| `npm run record -- --url <url> <name>` | Record on your running app (Alt+R start, Alt+N new step, close to finish) |
| `npm run record -- <Component> [name]` | Record on a component from `src/components/` |
| `npm run capture -- <name>` | Replay `tutorials/<name>.tutorial.json` and write `public/recordings/<name>.json` |
| `npm run typecheck` | TypeScript check |
| `npm run test:recorder` | Self-test: records a custom dropdown with a real mouse and replays it |

Viewer URL: `http://localhost:5180/?t=<name>`

## Project layout

```
tutorial-kit/
├── scripts/
│   ├── lib.mjs            shared: open browser (URL / component), inject rrweb, saved login
│   ├── record.mjs         you click → tutorials/<name>.tutorial.json
│   └── capture.mjs        script → robot replay + rrweb → public/recordings/<name>.json
├── src/
│   ├── components/        drop components here (component mode)
│   ├── harness.tsx        mounts a component by name; add providers here
│   └── viewer/
│       ├── Tutorial.tsx   step cards + Remotion player  ← reuse in your app
│       ├── RrwebClip.tsx  one step: rrweb replay at frame N + cursor
│       └── types.ts
├── tutorials/             scripts (*.tutorial.json) — safe to commit
├── public/recordings/     captured recordings (contain page text — see privacy)
├── .auth/                 saved logins — NEVER commit
├── index.html             viewer page
└── harness.html           component harness page
```

## Tuning

Pacing lives in `PACE` at the top of `scripts/capture.mjs` (milliseconds):

| Key | Default | Meaning |
|---|---|---|
| `stepIntro` | 400 | pause at the start of each step |
| `move` | 700 | how long the cursor takes to glide to a target |
| `typeDelay` | 60 | per character while typing |
| `afterAction` | 600 | pause after each click/type |
| `stepOutro` | 500 | pause at the end of each step |

The capture viewport is 1280×720 (`VIEWPORT` in `scripts/lib.mjs`).

## Troubleshooting

| Problem | Fix |
|---|---|
| `couldn't find {"role":"button","name":"…"}` | The name doesn't match the page. Check the exact visible text (e.g. `"+ New ticket"` not `"New ticket"`), drop `"exact": true`, or use a `testId`. |
| `rrweb didn't start… is the app running?` | Start your app first, and check the `url` in the script. |
| Capture lands on the login page | Your saved login expired. Run `record` again (log in, Alt+R, close) to refresh `.auth/…json`. |
| Recorded everything as one step | You didn't press Alt+N. Split the `actions` into separate steps in the script by hand. |
| Nothing recorded in URL mode | You didn't press Alt+R after logging in. |
| Images/fonts missing in the viewer | The recording loads them from your app's URL — keep the app running, or serve it where viewers can reach it. |
| Component mode: blank page | The component needs providers — wrap it in `src/harness.tsx`. Check `harness.html?c=Name` directly. |
| Alt+N / Alt+R do nothing | Click inside the page first so it has keyboard focus. On a Mac use ⌥ Option. |
| `couldn't find {"text":"<option>"}` after a dropdown | The click that *opened* the dropdown wasn't captured (recorded before the dropdown fix, or skipped as `body`). Re-record, or add `{ "action": "click", "target": { "role": "combobox", "name": "<field label>" } }` before the option click. |

## Real data, privacy & safety

- **Actions are real.** In URL mode, "Create ticket" really creates a ticket — every time you run capture. Use a test account or staging environment.
- **Recordings contain page text** (names, emails, numbers on screen). Treat `public/recordings/*.json` like a screenshot of your app.
- **Passwords are not recorded** (password fields are skipped, and recording starts only after Alt+R), but `.auth/` holds a live session — keep it out of git (it's in `.gitignore`).
- Real data changes, so each capture may look slightly different.

## Known limits

- `<canvas>`, WebGL and `<video>` content isn't captured by rrweb.
- Native `<select>` dropdown menus are drawn by the OS, so the open list won't show (the chosen value will).
- Hover-only UI (tooltips, menus that open on hover) isn't recorded as an action yet.
- Drag-and-drop, file uploads and keyboard shortcuts aren't supported actions yet.
- Pages from other origins inside iframes aren't recorded.
- Remotion license: free for individuals and companies of up to 3 people; larger companies need a company license (then add `acknowledgeRemotionLicense` to `<Player>`).

## Roadmap

- [ ] More actions: `hover`, `press` (keys), `select`, `scroll`, `drag`, `goto`
- [ ] Highlight box / caption overlay per step
- [ ] Mock API responses for repeatable captures
- [ ] MP4 / WebM export of each step
- [ ] Browser-frame chrome around the page
- [ ] Publish as an npm package (`npx tutorial-kit record …`)
- [ ] CI job that re-captures when the UI changes
