What is LogTape?
================

LogTape is a logging library for JavaScript and TypeScript.  It provides a
simple and flexible logging system that is easy to use and easy to extend.
The highlights of LogTape are:

 -  *Zero dependencies*: LogTape has zero dependencies.  You can use LogTape
    without worrying about the dependencies of LogTape.

 -  [*Library support*](./manual/library.md): LogTape is designed to be used
    in libraries as well as applications.  You can use LogTape in libraries
    to provide logging capabilities to users of the libraries.

 -  [*Runtime diversity*](./manual/install.md): LogTape supports [Deno],
    [Node.js], [Bun], edge functions, and browsers.  You can use LogTape in
    various environments without changing the code.

 -  [*Structured logging*](./manual/start.md#structured-logging): You can log
    messages with structured data.

 -  [*Hierarchical categories*](./manual/categories.md): LogTape uses
    a hierarchical category system to manage loggers.  You can control
    the verbosity of log messages by setting the log level of loggers at
    different levels of the category hierarchy.

 -  [*Template literals*](./manual/start.md#how-to-log): LogTape supports
    template literals for log messages.  You can use template literals to log
    messages with placeholders and values.

 -  [*Built-in data redaction*](./manual/redaction.md): LogTape provides robust
    capabilities to redact sensitive information from logs using pattern-based
    or field-based approaches.

 -  [*Dead simple sinks*](./manual/sinks.md): You can easily add your own sinks
    to LogTape.

 -  [*Framework integrations*](./manual/integrations.md): First-class support
    for popular web frameworks like [Express], [Fastify], [Hono], [Koa], and
    ORMs like [Drizzle ORM] with automatic HTTP request logging and database
    query logging.

![LogTape web console output](./screenshots/web-console.png)
![LogTape terminal output](./screenshots/terminal.png)

[Deno]: https://deno.com/
[Node.js]: https://nodejs.org/
[Bun]: https://bun.sh/
[Express]: https://expressjs.com/
[Fastify]: https://fastify.dev/
[Hono]: https://hono.dev/
[Koa]: https://koajs.com/
[Drizzle ORM]: https://orm.drizzle.team/
