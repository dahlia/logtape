# LogTape Development Guidelines for AI Assistants

This document provides comprehensive instructions for AI coding assistants (like
GitHub Copilot, Claude, etc.) working with the LogTape codebase. Follow these
guidelines to ensure your contributions align with project standards.

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

The project is organized as a workspace with multiple modules:

- **logtape/**: Core logging functionality
- **file/**: File-based logging sink
- **redaction/**: Functionality for redacting sensitive information

Each module follows a similar structure with:

- `mod.ts`: Main entry point exposing the public API
- `*.ts`: Implementation files
- `*.test.ts`: Test files matching their respective implementation
- `dnt.ts`: Deno-to-Node packaging configuration

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

The project uses Deno's built-in testing capabilities with the `@std/assert`
library.

### Test Organization

1. Each implementation file has a corresponding `*.test.ts` file.
2. Tests are organized using Deno's `test()` function with steps.
3. Each test should focus on a single piece of functionality.

### Test Structure

```typescript
Deno.test("ComponentName.methodName()", async (t) => {
  // Setup code

  await t.step("test case description", () => {
    // Test code
    assertEquals(actual, expected);
  });

  await t.step("tear down", () => {
    // Cleanup code
  });
});
```

### Running Tests

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task coverage

# Run tests across all runtimes
deno task test-all
```

## Development Workflow

### Checking Code

Before submitting changes, run:

```bash
deno task check
```

This runs:

- `deno check **/*.ts`: Type checking
- `deno lint`: Linting
- `deno fmt --check`: Format checking
- `deno run --allow-read scripts/check_versions.ts`: Version consistency check

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
- Checking code style and types
- Generating test coverage reports
- Publishing to JSR and npm

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

## Package Management

The project is published to:

- JSR (JavaScript Registry)
- npm

Version consistency is important—all packages should have matching versions.

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
