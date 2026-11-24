import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// The help site. Tutorials are added with  npm run publish  (from the tutorial-kit folder),
// which writes pages into docs/ and recordings into static/recordings/.
// Change title/url/baseUrl below for where you host it.

const config: Config = {
  title: 'Help',
  tagline: 'Step-by-step guides',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  // Where the site will live. baseUrl must match the folder it's served from, e.g. '/help/'.
  url: 'https://help.example.internal',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/', // the docs are the whole site
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      // Search that works offline / behind the firewall — no external service.
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        docsRouteBasePath: '/',
        indexBlog: false,
        highlightSearchTermsOnTargetPage: true,
      },
    ],
  ],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Help',
      logo: {
        alt: 'Help',
        src: 'img/logo.svg',
      },
      items: [],
    },
    footer: {
      style: 'light',
      copyright: `Guides recorded with tutorial-kit`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
