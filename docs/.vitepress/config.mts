import { transformerTwoslash } from "@shikijs/vitepress-twoslash";
import deflist from "markdown-it-deflist";
import footnote from "markdown-it-footnote";
import { jsrRef } from "markdown-it-jsr-ref";
import process from "node:process";
import { defineConfig } from "vitepress";
import {
  groupIconMdPlugin,
  groupIconVitePlugin,
} from "vitepress-plugin-group-icons";
import llmstxt from "vitepress-plugin-llms";

const jsrRefVersion =
  process.env.CI === "true" && process.env.GITHUB_REF_TYPE === "tag"
    ? "stable"
    : "unstable";

const jsrRefPackages: readonly (readonly [string, string])[] = [
  ["@logtape/logtape", ".jsr-cache.json"],
  ["@logtape/adaptor-bunyan", ".jsr-cache-adaptor-bunyan.json"],
  ["@logtape/adaptor-log4js", ".jsr-cache-adaptor-log4js.json"],
  ["@logtape/adaptor-pino", ".jsr-cache-adaptor-pino.json"],
  ["@logtape/adaptor-winston", ".jsr-cache-adaptor-winston.json"],
  ["@logtape/cloudwatch-logs", ".jsr-cache-cloudwatch-logs.json"],
  ["@logtape/config", ".jsr-cache-config.json"],
  ["@logtape/drizzle-orm", ".jsr-cache-drizzle-orm.json"],
  ["@logtape/elysia", ".jsr-cache-elysia.json"],
  ["@logtape/express", ".jsr-cache-express.json"],
  ["@logtape/fastify", ".jsr-cache-fastify.json"],
  ["@logtape/file", ".jsr-cache-file.json"],
  ["@logtape/hono", ".jsr-cache-hono.json"],
  ["@logtape/koa", ".jsr-cache-koa.json"],
  ["@logtape/otel", ".jsr-cache-otel.json"],
  ["@logtape/pretty", ".jsr-cache-pretty.json"],
  ["@logtape/redaction", ".jsr-cache-redaction.json"],
  ["@logtape/sentry", ".jsr-cache-sentry.json"],
  ["@logtape/syslog", ".jsr-cache-syslog.json"],
  ["@logtape/windows-eventlog", ".jsr-cache-windows-eventlog.json"],
];

const jsrRefSettled = await Promise.allSettled(
  jsrRefPackages.map(([packageName, cachePath]) =>
    jsrRef({
      package: packageName,
      version: jsrRefVersion,
      cachePath,
    })
  ),
);

const jsrRefPlugins = jsrRefSettled.flatMap((result, index) => {
  if (result.status === "fulfilled") return [result.value];
  const [packageName] = jsrRefPackages[index];
  console.warn(
    `[markdown-it-jsr-ref] Failed to load references for ${packageName}; ` +
      `affected JSR doc links will render as plain code. ` +
      `Reason: ${result.reason}`,
  );
  return [];
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
    { text: "Lazy evaluation", link: "/manual/lazy" },
    { text: "Sinks", link: "/manual/sinks" },
    { text: "Filters", link: "/manual/filters" },
    { text: "Text formatters", link: "/manual/formatters" },
    { text: "Data redaction", link: "/manual/redaction" },
    { text: "Adaptors", link: "/manual/adaptors" },
    { text: "Integration", link: "/manual/integrations" },
    { text: "Using in libraries", link: "/manual/library" },
    { text: "Debugging", link: "/manual/debug" },
    { text: "Testing", link: "/manual/testing" },
    { text: "LLM integration", link: "/manual/llm" },
  ],
};

const SINKS = {
  text: "Sinks",
  items: [
    { text: "Console sink", link: "/manual/sinks#console-sink" },
    { text: "Stream sink", link: "/manual/sinks#stream-sink" },
    { text: "File sink", link: "/sinks/file" },
    { text: "Rotating file sink", link: "/sinks/file#rotating-file-sink" },
    { text: "OpenTelemetry", link: "/sinks/otel" },
    { text: "Sentry", link: "/sinks/sentry" },
    { text: "Syslog", link: "/sinks/syslog" },
    { text: "CloudWatch Logs", link: "/sinks/cloudwatch-logs" },
    { text: "Windows Event Log", link: "/sinks/windows-eventlog" },
  ],
};

const REFERENCES = {
  text: "References",
  items: [
    { text: "@logtape/logtape", link: "https://jsr.io/@logtape/logtape/doc" },
    { text: "@logtape/config", link: "https://jsr.io/@logtape/config/doc" },
    {
      text: "@logtape/adaptor-bunyan",
      link: "https://jsr.io/@logtape/adaptor-bunyan/doc",
    },
    {
      text: "@logtape/adaptor-log4js",
      link: "https://jsr.io/@logtape/adaptor-log4js/doc",
    },
    {
      text: "@logtape/adaptor-pino",
      link: "https://jsr.io/@logtape/adaptor-pino/doc",
    },
    {
      text: "@logtape/adaptor-winston",
      link: "https://jsr.io/@logtape/adaptor-winston/doc",
    },
    {
      text: "@logtape/cloudwatch-logs",
      link: "https://jsr.io/@logtape/cloudwatch-logs/doc",
    },
    {
      text: "@logtape/drizzle-orm",
      link: "https://jsr.io/@logtape/drizzle-orm/doc",
    },
    { text: "@logtape/elysia", link: "https://jsr.io/@logtape/elysia/doc" },
    { text: "@logtape/express", link: "https://jsr.io/@logtape/express/doc" },
    { text: "@logtape/fastify", link: "https://jsr.io/@logtape/fastify/doc" },
    { text: "@logtape/hono", link: "https://jsr.io/@logtape/hono/doc" },
    { text: "@logtape/koa", link: "https://jsr.io/@logtape/koa/doc" },
    { text: "@logtape/file", link: "https://jsr.io/@logtape/file/doc" },
    { text: "@logtape/otel", link: "https://jsr.io/@logtape/otel/doc" },
    { text: "@logtape/pretty", link: "https://jsr.io/@logtape/pretty/doc" },
    {
      text: "@logtape/redaction",
      link: "https://jsr.io/@logtape/redaction/doc",
    },
    { text: "@logtape/sentry", link: "https://jsr.io/@logtape/sentry/doc" },
    { text: "@logtape/syslog", link: "https://jsr.io/@logtape/syslog/doc" },
    {
      text: "@logtape/windows-eventlog",
      link: "https://jsr.io/@logtape/windows-eventlog/doc",
    },
  ],
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "LogTape",
  description:
    "Unobtrusive logging library with zero dependencies—library-first design for Deno, Node.js, Bun, browsers, and edge functions",
  cleanUrls: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: "/logo.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "What is LogTape?", link: "/intro" },
      { text: "Comparison", link: "/comparison" },
      MANUAL,
      SINKS,
      REFERENCES,
      ...extraNav,
    ],

    sidebar: [
      { text: "What is LogTape?", link: "/intro" },
      { text: "Comparison", link: "/comparison" },
      { text: "Changelog", link: "/changelog" },
      MANUAL,
      SINKS,
      REFERENCES,
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
    // Explicitly load these languages for twoslash types highlighting
    languages: [
      "js",
      "jsx",
      "ts",
      "tsx",
      "typescript",
      "bash",
      "sh",
      "shell",
      "json",
      "ansi",
      "text",
      "txt",
    ],
    codeTransformers: [
      transformerTwoslash({
        twoslashOptions: {
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            types: [
              "dom",
              "dom.iterable",
              "esnext",
              "@types/deno",
              "node",
            ],
          },
        },
      }),
    ],
    config(md) {
      md.use(deflist);
      md.use(footnote);
      md.use(groupIconMdPlugin);
      for (const plugin of jsrRefPlugins) {
        md.use(plugin);
      }
    },
  },
  sitemap: {
    hostname: process.env.SITEMAP_HOSTNAME,
  },
  vite: {
    plugins: [
      groupIconVitePlugin(),
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
