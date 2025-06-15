# LogTape Development Guidelines for AI Assistants

This document provides comprehensive instructions for AI coding assistants (like
GitHub Copilot, Claude, etc.) working with the LogTape codebase. Follow these
guidelines to ensure your contributions align with project standards.

## Repository Information

**⚠️ IMPORTANT: Upstream Repository is `dahlia/logtape`**

All GitHub operations (issues, pull requests, etc.) must be performed against
the upstream repository `dahlia/logtape`, not personal forks.

### GitHub Operations

#### Issues

- Always create issues against `dahlia/logtape`
- Use: `gh issue create --repo dahlia/logtape`
- Reference issues as: `dahlia/logtape#123`

#### Pull Requests

- Always create pull requests against `dahlia/logtape`
- Use: `gh pr create --repo dahlia/logtape`
- Target the appropriate base branch (usually `main` for new features)

#### Common Commands

```bash
# Check issues in upstream
gh issue list --repo dahlia/logtape

# Create PR to upstream
gh pr create --repo dahlia/logtape --title "Your Title" --body "Your description"

# View upstream PRs
gh pr list --repo dahlia/logtape
```

## Project Overview

LogTape is a zero-dependency logging library for JavaScript and TypeScript that
works across multiple runtimes (Deno, Node.js, Bun, browsers, edge functions).
Key features include:

- Structured logging with hierarchical categories
- Template literal support
- Extensible sink system
- Cross-runtime compatibility
- Library-friendly design

## Codebase Structure

The project uses a unique **dual workspace** architecture that combines both
Deno workspace and pnpm workspace features:

### Dual Workspace Setup

- **Deno Workspace**: Defined in the root `deno.json` with workspace members
- **pnpm Workspace**: Defined in `pnpm-workspace.yaml` for Node.js ecosystem
  compatibility
- Each package must be listed in BOTH workspace configurations
- This enables seamless cross-runtime development and publishing

### Current Packages

- **logtape/**: Core logging functionality
- **file/**: File-based logging sink
- **otel/**: OpenTelemetry integration
- **redaction/**: Functionality for redacting sensitive information
- **sentry/**: Sentry integration

### Package Structure

Each package follows a consistent structure with:

- `mod.ts`: Main entry point exposing the public API
- `*.ts`: Implementation files
- `*.test.ts`: Test files matching their respective implementation
- `deno.json`: Deno configuration and workspace membership
- `package.json`: npm package configuration and workspace membership
- `tsdown.config.ts`: Cross-platform build configuration (replaces dnt.ts)

### Adding New Packages

When adding a new package to the workspace:

1. Create the package directory with both `deno.json` and `package.json`
2. Add the package to **both** workspace configurations:
   - Add to `packages:` array in `pnpm-workspace.yaml`
   - Add to `workspace:` array in root `deno.json`
3. Configure dependencies using the dual dependency management system

## Coding Conventions

### TypeScript Standards

1. **Strict TypeScript**: The project uses strict TypeScript. All code must be
   properly typed.
2. **Explicit Types**: Prefer explicit type annotations for function parameters
   and return types.
3. **Interfaces vs Types**: Use `interface` for public APIs and `type` for
   complex types.
4. **Readonly**: Use `readonly` for immutable properties.
5. **Type Guards**: Use type guards for runtime type checking.

### Naming Conventions

1. **Modules**: Use camelCase for filenames and import specifiers.
2. **Classes/Interfaces**: Use PascalCase.
3. **Variables/Functions/Methods**: Use camelCase.
4. **Constants**: Use camelCase for constants (NOT ALL_CAPS).
5. **Private Members**: Prefix with `_` (e.g., `_privateMethod`).

### Code Style

1. **Formatting**: The project uses `deno fmt` for formatting.
2. **Comments**: Use JSDoc for all public APIs.
3. **Line Length**: Keep lines under 80 characters when possible.
4. **Import Organization**: Organize imports alphabetically.
5. **Error Handling**: Always handle errors explicitly, never swallow them.

### Branch Structure

- **main**: Contains new features for the next major/minor version
- **X.Y-maintenance**: Contains bug fixes for the next patch version of a
  specific release (e.g., `0.9-maintenance`)

## Testing

### Test Framework

The project uses **@alinea/suite** for cross-runtime testing compatibility,
along with `@std/assert` for assertions.

### Test Organization

1. Each implementation file has a corresponding `*.test.ts` file
2. Tests are organized using `@alinea/suite`'s `suite()` function
3. Each test should focus on a single piece of functionality
4. Tests run across multiple runtimes: Deno, Node.js, and Bun

### Test Structure

```typescript
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
```

### Cross-Runtime Testing

The project supports testing across multiple JavaScript runtimes:

- **Deno**: Native runtime, tests run directly
- **Node.js**: Requires build step, uses Node's built-in test runner
- **Bun**: Requires build step, uses Bun's test runner

### Running Tests

```bash
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
```

### Test Workflow

For Node.js and Bun testing:

1. Packages are built using `tsdown` to generate CommonJS/ESM outputs
2. Tests run against the built packages in `dist/` directories
3. This ensures cross-runtime compatibility of the published packages

## Development Workflow

### Build System

The project uses **tsdown** for cross-platform package building:

- Replaces the previous `dnt.ts` configuration
- Generates both ESM and CommonJS outputs
- Supports platform-specific builds (Node.js, Deno, Bun)
- Each package has its own `tsdown.config.ts` configuration

### Building Packages

```bash
# Build all packages
deno task build

# Build specific packages
deno task build:logtape
deno task build:file
deno task build:otel
deno task build:redaction
deno task build:sentry
```

### Checking Code

Before submitting changes, run:

```bash
deno task check
```

This runs:

- `deno check`: Type checking across all workspace members
- `deno lint`: Linting
- `deno fmt --check`: Format checking
- `deno task check:versions`: Version consistency check across packages

### Workspace vs Package-Level Tasks

- **Workspace-level tasks**: Run from the root directory using `deno task`
- **Package-level tasks**: Run from individual package directories or using `-f`
  flag
- Cross-runtime testing requires building packages first

### Git Hooks

The project uses git hooks:

- **pre-commit**: Runs `deno task check` to verify code quality
- **pre-push**: Runs `deno task check` and `deno task test` to verify
  functionality

To install hooks:

```bash
deno task hooks:install
```

### CI/CD

The project uses GitHub Actions for:

- Running tests across multiple platforms (macOS, Ubuntu, Windows)
- Cross-runtime testing (Deno, Node.js, Bun)
- Checking code style and types
- Building packages with tsdown
- Generating test coverage reports
- Publishing to JSR and npm
- Monorepo-aware package publishing

## Documentation

### Code Documentation

- Use JSDoc comments for all public APIs
- Document parameters, return types, and exceptions
- Include examples for complex functionality

Example:

````typescript
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
````

### User Documentation

User documentation is available at https://logtape.org/ and is structured as:

- Installation guides
- Quick start
- Manual sections (categories, levels, filters, formatters, sinks)
- Advanced usage (library usage, testing, structured logging)

When adding or changing functionality, update both the code documentation and
user documentation as needed.

## Changelog Guidelines

The project maintains a detailed changelog in `CHANGES.md` that follows specific
principles and formatting:

### Changelog Principles

1. **User-Focused Changes**: Document changes from the user's perspective, not
   implementation details. Focus on what users of the library will experience,
   not how it was implemented.

2. **API Documentation**: Clearly document all API changes, including:
   - Additions of new functions, types, interfaces, or constants
   - Changes to existing API types or signatures (include both old and new
     types)
   - Deprecation notices
   - Removals or relocations of APIs between packages

3. **Attribution**: Include attribution to contributors where applicable, with
   links to their PRs or issues.

4. **Versioning**: Each version has its own section with release date (when
   applicable).

### When to Update the Changelog

Update the changelog when:

- Adding, changing, or removing public APIs
- Fixing bugs that affect user behavior
- Making performance improvements that users would notice
- Changing behavior of existing functionality
- Moving code between packages

Do NOT update the changelog for:

- Internal implementation changes that don't affect users
- Documentation-only changes
- Test-only changes
- Build system changes

### Changelog Format

1. **Structure**:
   - Top-level heading for the project name
   - Second-level heading for each version number
   - Version status ("To be released" or "Released on DATE")
   - Bulleted list of changes

2. **Entry Format**:
   - Use `-` for list items
   - Nest related sub-items with indentation
   - Link issue/PR numbers using `[[#XX]]` or `[[#XX] by Contributor Name]`
   - For API changes, include the full type signature changes

3. **Order**:
   - Group related changes together
   - List additions first, then changes, then fixes

### Example Entry

```
Version X.Y.Z
-------------

Released on Month Day, Year.

 -  Added `newFunction()` function to perform X.  [[#42]]

 -  Changed the type of the `existingFunction()` function to
    `(param: string) => number` (was `(param: string) => void`).

 -  Fixed a bug where X happened when Y was expected.  [[#43], [#44] by Contributor]
```

## Cross-Runtime Compatibility

LogTape supports multiple JavaScript runtimes:

- Deno
- Node.js
- Bun
- Browsers
- Edge functions

Ensure new code works across all supported environments. Use the
`@david/which-runtime` library to detect runtime-specific behavior when
necessary.

## Dependency Management

The project uses a **dual dependency management** system to maintain version
consistency across packages and runtimes:

### pnpm Catalog

- Common dependencies are defined in `pnpm-workspace.yaml` under the `catalog:`
  section
- Individual packages reference catalog dependencies using `"catalog:"` syntax
- Ensures version consistency across all packages in the workspace

### Deno Imports Map

- The root `deno.json` centralizes dependency versions in the `imports:` section
- Provides JSR and npm package mappings for Deno runtime
- Coordinates with pnpm catalog to maintain version alignment

### Adding Dependencies

When adding a new dependency:

1. **For workspace-wide dependencies**: Add to both pnpm catalog and Deno
   imports
2. **In individual packages**: Reference using `"catalog:"` in package.json
3. **Version consistency**: Ensure versions match between catalog and imports

## Package Management

The project is published to:

- JSR (JavaScript Registry)
- npm

Version consistency is critical—all packages should have matching versions
across the entire workspace.

## Best Practices

1. **Zero Dependencies**: Avoid adding external dependencies.
2. **Performance**: Consider performance implications, especially for logging
   operations.
3. **Error Handling**: Ensure logging errors don't crash applications.
4. **Backward Compatibility**: Maintain compatibility with existing APIs.
5. **Security**: Be careful with sensitive data in logs.

## Specific Component Guidelines

### Loggers

- Loggers should follow the hierarchical category pattern
- Support both eager and lazy evaluation modes
- Properly handle context properties

### Sinks

- Keep sinks simple and focused on a single responsibility
- Handle errors gracefully
- Consider performance implications

### Formatters

- Make formatters customizable
- Support both plain text and structured formats
- Consider output readability

By following these guidelines, you'll help maintain the quality and consistency
of the LogTape codebase.
