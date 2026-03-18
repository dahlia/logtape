LLM integration
===============

LogTape ships with built-in support for AI coding assistants through the
[Agent Skills] standard.  This means tools like [Claude Code], [GitHub Copilot],
[Cursor], [Windsurf], and [many others][Agent Skills] can automatically learn
how to use LogTape correctly when working on your project.

[Agent Skills]: https://agentskills.io/
[Claude Code]: https://claude.com/claude-code
[GitHub Copilot]: https://github.com/features/copilot
[Cursor]: https://cursor.com/
[Windsurf]: https://windsurf.com/


What the skill provides
-----------------------

The bundled agent skill teaches AI assistants:

 -  How to get loggers with hierarchical categories
 -  The structured message syntax (named placeholders, not string interpolation)
 -  Configuration rules (`configure()` and `configureSync()`)
 -  The library author rule (never call `configure()` in library code)
 -  Context management with `with()`, `withContext()`, and `lazy()`
 -  Sink and formatter setup
 -  Adaptor integration for existing loggers (winston, Pino, log4js)
 -  Testing patterns
 -  Common mistakes to avoid

This complements the [llms.txt] file, which provides a broad overview of the
library for general-purpose LLM consumption.

[llms.txt]: https://logtape.org/llms.txt


Setting up with skills-npm
--------------------------

[skills-npm] by Anthony Fu scans *node\_modules* for packages that declare
skills and symlinks them into the appropriate agent directories.

1.  Install *skills-npm* as a dev dependency:

    :::code-group

    ~~~~ bash [npm]
    npm install -D skills-npm
    ~~~~


    ~~~~ bash [pnpm]
    pnpm add -D skills-npm
    ~~~~


    ~~~~ bash [Yarn]
    yarn add -D skills-npm
    ~~~~


    ~~~~ bash [Bun]
    bun add -D skills-npm
    ~~~~

    :::

2.  Add a `prepare` script to your *package.json*:

    ~~~~ json
    {
      "scripts": {
        "prepare": "skills-npm"
      }
    }
    ~~~~

3.  Run `npm install` (or your package manager's equivalent).  This symlinks
    skills from *node\_modules* into the appropriate agent directories
    (e.g., *.claude/skills/*, *.cursor/skills/*).

4.  Add the generated symlinks to your *.gitignore*:

    ~~~~ text
    skills/npm-*
    ~~~~

After this one-time setup, the skill stays in sync with the installed version
of LogTape.  Every `npm install` refreshes the symlinks automatically.

[skills-npm]: https://github.com/antfu/skills-npm


Setting up with npm-agentskills
-------------------------------

[npm-agentskills] by onmax is another tool that discovers agent skills from
npm packages.  It offers a CLI and a Nuxt module.

[npm-agentskills]: https://github.com/onmax/npm-agentskills

### CLI usage

~~~~ bash
npx agents export --target claude
~~~~

You can also export to other agents:

~~~~ bash
npx agents export --target cursor
npx agents export --target codex
~~~~

To see all discovered skills:

~~~~ bash
npx agents list
~~~~

### Automatic setup via postinstall

Add to your *package.json*:

~~~~ json
{
  "scripts": {
    "postinstall": "agents export --target claude"
  }
}
~~~~

### Nuxt integration

For Nuxt projects, add the module and skills are discovered automatically
when running `nuxi prepare` or `nuxi dev`.


Manual setup
------------

If you prefer not to use a discovery tool, you can set up the skill manually
for your specific AI coding assistant.

### Claude Code

Copy or symlink the skill directory into your project:

~~~~ bash
mkdir -p .claude/skills
cp -r node_modules/@logtape/logtape/skills/logtape .claude/skills/logtape
~~~~

### Cursor

~~~~ bash
mkdir -p .cursor/skills
cp -r node_modules/@logtape/logtape/skills/logtape .cursor/skills/logtape
~~~~

### Other agents

Most Agent Skills-compatible tools look for skills in a directory like
*.\<agent\>/skills/* in your project root.  Consult your tool's documentation
for the exact path.


Setting up for Deno
-------------------

For Deno users who install LogTape from JSR, the skill file is accessible
directly from the repository.  You can reference it by URL or copy it into
your project's skill directory manually.


How it works
------------

The `@logtape/logtape` *package.json* declares the skill using the `agents`
field:

~~~~ json
{
  "agents": {
    "skills": [
      { "name": "logtape", "path": "./skills/logtape" }
    ]
  }
}
~~~~

When a discovery tool like *skills-npm* or *npm-agentskills* runs, it reads
this field from every package in *node\_modules* and copies or symlinks the
skill directories so that agent tools can discover and load them.  The skill's
`description` field in its frontmatter tells the agent *when* to activate it,
so it loads automatically whenever the agent is working on logging-related code.

> [!NOTE]
> The `agents` field is purely metadata.  It does not add any runtime
> dependencies or affect how LogTape works.


Also available: llms.txt
------------------------

LogTape's documentation site also generates an [llms.txt] file following the
[llms.txt standard].  This file provides a comprehensive overview of the entire
library and is useful for general-purpose LLM tools that support the standard.

While the agent skill focuses on *how to write code* with LogTape (practical
rules and common mistakes), *llms.txt* focuses on *what LogTape is* (API
surface, concepts, and documentation links).

[llms.txt standard]: https://llmstxt.org/
