# @logtape/pretty

Beautiful console formatter for [LogTape] - Perfect for local development!

[@logtape/pretty] provides a visually appealing formatter inspired by [Signale], designed to make your development logs easier to read and debug. With colorful icons, smart truncation, and perfect alignment, your logs have never looked better.

[LogTape]: https://github.com/dahlia/logtape
[@logtape/pretty]: https://github.com/dahlia/logtape/tree/main/pretty
[Signale]: https://github.com/klaudiosinani/signale

## Features

- 🎨 **Beautiful Design**: Inspired by Signale with colorful icons and clean layout
- 🌈 **True Color Support**: Rich colors for modern terminals
- ✂️ **Smart Truncation**: Intelligent category truncation to maintain layout
- 📐 **Perfect Alignment**: Columns align beautifully for easy scanning
- 🎯 **Development Focused**: Optimized for local development experience
- 🚀 **Zero Dependencies**: Lightweight and fast

## Installation

### Deno
```typescript
import { prettyFormatter } from "@logtape/pretty";
```

### Node.js
```bash
npm install @logtape/pretty
```

### Bun
```bash
bun add @logtape/pretty
```

## Quick Start

```typescript
import { configure } from "@logtape/logtape";
import { getConsoleSink } from "@logtape/logtape/sink";
import { prettyFormatter } from "@logtape/pretty";

await configure({
  sinks: {
    console: getConsoleSink({
      formatter: prettyFormatter
    })
  },
  loggers: [
    {
      category: "my-app",
      level: "debug",
      sinks: ["console"]
    }
  ]
});

// Now your logs look beautiful!
const logger = getLogger("my-app");
logger.info`Server started on port ${3000}`;
logger.debug`Connected to database`;
logger.warn`Cache size exceeding 80% capacity`;
logger.error`Failed to process request: ${{ error: "timeout" }}`;
```

## Output Example

```
✨ info    my-app.server       Server started on port 3000
🐛 debug   my-app.database     Connected to PostgreSQL
⚠️  warn    my-app.cache        Cache size exceeding 80% capacity
❌ error   my-app...handler    Failed to process request: { error: 'timeout' }
```

## Configuration

### Basic Options

```typescript
import { getPrettyFormatter } from "@logtape/pretty";

const formatter = getPrettyFormatter({
  // Show timestamp
  timestamp: "time",  // "time" | "datetime" | false
  
  // Customize icons
  icons: {
    info: "ℹ️ ",
    error: "🔥"
  },
  
  // Control colors
  colors: true,
  dimMessage: true,
  dimCategory: true,
  
  // Category display
  categoryWidth: 20,
  categoryTruncate: "middle"  // "middle" | "end" | false
});
```

### Timestamp Options

```typescript
// No timestamp (default)
getPrettyFormatter({ timestamp: false })

// Time only (HH:MM:SS)
getPrettyFormatter({ timestamp: "time" })
// Output: 12:34:56  ✨ info    app    Message

// Date and time
getPrettyFormatter({ timestamp: "datetime" })
// Output: 2024-01-15 12:34:56  ✨ info    app    Message

// Custom formatter
getPrettyFormatter({ 
  timestamp: (ts) => new Date(ts).toLocaleTimeString()
})
```

### Icon Customization

```typescript
// Disable all icons
getPrettyFormatter({ icons: false })

// Custom icons for specific levels
getPrettyFormatter({
  icons: {
    info: "📘",
    warning: "🔶",
    error: "🚨",
    fatal: "☠️ "
  }
})

// Default icons:
// trace: 🔍
// debug: 🐛
// info: ✨
// warning: ⚠️
// error: ❌
// fatal: 💀
```

### Category Truncation

```typescript
// Fixed width with middle truncation (default)
getPrettyFormatter({
  categoryWidth: 20,
  categoryTruncate: "middle"
})
// "app.server.http.middleware" → "app...middleware"

// End truncation
getPrettyFormatter({
  categoryWidth: 20,
  categoryTruncate: "end"
})
// "app.server.http.middleware" → "app.server.http..."

// No truncation
getPrettyFormatter({
  categoryTruncate: false
})
```

### Color Control

```typescript
// Disable colors (for CI/CD environments)
getPrettyFormatter({ colors: false })

// Control dimming
getPrettyFormatter({
  dimMessage: false,    // Full brightness messages
  dimCategory: false    // Full brightness categories
})
```

## Advanced Usage

### Multiple Formatters

Use different formatters for different environments:

```typescript
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
```

### CI/CD Friendly

Automatically detect CI environments and adjust:

```typescript
const isCI = process.env.CI === "true";

const formatter = getPrettyFormatter({
  colors: !isCI,
  icons: !isCI,
  timestamp: isCI ? "datetime" : false
});
```

## Design Philosophy

@logtape/pretty is designed specifically for local development, prioritizing:

- **Visual Clarity**: Easy to scan and find important information
- **Minimal Noise**: Only show what's necessary
- **Developer Joy**: Make logs beautiful and enjoyable to read

## License

MIT © 2024 Hong Minhee

---

Made with ❤️ for developers who appreciate beautiful logs.