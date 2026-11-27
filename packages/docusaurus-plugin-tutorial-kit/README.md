# docusaurus-plugin-tutorial-kit

Play [tutorial-kit](../../README.md) recordings on your Docusaurus pages: the real page, replayed step by step,
with a smooth cursor, zoom and captions — sharp at any size, because it's HTML, not video.

## Install

```bash
npm install docusaurus-plugin-tutorial-kit
```

```js
// docusaurus.config.js
export default {
  // …
  plugins: ['docusaurus-plugin-tutorial-kit'],
};
```

Docusaurus 3, React 18 or 19.

## Use

Put the recording at `static/recordings/<name>.json` (made with tutorial-kit), then in any `.md` / `.mdx` page:

```mdx
<TutorialPlayer name="create-ticket" />
```

No import needed. Options: `layout="side"` (steps beside the video), `zoom={false}`, `captions={false}`,
`colors={{accent: '#0f766e'}}`, or `src="/somewhere/else.json"` to play any file.

A download link for a video made with tutorial-kit (`static/videos/<name>.webm`):

```mdx
<VideoDownload file="videos/create-ticket.webm" size="1.2 MB" />
```

If you'd rather import them (or your site has its own `src/theme/MDXComponents`):

```mdx
import TutorialPlayer from '@theme/TutorialPlayer';
```

## Making guides

**In your docs site (studio):** install the dev dependency `tutorial-kit-studio` and turn it on:

```bash
npm install -D tutorial-kit-studio
```

```js
plugins: [['docusaurus-plugin-tutorial-kit', {studio: true}]],
```

`npm start` then also opens the editor at `http://localhost:5190/edit`: **● Record new**, edit, **Save** — the page
(`docs/<group>/<name>.mdx`), recording (`static/recordings/`), settings (`tutorials/`) and video (`static/videos/`)
are written straight into the site. Logins stay in `.tutorial-kit/` (git-ignored). Development only: `npm run build`
never runs it. Needs Google Chrome.

**Or in tutorial-kit itself:** record and edit there (`npm run dev` → `/edit` → **● Record new**).
Then **Export for Docusaurus** and copy its `docs/` and `static/` folders into your site: you get a ready-made page
(`docs/<category>/<name>.mdx`) and the recording (`static/recordings/<name>.json`). Or copy just the recording and
put `<TutorialPlayer name="<name>" />` on any page. Link to a ready-made page like any doc:
`[Create a ticket](/guides/create-ticket)`. See tutorial-kit's README, *From recording to a page on your docs site*.

## Options

```js
plugins: [['docusaurus-plugin-tutorial-kit', {recordings: '/guides/recordings'}]],
```

| Option | Default | |
|---|---|---|
| `recordings` | `/recordings` | URL folder the recordings are served from (`static/recordings/`) |
| `studio` | `false` | `true`: the editor during `npm start` (needs `tutorial-kit-studio`). Or `{port, docs, tutorials}`: its port (5190), the docs folder (`docs`), where `.tutorial.json` files go (`tutorials`) |

## Licence note

The player uses [Remotion](https://www.remotion.dev/license), which is free for individuals and companies of up to
3 people; larger companies need a Remotion company licence.
