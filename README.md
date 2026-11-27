# tutorial-kit

Turn a click-through of your React app into an animated, step-by-step tutorial —
like the "how it works" sections on product sites — without screen recording and without an LLM.

```
 ┌───────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
 │  record                   │ ──▶ │  recording .json         │ ──▶ │  <Tutorial /> page      │
 │  you click through it;    │     │  the page as HTML, split │     │  Remotion plays it with │
 │  rrweb films the page     │     │  into steps, pauses cut  │     │  cursor, zoom, captions │
 └───────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

> **Status: prototype.** Expect rough edges.

---

## Contents

- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Quick start (demo)](#quick-start-demo)
- [Use it on your own app](#use-it-on-your-own-app)
- [Keyboard shortcuts while recording](#keyboard-shortcuts-while-recording)
- [The editor (easiest)](#the-editor-easiest)
- [Step titles and captions](#step-titles-and-captions)
- [Video export (WebM / MP4)](#video-export-webm--mp4)
- [Help site (Docusaurus)](#help-site-docusaurus)
- [Docusaurus plugin (your own docs site)](#docusaurus-plugin-your-own-docs-site)
- [Show the tutorial in your React app](#show-the-tutorial-in-your-react-app)
- [Commands](#commands)
- [Real data, privacy & safety](#real-data-privacy--safety)
- [Optional: robot replay (capture)](#optional-robot-replay-capture)
- [Project layout](#project-layout)
- [Known limits](#known-limits)

---

## How it works

| Stage | Tool | What happens |
|---|---|---|
| **Record** | Playwright + rrweb | Opens Chrome. You do the task once. rrweb records the page **as you use it** — every DOM change (structure + styles, not pixels). Your clicks are noted too (where, and when you pressed Alt+N for a new step). Images and fonts are embedded. |
| **Tidy** | automatic | Everything before Alt+R is dropped. The session is split into steps. **Pauses are cut**: while you think or the app loads, the tutorial skips ahead, so it moves at a steady pace. Output: `public/recordings/<name>.json`. |
| **Play** | Remotion | For every video frame, rrweb rebuilds the page *exactly as it was at that moment*. A smooth cursor glides between your clicks, with click ripples; the view **zooms in** around each click (and while you type), and a **caption** says what's happening (*Click “Save”*, *Type “Widget” in Part name*). Step cards, progress bars and auto-advance come from `<Tutorial />`. |

**Nothing is replayed.** The tutorial shows what really happened while you clicked, so it works with any
widget — MUI dropdowns, autocompletes, dependent fields, dialogs — because it only watches.

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
npm run dev               # viewer at http://localhost:5180
```

Open **http://localhost:5180/?t=ticket-form**.

---

## Use it on your own app

**1. Start your app** as usual (or use staging), e.g. `http://localhost:3000`.

**2. Record:**

```bash
npm run record -- --url http://localhost:3000/tickets create-ticket
```

In the Chrome window that opens:

1. **Log in** if needed, and go to the screen where the tutorial starts.
2. Click inside the page, then press **Alt + R** (Mac: **⌥ Option + R**). The terminal prints `● Recording started`.
   Made a mistake? Press it again to **start over**.
3. Do the task at a normal pace — pauses are cut automatically. Press **Alt + N** (Mac: **⌥ Option + N**) before each new step.
4. **Close the window.**

You get:
- `public/recordings/create-ticket.json` — the tutorial
- `tutorials/create-ticket.tutorial.json` — step titles and captions to edit (see [Step titles and captions](#step-titles-and-captions))
- `.auth/localhost_3000.json` — your saved login, reused next time (**keep private**)

**3. View** — `npm run dev` → `http://localhost:5180/?t=create-ticket`

When the UI changes, record again — it takes as long as doing the task once.

**A single component instead of a whole app:** put it in `src/components/MyThing.tsx` (default export; wrap
providers in `src/harness.tsx`), then `npm run record -- MyThing my-thing` — it records immediately.
Preview it at `http://localhost:5180/harness.html?c=MyThing`.

Options: `--mask-inputs` hides everything typed into fields; `--no-inline-assets` doesn't embed images/fonts.

**Window size.** Recordings are 1280×720 unless you choose otherwise:

```bash
npm run record -- --url <start page> crs-tutorial --fullscreen        # maximized window, its full size
npm run record -- --url <start page> crs-tutorial --size 1920x1080    # a fixed size
```

With `--fullscreen` the page is as big as the window when you press Alt+R (on a Mac you can also press the green
button for real full screen first). Don't resize the window after Alt+R — `record` warns you if you did.
Bigger recordings show smaller text in the player, so zoom on clicks helps there. A fixed `--size` keeps all your
guides the same shape.

---

## Keyboard shortcuts while recording

| Windows / Linux | Mac | Does |
|---|---|---|
| Alt + R | ⌥ Option + R | Start recording (press again to start over) |
| Alt + N | ⌥ Option + N | Start a new step |
| *close the window* | *close the window* | Finish |

Click inside the page first so it has keyboard focus. The shortcuts never type into fields.

## The editor (easiest)

Everything below — recording, titles, captions, zoom, speed, colors, video, help site — also works from a page,
with the player showing each change as you make it:

```bash
npm run dev      →  http://localhost:5180/edit
```

- **● Record new**: enter the page address and a name, press **Open Chrome**. In that window, log in if needed and
  go to the first screen, then use the editor's buttons: **Start recording**, **Next step** before each new step,
  **Stop & save** when done (or **Start over**). Alt+R / Alt+N in the Chrome window still work. The new tutorial
  opens in the editor.
- **⇪ Import**: a recording (`public/recordings/<name>.json`) from another computer or a colleague, plus its
  `<name>.tutorial.json` if you have it (otherwise one is made from the recording) — each in its own box, so they can
  come from different folders. It opens in the editor.
- **Preview**: stays in view while you scroll the form. Its control bar has play/pause, a seek bar (click, drag, or
  ←/→ for a second), the time and the speed.
- **Tutorial / Look**: page title, description, help site group and position; zoom on/off and level, captions,
  colors (with color pickers).
- **Each step and action**: title, description, caption text (empty = hidden), zoom on/off and speed. **▶** shows
  that moment in the player.
- **Delete step** / **✕** on an action: a deleted step is left out of the player, the video and the help site. A
  deleted action is cut out — the video jumps from just before it to the next action (what it changed on the page
  stays, e.g. typed text). Both stay listed, greyed out, with **Restore**; the recording itself isn't changed.
- **Delete tutorial** (top bar): lists the tutorial's files — recording, tutorial file, videos, help site copy and
  page — and after you confirm, moves them into `deleted/<name>-<date>/` (git ignores it). **Undo** in the message
  puts them back; or move them back by hand later.
- **Save** (Ctrl+S / ⌘S) writes `tutorials/<name>.tutorial.json` — the same file you can still edit by hand.
  **Undo changes** goes back to the last save.
- **Video & help site**: WebM or MP4, title cards, size, zoom, captions and the step label → **Export video** (progress, a
  preview and a download link). **Add to help site** does `npm run docs` for this tutorial.

The editor only works under `npm run dev` on your computer (it saves files and runs the scripts); it isn't part of
the help site or a build.

## Step titles and captions

Steps are called "Step 1", "Step 2"… at first, and every action gets a caption made from what you did
(`Click “Save”`, `Type “Widget” in Part name`, `Choose “High”`). In `tutorials/<name>.tutorial.json`, edit each
step's `title` and `description`, and each action's `caption` (set it to `""` to hide that one), then:

```bash
npm run titles -- <name>
```

The same file has a `settings` block for the look of the tutorial — also applied by `npm run titles`
(recording the tutorial again keeps it):

```json
"settings": {
  "zoom": 1.8,
  "captions": true,
  "colors": {
    "accent": "#7c3aed",
    "click": "#7c3aed",
    "cursor": "#111111",
    "captionBg": "rgba(17, 17, 27, 0.86)",
    "captionText": "#ffffff"
  }
}
```

| Setting | Values |
|---|---|
| `zoom` | `false` = no zoom, `true` = default, or a level from `1` to `4` (e.g. `1.5`). Without `npm run titles`, edits still show on a reload of `npm run dev`, and the next time the help site starts or a video is exported |
| `captions` | `true` / `false` |
| `colors.accent` | step cards: active border, number, progress bar |
| `colors.click` | click ripple |
| `colors.cursor` | cursor arrow |
| `colors.captionBg`, `colors.captionText` | caption box and text |

Any CSS color works (`"#2563eb"`, `"rgb(37 99 235)"`, `"teal"`). Unknown or invalid values are reported and ignored.

**Zoom and speed at certain points.** A step or a single action can have its own `zoom` (on/off) and `speed`:

```json
"steps": [
  {
    "title": "Fill in the form",
    "speed": 2,
    "actions": [
      { "caption": "Click “+ New ticket”", "zoom": false },
      { "caption": "Type “Printer on floor 3 is jammed” in Title", "speed": 3 },
      { "caption": "Click “High”", "speed": 1 }
    ]
  }
]
```

| On a step or action | Values |
|---|---|
| `zoom` | `true` / `false` — zoom in at this action (or every action in the step). With `"settings": { "zoom": false }`, `true` zooms only where you say. |
| `speed` | `0.25` to `8` — `2` plays twice as fast, `0.5` at half speed. An action's speed lasts until the next action. |
| `deleted` | `true` — leave the step out, or cut the action out of the video (until the next action) |

An action's own value wins over its step's, which wins over `settings`. Speeds are part of the tutorial, so the
help site and exported videos use them too; viewers can still pick a playback speed with the player's control bar.
Zoom eases in a moment before each click, so turning zoom off for one action right before another that zooms may
still show the start of that zoom.

---

## Video export (WebM / MP4)

Make a real video file of a tutorial: for Teams/Slack, email, PowerPoint, an LMS, or any page where
an `<iframe>` isn't allowed. Same look as the player: zoom, captions, colors and your titles. It also adds a
title card at the start and a short card before each step.

```bash
npm run export -- crs-tutorial            # → videos/crs-tutorial.webm
npm run export                            # every recorded tutorial
npm run export -- crs-tutorial --mp4      # MP4 (H.264): plays everywhere, incl. PowerPoint and older Safari
```

| Option | |
|---|---|
| `--mp4` | MP4 instead of WebM |
| `--no-cards` | No title cards, just the steps |
| `--no-zoom`, `--no-captions` | Turn those off for this video (otherwise the tutorial file's settings are used) |
| `--no-step-label` | No “Step 2 of 3 · title” label in the top-left corner (shown by default) |
| `--scale 0.75` | Smaller video (1 = the size of the window you recorded in). `--scale 2` is sharp on Retina/HiDPI screens (4× the pixels: slower, bigger) |
| `--out <folder>` | Where to save (default `videos/`, which git ignores) |

Videos are made from lossless frames, as WebM (VP9) or MP4 (H.264), so thin borders and faint greys stay crisp —
about 15–20 MB per minute at full size. For the sharpest result of all, use the live player (help site or `<iframe>`):
it rebuilds the real page instead of showing pixels.

Your edits in the tutorial file are applied first. Rendering takes about a minute per minute of video. It uses your
installed Google Chrome, so nothing is downloaded (this also works on company networks that block downloads). Only if
Chrome isn't found does it download a headless Chrome (~100 MB, once). `TK_CHROME=/path/to/chrome` picks another
browser; `TK_CHROME=download` always uses the downloaded one.

Run `npm run docs` afterwards and the guide's help page gets a **Download the video** link, plus `<video>` embed code
in *Embed this guide in another page*.

To put a video on a page yourself: `<video src="crs-tutorial.webm" controls playsinline style="width:100%"></video>`.

---

## Help site (Docusaurus)

`help-site/` is a [Docusaurus](https://docusaurus.io) site for all your guides: a sidebar, search that works
offline, dark mode, and one page per tutorial with the player and the steps written out as text.

**First time:** `npm --prefix help-site install`

**Add guides one by one as you record them:**

```bash
npm run record -- --url <start page> crs-tutorial   # record
#   edit tutorials/crs-tutorial.tutorial.json: title, description, category, step titles, captions
npm run docs -- crs-tutorial                         # add/update its page
npm run docs                                         # …or add/update every recorded tutorial
npm run help                                         # preview at http://localhost:3000
```

Page details in the tutorial file:

| Field | Meaning |
|---|---|
| `title` | Page title (also the sidebar entry) |
| `description` | Intro under the title, and the text on the home-page card |
| `category` | Sidebar group, e.g. `"Components"` — tutorials with the same category are listed together |
| `order` | Optional number to set the position within its group |

What `npm run docs` writes:
- `help-site/docs/<category>/<name>.mdx` — the page. To edit a page by hand, delete the line
  `tutorial_kit: generated` at its top — after that, `npm run docs` updates only its recording and leaves the text alone.
- `help-site/static/recordings/<name>.json` — the recording
- `help-site/src/guides.json` — the list of guides on the home page

You can write your own pages too (any `.md`/`.mdx` file in `help-site/docs/`), and put a player anywhere in one:

```mdx
import TutorialPlayer from '@site/src/components/TutorialPlayer';

<TutorialPlayer name="crs-tutorial" />
<TutorialPlayer name="crs-tutorial" zoom={false} captions={false} layout="side" />
```

**Embed a guide in any other web page** (Confluence, SharePoint, plain HTML): each guide page has
*Embed this guide in another page* with the `<iframe>` code to copy. It points to `/embed?t=<name>` — just the
player. Options in the address: `&zoom=0`, `&captions=0`, `&layout=side`.

**Already have a Docusaurus site?** Use **Export for Docusaurus** in the editor (or `npm run docusaurus -- <name>`).
It adds the guide to `exports/docusaurus/` (git ignores it), laid out like a Docusaurus site — `docs/<category>/<name>.mdx`,
`static/recordings/`, `static/videos/` (if you exported a video) and the player in `src/`. Copy that folder's contents
into the root of your site. `HOW-TO-ADD.md` in it has the one-time `npm install` (remotion, @remotion/player, rrweb) and
how to use `<TutorialPlayer name="…" />` on your own pages. Export again and copy over the old files to update a guide.

**Publish the site:** `npm run help:build` makes static files in `help-site/build/` — copy that folder to any web
server (no Node needed there). Set `url` and `baseUrl` in `help-site/docusaurus.config.ts` first
(`baseUrl: '/help/'` if it's served from a `/help/` folder). Try the build locally with `npm run help:serve`.
Name, logo and brand color: `title` in `docusaurus.config.ts`, `help-site/static/img/logo.svg`,
`--ifm-color-primary` in `help-site/src/css/custom.css`.

---

## Docusaurus plugin (your own docs site)

`packages/docusaurus-plugin-tutorial-kit` puts the player into any Docusaurus 3 site, so pages just say
`<TutorialPlayer name="…" />` — no copied code, no imports.

```bash
npm run plugin:pack        # → packages/docusaurus-plugin-tutorial-kit/docusaurus-plugin-tutorial-kit-<version>.tgz
```

In your docs site: `npm install <that .tgz>` (or from your registry once published), then add
`plugins: ['docusaurus-plugin-tutorial-kit']` to `docusaurus.config`. Put recordings in `static/recordings/`
(**Export for Docusaurus** does this: with the plugin, copy only its `docs/` and `static/`). See the package's README.

There are two ways to make guides for your docs site:

- **Studio (recommended)** — record and edit **inside your docs site**: `npm start` there also opens the editor, and
  everything is saved straight into the site. Nothing to copy. See *Studio* below.
- **Copy** — record here in tutorial-kit, then copy the files over. See *From recording to a page on your docs site*.

### Studio: record and edit inside your docs site

One-time setup in the docs site (each person who makes guides does the install; the config is shared via git):

```bash
npm run plugin:pack && npm run studio:pack   # here, in tutorial-kit → two .tgz files in packages/…
```

```bash
# in your docs site
npm install <path>/docusaurus-plugin-tutorial-kit-0.1.0.tgz
npm install -D <path>/tutorial-kit-studio-0.1.0.tgz      # recorder, editor, video export — dev only
```

```js
// docusaurus.config.js
plugins: [['docusaurus-plugin-tutorial-kit', {studio: true}]],
```

(Once both are on your registry: `npm install docusaurus-plugin-tutorial-kit` and `npm install -D tutorial-kit-studio`.)
Google Chrome must be installed (recording uses it).

Then, every time:

1. `npm start` in the docs site. Besides the site, it prints
   `[tutorial-kit] tutorial-kit studio: http://localhost:5190/edit` — open that.
2. **● Record new** → page address + name → **Open Chrome** → log in if needed → **Start recording** → do the task,
   **Next step** between steps → **■ Stop & save**. The guide's page appears in the docs site right away.
3. Edit titles, captions, zoom… → **Save**. The page updates (the site reloads by itself).
4. **Export video** (optional) — the page gets a download link.
5. Commit the new files with the rest of your docs, as usual.

Where things are saved, all inside the docs site:

| What | Where |
|---|---|
| the page | `docs/<sidebar group>/<name>.mdx` (group "Guides" if none) |
| the recording | `static/recordings/<name>.json` |
| the editable settings, titles, captions | `tutorials/<name>.tutorial.json` |
| the video | `static/videos/<name>.webm` |
| logins (private) and deleted guides | `.tutorial-kit/` — it has its own `.gitignore`, so it's never committed |

- **Your own words on the page:** remove the page's `tutorial_kit: generated` line. From then on the studio never
  changes that page (move it anywhere under `docs/`), but Save still updates the recording it plays.
- **Another sidebar group:** change *Sidebar group* and Save — the page moves to that folder.
- **The guide on other pages:** `<TutorialPlayer name="<name>" />` in any `.md`/`.mdx`. Link to the page like any doc.
- **Delete tutorial** moves its files (and the page, unless you edited it) into `.tutorial-kit/deleted/`; **Undo** restores.
- Options: `studio: {port: 5191}` (another port), `{docs: 'guides'}` (a docs folder other than `docs/`),
  `{tutorials: 'guides-src'}` (where the `.tutorial.json` files go).
- **Safe:** the studio runs only during `npm start` (never in `npm run build`, so nothing of it is published), listens
  only on your computer, and refuses requests from other web pages.

### From recording to a page on your docs site (copy)

Without the studio, recording and editing happen **here, in tutorial-kit**, and your docs site only shows the result.
For every new guide:

1. **Record** — in tutorial-kit: `npm run dev`, open `http://localhost:5180/edit`, click **● Record new**. Enter the
   page address and a name (e.g. `create-ticket`), **Open Chrome**, log in if needed, then **Start recording**, do the
   task, **Next step** between steps, **■ Stop & save**. (Or `npm run record -- --url <address> create-ticket`.)
2. **Edit** — still in the editor: step titles and descriptions, captions, zoom, speed, delete what you don't want.
   **Save** (Ctrl+S / ⌘S).
3. **Video (optional)** — **Export video** if you also want a download link on the page.
4. **Export** — **Export for Docusaurus**. It writes into `exports/docusaurus/` in tutorial-kit:
   - `docs/<category>/create-ticket.mdx` — a ready-made page: the player, the video link, the steps as text
   - `static/recordings/create-ticket.json` — the recording (and `static/videos/create-ticket.webm` if you made one)
5. **Copy** `exports/docusaurus/docs` and `exports/docusaurus/static` into the root of your docs site (merge with the
   folders there). With the plugin you don't need its `src/` folder.
6. **Check** — `npm start` in your docs site. The new page is in the sidebar under its category (the tutorial's
   `category` setting; "Guides" if none). Commit and deploy your docs site as usual.

**Putting a guide on a page of your own** instead of (or as well as) the ready-made page: copy only
`static/recordings/create-ticket.json`, then in any `.md`/`.mdx` page write

```mdx
<TutorialPlayer name="create-ticket" />
```

The `name` is the recording's file name without `.json`. The same guide can be on as many pages as you like.

**Linking to it** from other pages: a normal docs link to the ready-made page, e.g. `[Create a ticket](/guides/create-ticket)`
(the path is `docs/` folder + file name, without `.mdx`; moving the file moves the link).

**Changing a guide later:** open it in the editor, change and **Save**, **Export for Docusaurus** again, copy over the
old files. (Want to keep your own text on the ready-made page? Remove its `tutorial_kit: generated` line — but then
copying a newer export over it replaces your edits, so copy just the recording.)

**Re-recording:** record again with the **same name** — it replaces the recording. The guide's title, description,
category and look (zoom, captions, colours) are kept; step titles and captions start fresh, so redo those in the
editor. Then export and copy as above.

**Publishing to an internal registry (e.g. Artifactory):** set `publishConfig.registry` in
`packages/docusaurus-plugin-tutorial-kit/package.json` to your npm registry URL, raise `version`, run
`npm run plugin:build`, then `npm publish` in that folder (after `npm login --registry <url>`). Same for the studio:
`packages/tutorial-kit-studio/package.json`, `npm run studio:build`, `npm publish` there. Only their built files and
README are published — never recordings, tutorial files or logins. Others then install them like any package
(with your registry set in their `.npmrc`).

## Show the tutorial in your React app

The viewer is one component: `src/viewer/Tutorial.tsx`.

1. In your app: `npm i remotion @remotion/player rrweb` (keep all `remotion` / `@remotion/*` versions identical).
2. Copy `src/viewer/` (`Tutorial.tsx`, `Tutorial.css`, `RrwebClip.tsx`, `motion.ts`, `settings.ts`, `time.ts`, `types.ts`) into your app.
   `layout="stacked"` puts the player on top with the step cards below (good for narrow columns).
   `step={1}` opens on the 2nd step (0 = the first); `at={1500}` opens it paused 1.5 s in. On the demo page: `?t=<name>&step=2&at=1500` (here 2 = the 2nd step).
3. Copy the recording JSON into your app's `public/` folder.
4. Use it:

```tsx
import { Tutorial } from "./viewer/Tutorial";

<Tutorial src="/recordings/create-ticket.json" />

// Override the tutorial file's settings for this page (any of them):
<Tutorial src="/recordings/create-ticket.json" zoom={false} captions={false} colors={{ accent: "#2563eb", click: "#2563eb" }} />
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
| `npm run dev` | Viewer + harness at `http://localhost:5180`, the editor at `/edit` |
| `npm run record -- --url <url> <name>` | Record a tutorial on your running app |
| `npm run record -- <Component> [name]` | Record on a component from `src/components/` |
| `npm run titles -- <name>` | Apply titles, captions and settings from `tutorials/<name>.tutorial.json` |
| `npm run docs [-- <name>]` | Add/update guides in the help site |
| `npm run help` | Preview the help site at `http://localhost:3000` |
| `npm run plugin:pack` | Build the Docusaurus plugin and make its `.tgz` (`plugin:build` = build only) |
| `npm run studio:pack` | Build tutorial-kit-studio (record and edit inside a Docusaurus site) and make its `.tgz` (`studio:build` = build only) |
| `npm run docusaurus [-- <name>]` | A folder (`exports/docusaurus/`) to copy into your own Docusaurus site |
| `npm run help:build` | Build the help site into `help-site/build/` for hosting |
| `npm run export [-- <name>]` | Make a video: `videos/<name>.webm` (`--mp4` for MP4) |
| `npm run capture -- <name> [--watch] [--safe]` | Optional robot replay — see [below](#optional-robot-replay-capture) |
| `npm run test:recorder` | Self-test (~2 min): recording, timing, the player, and every command run for real |
| `npm run typecheck` | TypeScript check |

Viewer URL: `http://localhost:5180/?t=<name>`

---

## Real data, privacy & safety

- **The recording shows what was on screen.** Use a test account / staging data if the tutorial will be shared. Treat `public/recordings/*.json` like a screenshot of your app.
- **Hide personal data:** add `data-private` to elements (text becomes `***`), `data-tk-block` to leave them out entirely, or record with `--mask-inputs`.
- **Passwords are never recorded**, and nothing before Alt+R is kept (so logging in isn't in the tutorial).
- `.auth/` holds a live login session — it's in `.gitignore`; never share it.

---

## Optional: robot replay (capture)

`npm run record` is all you need. This is an alternative: a robot **redoes** the actions saved in
`tutorials/<name>.tutorial.json` and films the robot — e.g. to remake a tutorial without clicking through it.
It overwrites `public/recordings/<name>.json`. It's less reliable than filming you (the robot has to find
every element again and get the timing right), and it **really performs the actions** — use `--safe` on real systems.

### The script file

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

#### Actions

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

#### Targets — how an element is found

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

#### Variables

Use these in `type` text so each robot run types something new (handy when your app rejects duplicates):

| Variable | Example |
|---|---|
| `{{time}}` | `142305` |
| `{{date}}` | `2026-11-24` |
| `{{rand}}` | `4821` |
| `{{ts}}` | `1795620185000` |

---

### Capture options

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

## Project layout

```
tutorial-kit/
├── scripts/
│   ├── record.mjs           npm run record: film your session → public/recordings/<name>.json
│   ├── session.mjs          the filming: rrweb + clicks → steps, pauses cut
│   ├── recorder-client.js   runs in the page while recording: what was clicked, where, how to find it
│   ├── lib.mjs              open browser (URL / component), inject rrweb, embed images, recorder state
│   ├── titles.mjs, apply.mjs  npm run titles (apply your edits to the recording)
│   ├── script-core.mjs      the tutorial-file rules (shared with the editor's live preview)
│   ├── dev-api.mjs          the editor's save / export / record helpers (npm run dev only)
│   ├── docs.mjs             npm run docs (add guides to the help site)
│   ├── export.mjs           npm run export (WebM / MP4 video)
│   ├── capture.mjs          optional robot replay
│   └── test-recorder.mjs    self-test (npm run test:recorder)
├── src/
│   ├── components/          drop components here (component mode); also test fixtures
│   ├── harness.tsx          mounts a component by name; add providers here
│   ├── viewer/              <Tutorial /> — reuse in your app
│   ├── editor/              the editor page (/edit)
│   └── video/               the video composition for npm run export
├── help-site/               Docusaurus help site (docs/, static/recordings/, static/videos/, src/components/)
├── tutorials/               step titles + actions (*.tutorial.json); files/ for robot uploads
├── public/recordings/       recordings the viewer plays
├── .auth/                   saved logins — NEVER commit
├── index.html               viewer page
└── harness.html             component harness page
```

## Known limits

- `<canvas>` (e.g. some charts), WebGL and `<video>` content isn't recorded.
- Native `<select>` menus are drawn by the OS — the open list won't show (the chosen value will).
- Pure-CSS `:hover` styles don't show (menus that open on hover via JavaScript do).
- Links that open a **new tab** aren't followed (the recording stays on the first tab).
- Cross-origin iframes aren't recorded.
- Mistakes you make while recording stay in — press Alt+R to start over.
- Remotion license: free for individuals and companies of up to 3 people; larger companies need a company license (then add `acknowledgeRemotionLicense` to `<Player>`).

## Roadmap

- [ ] Cut out a mistake without recording again
- [ ] Highlight box around the clicked element
- [ ] New-tab support
- [ ] Publish as an npm package (`npx tutorial-kit record …`)
