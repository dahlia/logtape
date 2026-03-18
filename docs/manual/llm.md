LLM integration
===============

LogTape ships with built-in support for AI coding assistants through the
[Agent Skills] standard.  This means tools like [Claude Code], [GitHub Copilot],
[Cursor], [Windsurf], and others can automatically learn how to use LogTape
correctly when working on your project.

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
 -  Configuration rules (`configure()` is app-only, must be `await`ed)
 -  The library author rule (never call `configure()` in library code)
 -  Context management with `with()` and `lazy()`
 -  Testing patterns
 -  Common mistakes to avoid

This complements the [llms.txt] file, which provides a broad overview of the
library for general-purpose LLM consumption.

[llms.txt]: https://logtape.org/llms.txt


Setting up with npm (recommended)
---------------------------------

The skill is bundled inside the `@logtape/logtape` npm package.  To expose it
to your AI coding assistant, use [skills-npm]:

1.  Install *skills-npm* as a dev dependency:

    ~~~~ bash
    npm install -D skills-npm
    ~~~~

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
    (e.g., *.claude/skills/*, *.cursor/rules/*).

4.  Add `skills/npm-*` to your *.gitignore*:

    ~~~~ text
    skills/npm-*
    ~~~~

After this one-time setup, the skill stays in sync with the installed version
of LogTape.  Every `npm install` refreshes the symlinks automatically.

[skills-npm]: https://github.com/antfu/skills-npm


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

When *skills-npm* runs, it reads this field from every package in
*node\_modules* and creates symlinks so that agent tools can discover and load
the skills.  The skill's `description` field in its frontmatter tells the agent
*when* to activate it, so it loads automatically whenever the agent is working
on logging-related code.

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
