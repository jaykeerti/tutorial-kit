# Help site

A [Docusaurus](https://docusaurus.io) site for the guides recorded with tutorial-kit.
See **"Help site (Docusaurus)"** in the main README (`../README.md`).

```bash
npm install            # first time
npm start              # preview at http://localhost:3000
npm run build          # static files in build/ — copy to any web server
```

Guides are added from the tutorial-kit folder with `npm run docs -- <name>`.
`src/tutorial-kit/` is copied from `../src/viewer/` automatically before start/build — edit the player there.
