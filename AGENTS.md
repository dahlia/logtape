LogTape development guidelines for AI assistants
================================================

This document provides comprehensive instructions for AI coding assistants (like
GitHub Copilot, Claude, etc.) working with the LogTape codebase. Follow these
guidelines to ensure your contributions align with project standards.


Repository information
----------------------

> [!IMPORTANT]
> Upstream repository is *dahlia/logtape*

All GitHub operations (issues, pull requests, etc.) must be performed against
the upstream repository *dahlia/logtape*, not personal forks.

### GitHub operations

#### Issues

 -  Always create issues against *dahlia/logtape*
 -  Use: `gh issue create --repo dahlia/logtape`
 -  Reference issues as: `dahlia/logtape#123`

#### Pull requests

 -  Always create pull requests against *dahlia/logtape*
 -  Use: `gh pr create --repo dahlia/logtape`
 -  Target the appropriate base branch (usually *main* for new features)

#### Common commands

~~~~ bash
# Check issues in upstream
gh issue list --repo dahlia/logtape

# Create PR to upstream
gh pr create --repo dahlia/logtape --title "Your Title" --body "Your description"

# View upstream PRs
gh pr list --repo dahlia/logtape
~~~~


Project overview
----------------

LogTape is a zero-dependency logging library for JavaScript and TypeScript that
works across multiple runtimes (Deno, Node.js, Bun, browsers, edge functions).
Key features include:

 -  Structured logging with hierarchical categories
 -  Template literal support
 -  Extensible sink system
 -  Cross-runtime compatibility
 -  Library-friendly design


Codebase structure
------------------

The project uses a unique *dual workspace* architecture that combines both
Deno workspace and pnpm workspace features:

### Dual workspace setup

 -  *Deno Workspace*: Defined in the root *deno.json* with workspace members
 -  *pnpm Workspace*: Defined in *pnpm-workspace.yaml* for Node.js ecosystem
    compatibility
 -  Each package must be listed in BOTH workspace configurations
 -  This enables seamless cross-runtime development and publishing

### Current packages

All packages are located in the *packages/* directory:

 -  *packages/logtape/*: Core logging functionality
 -  *packages/adaptor-pino/*: Pino logger adaptor
 -  *packages/adaptor-winston/*: Winston logger adaptor
 -  *packages/cloudwatch-logs/*: AWS CloudWatch Logs sink
 -  *packages/drizzle-orm/*: Drizzle ORM integration
 -  *packages/express/*: Express HTTP request logging
 -  *packages/fastify/*: Fastify HTTP request logging
 -  *packages/file/*: File-based logging sink
 -  *packages/hono/*: Hono HTTP request logging
 -  *packages/koa/*: Koa HTTP request logging
 -  *packages/otel/*: OpenTelemetry integration
 -  *packages/pretty/*: Pretty console formatter
 -  *packages/redaction/*: Functionality for redacting sensitive information
 -  *packages/sentry/*: Sentry integration
 -  *packages/syslog/*: Syslog sink
 -  *packages/windows-eventlog/*: Windows Event Log sink

### Package structure

Each package follows a consistent structure with:

 -  *mod.ts*: Main entry point exposing the public API
 -  *\*.ts*: Implementation files
 -  *\*.test.ts*: Test files matching their respective implementation
 -  *deno.json*: Deno configuration and workspace membership
 -  *package.json*: npm package configuration and workspace membership
 -  *tsdown.config.ts*: Cross-platform build configuration (replaces *dnt.ts*)

### Adding new packages

When adding a new package to the workspace:

 1. Create the package directory inside *packages/* with both *deno.json* and
    *package.json*
 2. Add the package to *both* workspace configurations:
     -  Add to `packages:` array in *pnpm-workspace.yaml*
     -  Add to `workspace:` array in root *deno.json*
 3. Configure dependencies using the dual dependency management system
 4. Update documentation:
     -  Add JSR ref configuration and register it in *docs/.vitepress/config.mts*
        (add to both the `jsrRef_*` variables and the `REFERENCES` constant)
     -  Add the package to the packages table in the root *README.md*


Coding conventions
------------------

### TypeScript standards

 1. *Strict TypeScript*: The project uses strict TypeScript. All code must be
    properly typed.
 2. *Explicit types*: Prefer explicit type annotations for function parameters
    and return types.
 3. *Interfaces vs types*: Use `interface` for public APIs and `type` for
    complex types.
 4. *Readonly*: Use `readonly` for immutable properties.
 5. *Type guards*: Use type guards for runtime type checking.

### Naming conventions

 1. *Modules*: Use camelCase for filenames and import specifiers.
 2. *Classes/Interfaces*: Use PascalCase.
 3. *Variables/Functions/Methods*: Use camelCase.
 4. *Constants*: Use camelCase for constants (NOT ALL_CAPS).
 5. *Private members*: Prefix with `_` (e.g., `_privateMethod`).

### Code style

 1. *Formatting*: The project uses `deno fmt` for formatting.
 2. *Comments*: Use JSDoc for all public APIs.
 3. *Line length*: Keep lines under 80 characters when possible.
 4. *Import organization*: Organize imports alphabetically.
 5. *Error handling*: Always handle errors explicitly, never swallow them.

### Branch structure

 -  *main*: Contains new features for the next major/minor version
 -  *X.Y-maintenance*: Contains bug fixes for the next patch version of a
    specific release (e.g., *0.9-maintenance*)


Testing
-------

### Test framework

The project uses *@alinea/suite* for cross-runtime testing compatibility,
along with `@std/assert` for assertions.

### Test organization

 1. Each implementation file has a corresponding *\*.test.ts* file
 2. Tests are organized using *@alinea/suite*'s `suite()` function
 3. Each test should focus on a single piece of functionality
 4. Tests run across multiple runtimes: Deno, Node.js, and Bun

### Test structure

~~~~ typescript
import { suite } from "@alinea/suite";
import { assertEquals } from "@std/assert/equals";

const test = suite(import.meta);

test("ComponentName.methodName()", () => {
  // Test code
  assertEquals(actual, expected);
});

test("ComponentName.methodName() with multiple assertions", () => {
  // Setup code

  // Test multiple aspects
  assertEquals(actual1, expected1);
  assertEquals(actual2, expected2);

  // Cleanup code if needed
});
~~~~

### Cross-runtime testing

The project supports testing across multiple JavaScript runtimes:

 -  *Deno*: Native runtime, tests run directly
 -  *Node.js*: Requires build step, uses Node's built-in test runner
 -  *Bun*: Requires build step, uses Bun's test runner

### Running tests

~~~~ bash
# Run Deno tests only
deno task test

# Run tests with coverage (Deno)
deno task coverage

# Run tests across ALL runtimes (Deno, Node.js, Bun)
deno task test-all

# Run tests for specific runtime
deno task test:node    # Node.js only
deno task test:bun     # Bun only

# Individual package testing
deno task test:node:logtape    # Test logtape package in Node.js
deno task test:bun:file        # Test file package in Bun
~~~~

### Test workflow

For Node.js and Bun testing:

 1. Packages are built using *tsdown* to generate CommonJS/ESM outputs
 2. Tests run against the built packages in *dist/* directories
 3. This ensures cross-runtime compatibility of the published packages


Development workflow
--------------------

### Build system

The project uses *tsdown* for cross-platform package building:

 -  Replaces the previous *dnt.ts* configuration
 -  Generates both ESM and CommonJS outputs
 -  Supports platform-specific builds (Node.js, Deno, Bun)
 -  Each package has its own *tsdown.config.ts* configuration

### Building packages

~~~~ bash
# Build all packages
deno task build

# Build specific packages
deno task build:logtape
deno task build:file
deno task build:otel
deno task build:redaction
deno task build:sentry
~~~~

### Checking code

Before submitting changes, run:

~~~~ bash
deno task check
~~~~

This runs:

 -  `deno check`: Type checking across all workspace members
 -  `deno lint`: Linting
 -  `deno fmt --check`: Format checking
 -  `deno task check:versions`: Version consistency check across packages

### Workspace vs package-level tasks

 -  *Workspace-level tasks*: Run from the root directory using `deno task`
 -  *Package-level tasks*: Run from individual package directories or using `-f`
    flag
 -  Cross-runtime testing requires building packages first

### Git hooks

The project uses git hooks:

 -  *pre-commit*: Runs `deno task check` to verify code quality
 -  *pre-push*: Runs `deno task check` and `deno task test` to verify
    functionality

To install hooks:

~~~~ bash
deno task hooks:install
~~~~

### CI/CD

The project uses GitHub Actions for:

 -  Running tests across multiple platforms (macOS, Ubuntu, Windows)
 -  Cross-runtime testing (Deno, Node.js, Bun)
 -  Checking code style and types
 -  Building packages with tsdown
 -  Generating test coverage reports
 -  Publishing to JSR and npm
 -  Monorepo-aware package publishing


Documentation
-------------

### Code documentation

 -  Use JSDoc comments for all public APIs
 -  Document parameters, return types, and exceptions
 -  Include examples for complex functionality

Example:

~~~~ typescript
/**
 * Creates a logger for the specified category.
 *
 * @param category The category for the logger.
 * @returns A logger instance.
 *
 * @example
 * ```ts
 * const logger = getLogger("my-app");
 * logger.info("Hello, {name}!", { name: "world" });
 * ```
 */
export function getLogger(category?: Category | string): Logger {
  // Implementation
}
~~~~

### User documentation

User documentation is available at <https://logtape.org/> and is structured as:

 -  Installation
 -  Quick start
 -  Configuration
 -  Core concepts (categories, severity levels, structured logging, contexts)
 -  Output (sinks, filters, text formatters)
 -  Data redaction
 -  Adaptors (Pino, Winston)
 -  Framework integration (Express, Fastify, Hono, Koa, Drizzle ORM)
 -  Advanced usage (library usage, debugging, testing)

When adding or changing functionality, update both the code documentation and
user documentation as needed.


Markdown style guide
--------------------

When creating or editing Markdown documentation files in this project,
follow these style conventions to maintain consistency with existing
documentation:

### Headings

 -  *Setext-style headings*: Use underline-style for the document title
    (with `=`) and sections (with `-`):

    ~~~~
    Document title
    ==============

    Section name
    ------------
    ~~~~

 -  *ATX-style headings*: Use only for subsections within a section:

    ~~~~
    ### Subsection name
    ~~~~

 -  *Heading case*: Use sentence case (capitalize only the first word and
    proper nouns) rather than Title Case:

    ~~~~
    Development commands    <- Correct
    Development Commands    <- Incorrect
    ~~~~

### Text formatting

 -  *Italics* (`*text*`): Use for package names (*@logtape/logtape*,
    *@logtape/otel*), emphasis, and to distinguish concepts
 -  *Bold* (`**text**`): Use sparingly for strong emphasis
 -  *Inline code* (`` `code` ``): Use for code spans, function names,
    filenames, and command-line options

### Lists

 -  Use ` -  ` (space-hyphen-two spaces) for unordered list items
 -  Indent nested items with 4 spaces
 -  Align continuation text with the item content:

    ~~~~
     -  *First item*: Description text that continues
        on the next line with proper alignment
     -  *Second item*: Another item
    ~~~~

### Code blocks

 -  Use four tildes (`~~~~`) for code fences instead of backticks
 -  Always specify the language identifier:

    ~~~~~
    ~~~~ typescript
    const example = "Hello, world!";
    ~~~~
    ~~~~~

 -  For shell commands, use `bash`:

    ~~~~~
    ~~~~ bash
    deno test
    ~~~~
    ~~~~~

### Links

 -  Use reference-style links placed at the *end of each section*
    (not at document end)
 -  Format reference links with consistent spacing:

    ~~~~
    See the [LogTape documentation] for more details.

    [LogTape documentation]: https://logtape.org/
    ~~~~

### GitHub alerts

Use GitHub-style alert blocks for important information:

 -  *Note*: `> [!NOTE]`
 -  *Tip*: `> [!TIP]`
 -  *Important*: `> [!IMPORTANT]`
 -  *Warning*: `> [!WARNING]`
 -  *Caution*: `> [!CAUTION]`

Continue alert content on subsequent lines with `>`:

~~~~
> [!CAUTION]
> This feature is experimental and may change in future versions.
~~~~

### Tables

Use pipe tables with proper alignment markers:

~~~~
| Package              | Description                   |
| -------------------- | ----------------------------- |
| @logtape/logtape     | Core logging functionality    |
~~~~

### Spacing and line length

 -  Wrap lines at approximately 80 characters for readability
 -  Use one blank line between sections and major elements
 -  Use two blank lines before Setext-style section headings
 -  Place one blank line before and after code blocks
 -  End sections with reference links (if any) followed by a blank line


Changelog guidelines
--------------------

The project maintains a detailed changelog in *CHANGES.md* that follows specific
principles and formatting:

### Changelog principles

 1. *User-focused changes*: Document changes from the user's perspective, not
    implementation details. Focus on what users of the library will experience,
    not how it was implemented.

 2. *API documentation*: Clearly document all API changes, including:
     -  Additions of new functions, types, interfaces, or constants
     -  Changes to existing API types or signatures (include both old and new
        types)
     -  Deprecation notices
     -  Removals or relocations of APIs between packages

 3. *Attribution*: Include attribution to contributors where applicable, with
    links to their PRs or issues.

 4. *Versioning*: Each version has its own section with release date (when
    applicable).

### When to update the changelog

Update the changelog when:

 -  Adding, changing, or removing public APIs
 -  Fixing bugs that affect user behavior
 -  Making performance improvements that users would notice
 -  Changing behavior of existing functionality
 -  Moving code between packages

Do NOT update the changelog for:

 -  Internal implementation changes that don't affect users
 -  Documentation-only changes
 -  Test-only changes
 -  Build system changes

### Changelog format

 1. *Structure*:
     -  Top-level heading for the project name
     -  Second-level heading for each version number
     -  Version status ("To be released" or "Released on DATE")
     -  Bulleted list of changes

 2. *Entry format*:
     -  Use `-` for list items
     -  Nest related sub-items with indentation
     -  Link issue/PR numbers using `[[#XX]]` or `[[#XX] by Contributor Name]`
     -  For API changes, include the full type signature changes

 3. *Order*:
     -  Group related changes together
     -  List additions first, then changes, then fixes

### Example entry

~~~~
Version X.Y.Z
-------------

Released on Month Day, Year.

 -  Added `newFunction()` function to perform X.  [[#42]]

 -  Changed the type of the `existingFunction()` function to
    `(param: string) => number` (was `(param: string) => void`).

 -  Fixed a bug where X happened when Y was expected.  [[#43], [#44] by Contributor]
~~~~


Cross-runtime compatibility
---------------------------

LogTape supports multiple JavaScript runtimes:

 -  Deno
 -  Node.js
 -  Bun
 -  Browsers
 -  Edge functions

Ensure new code works across all supported environments. Use the
*@david/which-runtime* library to detect runtime-specific behavior when
necessary.


Dependency management
---------------------

The project uses a *dual dependency management* system to maintain version
consistency across packages and runtimes:

### pnpm catalog

 -  Common dependencies are defined in *pnpm-workspace.yaml* under the
    `catalog:` section
 -  Individual packages reference catalog dependencies using `"catalog:"`
    syntax
 -  Ensures version consistency across all packages in the workspace

### Deno imports map

 -  The root *deno.json* centralizes dependency versions in the `imports:`
    section
 -  Provides JSR and npm package mappings for Deno runtime
 -  Coordinates with pnpm catalog to maintain version alignment

### Adding dependencies

When adding a new dependency:

 1. *For workspace-wide dependencies*: Add to both pnpm catalog and Deno
    imports
 2. *In individual packages*: Reference using `"catalog:"` in *package.json*
 3. *Version consistency*: Ensure versions match between catalog and imports


Package management
------------------

The project is published to:

 -  JSR (JavaScript Registry)
 -  npm

Version consistency is critical—all packages should have matching versions
across the entire workspace.


Best practices
--------------

 1. *Zero dependencies*: Avoid adding external dependencies.
 2. *Performance*: Consider performance implications, especially for logging
    operations.
 3. *Error handling*: Ensure logging errors don't crash applications.
 4. *Backward compatibility*: Maintain compatibility with existing APIs.
 5. *Security*: Be careful with sensitive data in logs.


Specific component guidelines
-----------------------------

### Loggers

 -  Loggers should follow the hierarchical category pattern
 -  Support both eager and lazy evaluation modes
 -  Properly handle context properties

### Sinks

 -  Keep sinks simple and focused on a single responsibility
 -  Handle errors gracefully
 -  Consider performance implications

### Formatters

 -  Make formatters customizable
 -  Support both plain text and structured formats
 -  Consider output readability

By following these guidelines, you'll help maintain the quality and consistency
of the LogTape codebase.
