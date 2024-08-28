---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "LogTape"
  text: "Simple logging library with<br/>zero dependencies"
  tagline: For every JavaScript runtime
  image:
    src: /logtape.svg
    alt: LogTape
  actions:
  - theme: brand
    text: Install
    link: /manual/install
  - theme: alt
    text: What is LogTape?
    link: /intro
  - theme: alt
    text: Quick start
    link: /manual/start

features:
- icon: 🈚
  title: Zero dependencies
  details: LogTape has zero dependencies. You can use LogTape without worrying about the dependencies of LogTape.
- icon: 📚
  title: Library support
  details: LogTape is designed to be used in libraries as well as applications. You can use LogTape in libraries to provide logging capabilities to users of the libraries.
- icon: 🔌
  title: Runtime diversity
  details: >-
    LogTape supports <a href="https://deno.com/">Deno</a>, <a
    href="https://nodejs.org/">Node.js</a>, <a href="https://bun.sh/">Bun</a>,
    edge functions, and browsers. You can use LogTape in various environments
    without changing the code.
  link: /manual/install
- icon: 🗃️
  title: Structured logging
  details: You can log messages with structured data.
  link: /manual/start#structured-logging
- icon: 🌲
  title: Hierarchical categories
  details: LogTape uses a hierarchical category system to manage loggers. You can control the verbosity of log messages by setting the log level of loggers at different levels of the category hierarchy.
  link: /manual/categories
- icon: ✒️
  title: Template literals
  details: LogTape supports template literals for log messages. You can use template literals to log messages with placeholders and values.
  link: /manual/start#how-to-log
---

