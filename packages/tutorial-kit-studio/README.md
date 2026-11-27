# tutorial-kit-studio

Record and edit [tutorial-kit](../../README.md) guides from inside your Docusaurus site. It is started by
[docusaurus-plugin-tutorial-kit](../docusaurus-plugin-tutorial-kit/README.md) during `npm start`, and saves everything
into the site.

```bash
npm install -D tutorial-kit-studio
```

```js
// docusaurus.config.js
plugins: [['docusaurus-plugin-tutorial-kit', {studio: true}]],
```

`npm start` → open `http://localhost:5190/edit` → **● Record new**. Saved into your site:

| What | Where |
|---|---|
| the page | `docs/<sidebar group>/<name>.mdx` |
| the recording | `static/recordings/<name>.json` |
| titles, captions, settings | `tutorials/<name>.tutorial.json` |
| the video (Export video) | `static/videos/<name>.webm` |
| logins and deleted guides | `.tutorial-kit/` (git-ignored by its own `.gitignore`) |

Remove a page's `tutorial_kit: generated` line to write it yourself; the studio then leaves it alone.

Needs Google Chrome (recording) and Node 18+. The first video export downloads a renderer once.
Development only: a production build never starts it, and it only answers requests from your own computer.

Built from the tutorial-kit repo with `npm run studio:build` (or `studio:pack` for a `.tgz`).

Video export uses [Remotion](https://www.remotion.dev/license): free for individuals and companies of up to 3 people;
larger companies need a Remotion company licence.
