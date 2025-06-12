import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import { jsrRef } from "markdown-it-jsr-ref";
import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

const jsrRefVersion =
  process.env.CI === "true" && process.env.GITHUB_REF_TYPE === "tag"
    ? "stable"
    : "unstable";

const jsrRef_logtape = await jsrRef({
  package: "@logtape/logtape",
  version: jsrRefVersion,
  cachePath: ".jsr-cache.json",
});

const jsrRef_file = await jsrRef({
  package: "@logtape/file",
  version: jsrRefVersion,
  cachePath: ".jsr-cache-file.json",
});

const jsrRef_otel = await jsrRef({
  package: "@logtape/otel",
  version: jsrRefVersion,
  cachePath: ".jsr-cache-otel.json",
});

const jsrRef_redaction = await jsrRef({
  package: "@logtape/redaction",
  version: jsrRefVersion,
  cachePath: ".jsr-cache-redaction.json",
});

let extraNav: { text: string; link: string }[] = [];
if (process.env.EXTRA_NAV_TEXT && process.env.EXTRA_NAV_LINK) {
  extraNav = [
    {
      text: process.env.EXTRA_NAV_TEXT,
      link: process.env.EXTRA_NAV_LINK,
    },
  ];
}

const head: [string, Record<string, string>][] = [
  ["link", { rel: "icon", href: "/logtape.svg" }],
];
if (process.env.PLAUSIBLE_DOMAIN) {
  head.push(
    [
      "script",
      {
        defer: "defer",
        "data-domain": process.env.PLAUSIBLE_DOMAIN,
        src: "https://plausible.io/js/script.outbound-links.js",
      },
    ],
  );
}

const MANUAL = {
  text: "Manual",
  items: [
    { text: "Installation", link: "/manual/install" },
    { text: "Quick start", link: "/manual/start" },
    { text: "Configuration", link: "/manual/config" },
    { text: "Categories", link: "/manual/categories" },
    { text: "Severity levels", link: "/manual/levels" },
    { text: "Structured logging", link: "/manual/struct" },
    { text: "Contexts", link: "/manual/contexts" },
    { text: "Sinks", link: "/manual/sinks" },
    { text: "Filters", link: "/manual/filters" },
    { text: "Text formatters", link: "/manual/formatters" },
    { text: "Data redaction", link: "/manual/redaction" },
    { text: "Using in libraries", link: "/manual/library" },
    { text: "Testing", link: "/manual/testing" },
  ],
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "LogTape",
  description:
    "Simple logging library with zero dependencies for Deno, Node.js, Bun, browsers, and edge functions",
  cleanUrls: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: "Home", link: "/" },
      { text: "What is LogTape?", link: "/intro" },
      MANUAL,
      { text: "API reference", link: "https://jsr.io/@logtape/logtape" },
      ...extraNav,
    ],

    sidebar: [
      { text: "What is LogTape?", link: "/intro" },
      { text: "Changelog", link: "/changelog" },
      MANUAL,
    ],

    outline: {
      level: [2, 4],
    },

    socialLinks: [
      {
        icon: {
          svg:
            '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>JSR</title><path d="M3.692 5.538v3.693H0v7.384h7.385v1.847h12.923v-3.693H24V7.385h-7.385V5.538Zm1.846 1.847h1.847v7.384H1.846v-3.692h1.846v1.846h1.846zm3.693 0h5.538V9.23h-3.692v1.846h3.692v5.538H9.231V14.77h3.692v-1.846H9.231Zm7.384 1.846h5.539v3.692h-1.846v-1.846h-1.846v5.538h-1.847z"/></svg>',
        },
        link: "https://jsr.io/@logtape/logtape",
        ariaLabel: "JSR",
      },
      { icon: "npm", link: "https://www.npmjs.com/package/@logtape/logtape" },
      { icon: "github", link: "https://github.com/dahlia/logtape" },
    ],

    search: {
      provider: "local",
    },

    editLink: {
      pattern: "https://github.com/dahlia/logtape/edit/main/docs/:path",
    },
  },
  head: head,
  markdown: {
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            types: [
              "dom",
              "dom.iterable",
              "esnext",
              "@teidesu/deno-types/full",
            ],
          },
        },
      }),
    ],
    config(md) {
      md.use(jsrRef_logtape);
      md.use(jsrRef_file);
      md.use(jsrRef_otel);
      md.use(jsrRef_redaction);
    },
  },
  sitemap: {
    hostname: process.env.SITEMAP_HOSTNAME,
  },
  vite: {
    plugins: [
      llmstxt(),
    ],
  },

  async transformHead(context) {
    return [
      [
        "meta",
        { property: "og:title", content: context.title },
      ],
      [
        "meta",
        { property: "og:description", content: context.description },
      ],
    ];
  },
});
