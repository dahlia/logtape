<!-- deno-fmt-ignore-file -->

Beautiful text formatter for LogTape
====================================

[![JSR][JSR badge]][JSR]
[![npm][npm badge]][npm]

Beautiful text formatter for [LogTape]—perfect for local development!
This package provides a visually appealing formatter inspired by [Signale],
designed to make your development logs easier to read and debug.

[JSR]: https://jsr.io/@logtape/pretty
[JSR badge]: https://jsr.io/badges/@logtape/pretty
[npm]: https://www.npmjs.com/package/@logtape/pretty
[npm badge]: https://img.shields.io/npm/v/@logtape/pretty?logo=npm
[LogTape]: https://logtape.org/
[Signale]: https://github.com/klaudiosinani/signale


Features
--------

 -  *Beautiful design*: Inspired by Signale with colorful icons and clean layout
 -  *True color support*: Rich colors for modern terminals
 -  *Smart truncation*: Intelligent category truncation to maintain layout
 -  *Perfect alignment*: Columns align beautifully for easy scanning
 -  *Development focused*: Optimized for local development experience
 -  *Word wrapping*: Automatic text wrapping with proper indentation
 -  *Zero dependencies*: Lightweight and fast


Installation
------------

This package is available on [JSR] and [npm].  You can install it for various
JavaScript runtimes and package managers:

~~~~ sh
deno add jsr:@logtape/pretty  # for Deno
npm  add     @logtape/pretty  # for npm
pnpm add     @logtape/pretty  # for pnpm
yarn add     @logtape/pretty  # for Yarn
bun  add     @logtape/pretty  # for Bun
~~~~


Quick start
-----------

~~~~ typescript
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { prettyFormatter } from "@logtape/pretty";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: prettyFormatter
    })
  },
  loggers: [
    { category: "my-app", lowestLevel: "debug", sinks: ["console"] }
  ]
});

// Now your logs look beautiful!
const logger = getLogger("my-app");
logger.info`Server started on port ${3000}`;
logger.debug`Connected to database`;
logger.warn`Cache size exceeding 80% capacity`;
logger.error`Failed to process request: ${{ error: "timeout" }}`;
~~~~

Output example:

![](https://raw.githubusercontent.com/dahlia/logtape/refs/heads/main/screenshots/terminal.png)

~~~~
✨ info    my-app               Server started on port 3000
🐛 debug   my-app               Connected to database
⚡ warning my-app               Cache size exceeding 80% capacity
❌ error   my-app               Failed to process request: { error: 'timeout' }
~~~~


Configuration
-------------

### Basic options

~~~~ typescript
import { getPrettyFormatter } from "@logtape/pretty";

const formatter = getPrettyFormatter({
  // Show timestamp
  timestamp: "time",  // "time" | "date-time" | "date" | "rfc3339" | etc.

  // Customize icons
  icons: {
    info: "ℹ️",
    error: "🔥"
  },

  // Control colors
  colors: true,

  // Category display
  categoryWidth: 20,
  categoryTruncate: "middle",  // "middle" | "end" | false

  // Word wrapping
  wordWrap: true,  // true | false | number

  // Show properties
  properties: true,
});
~~~~

### Timestamp options

~~~~ typescript
// No timestamp (default)
getPrettyFormatter({ timestamp: "none" })

// Time only (HH:MM:SS)
getPrettyFormatter({ timestamp: "time" })
// Output: 12:34:56  ✨ info    app    Message

// Date and time
getPrettyFormatter({ timestamp: "date-time" })
// Output: 2024-01-15 12:34:56  ✨ info    app    Message

// RFC 3339 format
getPrettyFormatter({ timestamp: "rfc3339" })
// Output: 2024-01-15T12:34:56.789Z  ✨ info    app    Message

// Custom formatter
getPrettyFormatter({
  timestamp: (ts) => new Date(ts).toLocaleTimeString()
})
~~~~

### Icon customization

~~~~ typescript
// Disable all icons
getPrettyFormatter({ icons: false })

// Custom icons for specific levels
getPrettyFormatter({
  icons: {
    info: "📘",
    warning: "🔶",
    error: "🚨",
    fatal: "☠️"
  }
})

// Default icons:
// trace: 🔍
// debug: 🐛
// info: ✨
// warning: ⚡
// error: ❌
// fatal: 💀
~~~~

### Category truncation

~~~~ typescript
// Fixed width with middle truncation (default)
getPrettyFormatter({
  categoryWidth: 20,
  categoryTruncate: "middle"
})
// "app·server·http·middleware" → "app…middleware"

// End truncation
getPrettyFormatter({
  categoryWidth: 20,
  categoryTruncate: "end"
})
// "app·server·http·middleware" → "app·server·http…"

// No truncation
getPrettyFormatter({
  categoryTruncate: false
})

// Custom category separator
getPrettyFormatter({
  categorySeparator: "."  // Default is "·"
})
~~~~

### Color and style control

~~~~ typescript
// Disable colors (for CI/CD environments)
getPrettyFormatter({ colors: false })

// Customize colors
getPrettyFormatter({
  timestampColor: "#888888",
  levelColors: {
    info: "#00ff00",
    error: "#ff0000"
  },
  categoryColor: "rgb(100,150,200)",
  messageColor: "#ffffff"
})

// Apply styles
getPrettyFormatter({
  timestampStyle: "dim",
  levelStyle: ["bold", "underline"],
  categoryStyle: ["dim", "italic"],
  messageStyle: "dim"
})

// Category color mapping
getPrettyFormatter({
  categoryColorMap: new Map([
    [["app", "auth"], "#ff6b6b"],     // app·auth·* -> red
    [["app", "db"], "#4ecdc4"],       // app·db·* -> teal
    [["app"], "#45b7d1"],             // app·* (fallback) -> blue
    [["lib"], "#96ceb4"],             // lib·* -> green
  ])
})
~~~~

### Word wrapping

~~~~ typescript
// Auto-detect terminal width
getPrettyFormatter({ wordWrap: true })

// Custom wrap width
getPrettyFormatter({ wordWrap: 120 })

// Disable word wrapping
getPrettyFormatter({ wordWrap: false })
~~~~

### Inspect options

~~~~ typescript
// Control how objects are displayed
getPrettyFormatter({
  inspectOptions: {
    depth: 3,         // Show 3 levels of nesting
    colors: false,    // Disable value syntax highlighting
    compact: true,    // Use compact object display
  }
})
~~~~

### Properties display

~~~~ typescript
// Show properties below the message
getPrettyFormatter({
  properties: true,  // Show properties
})
~~~~


Advanced usage
--------------

### Multiple formatters

Use different formatters for different environments:

~~~~ typescript
import { configure } from "@logtape/logtape";
import { getConsoleSink } from "@logtape/logtape/sink";
import { prettyFormatter } from "@logtape/pretty";
import { jsonLinesFormatter } from "@logtape/logtape";

const isDevelopment = process.env.NODE_ENV !== "production";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: isDevelopment ? prettyFormatter : jsonLinesFormatter
    })
  }
});
~~~~

### CI/CD friendly

Automatically detect CI environments and adjust:

~~~~ typescript
const isCI = process.env.CI === "true";

const formatter = getPrettyFormatter({
  colors: !isCI,
  icons: !isCI,
  timestamp: isCI ? "date-time" : "none"
});
~~~~


Design philosophy
-----------------

@logtape/pretty is designed specifically for local development, prioritizing:

 -  *Visual clarity*: Easy to scan and find important information
 -  *Minimal noise*: Only show what's necessary
 -  *Developer joy*: Make logs beautiful and enjoyable to read


Docs
----

For detailed documentation, see the [pretty formatter manual]. For the API
references, see <https://jsr.io/@logtape/pretty>.

[pretty formatter manual]: https://logtape.org/manual/formatters#pretty-formatter
