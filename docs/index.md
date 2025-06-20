---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "LogTape"
  text: "Unobtrusive logging<br/>for modern JavaScript"
  tagline: "Zero dependencies. Universal runtime. Optimized performance."
  image:
    src: /logtape.svg
    alt: LogTape
  actions:
  - theme: brand
    text: Get Started
    link: /manual/start
  - theme: alt
    text: Why LogTape?
    link: /intro
  - theme: alt
    text: Compare Libraries
    link: /comparison

features:
- icon: 🎯
  title: The only truly unobtrusive logger
  details: >-
    Add logging to your libraries without bothering your users.
    No configuration? No logs. It's that simple and respectful.
  link: /manual/library
- icon: ⚡
  title: Zero performance impact
  details: >-
    Log as much as you want during development, then deploy with confidence.
    When logging is off, there's virtually no overhead at all.
- icon: 🌍
  title: Universal runtime support
  details: >-
    Write once, run everywhere. Works great in Node.js, Deno, Bun, web browsers,
    and edge functions. No polyfills, no surprises.
  link: /manual/install
- icon: ✨
  title: Zero maintenance burden
  details: >-
    Install once and forget about it. No dependencies to babysit, no security alerts
    to stress about. Just 5.3KB of pure simplicity.
- icon: 🔍
  title: Smart context management
  details: >-
    Track requests and user sessions effortlessly. Bind data to specific loggers
    or let it flow automatically through your call stack.
  link: /manual/contexts
- icon: 🔧
  title: Easy to extend
  details: >-
    Need custom logging behavior? Just write a simple function.
    No complicated inheritance or confusing APIs to wrestle with.
  link: /manual/sinks
- icon: 🤝
  title: Plays well with others
  details: >-
    Works with OpenTelemetry, Sentry, CloudWatch Logs, syslog, and friends.
    Plus adapters for winston and pino if you're migrating.
- icon: 📁
  title: Organize with nested categories
  details: >-
    Each library gets its own namespace like <code>["my-lib", "feature"]</code>.
    Perfect isolation with automatic inheritance. No more log conflicts between dependencies.
  link: /manual/categories
- icon: 🔥
  title: Modern JavaScript, done right
  details: >-
    TypeScript types included, no extra packages needed. Supports both ESM and CommonJS.
    Works beautifully with <code>async</code>/<code>await</code> and all the modern patterns you love.
---

<!-- cSpell: ignore struct -->
