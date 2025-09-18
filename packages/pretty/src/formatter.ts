import {
  getLogLevels,
  type LogLevel,
  type LogRecord,
  type TextFormatter,
  type TextFormatterOptions,
} from "@logtape/logtape";
import { inspect, type InspectOptions } from "#util";
import { getOptimalWordWrapWidth } from "./terminal.ts";
import { truncateCategory, type TruncationStrategy } from "./truncate.ts";
import { getDisplayWidth, stripAnsi } from "./wcwidth.ts";
import { wrapText } from "./wordwrap.ts";

/**
 * ANSI escape codes for styling
 */
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

// Default true color values (referenced in JSDoc)
const defaultColors = {
  trace: "rgb(167,139,250)", // Light purple
  debug: "rgb(96,165,250)", // Light blue
  info: "rgb(52,211,153)", // Emerald
  warning: "rgb(251,191,36)", // Amber
  error: "rgb(248,113,113)", // Light red
  fatal: "rgb(220,38,38)", // Dark red
  category: "rgb(100,116,139)", // Slate
  message: "rgb(148,163,184)", // Light slate
  timestamp: "rgb(100,116,139)", // Slate
} as const;

/**
 * ANSI style codes
 */
const styles = {
  reset: RESET,
  bold: "\x1b[1m",
  dim: DIM,
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  strikethrough: "\x1b[9m",
} as const;

/**
 * Standard ANSI colors (16-color)
 */
const ansiColors = {
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

/**
 * Color type definition
 */
export type Color =
  | keyof typeof ansiColors
  | `rgb(${number},${number},${number})`
  | `#${string}`
  | null;

/**
 * Category color mapping for prefix-based coloring.
 *
 * Maps category prefixes (as arrays) to colors. The formatter will match
 * categories against these prefixes and use the corresponding color.
 * Longer/more specific prefixes take precedence over shorter ones.
 *
 * @example
 * ```typescript
 * new Map([
 *   [["app", "auth"], "#ff6b6b"],     // app.auth.* -> red
 *   [["app", "db"], "#4ecdc4"],       // app.db.* -> teal
 *   [["app"], "#45b7d1"],             // app.* (fallback) -> blue
 *   [["lib"], "#96ceb4"],             // lib.* -> green
 * ])
 * ```
 */
export type CategoryColorMap = Map<readonly string[], Color>;

/**
 * Internal representation of category prefix patterns
 */
type CategoryPattern = {
  prefix: readonly string[];
  color: Color;
};

/**
 * Style type definition - supports single styles, arrays of styles, or null
 */
export type Style = keyof typeof styles | (keyof typeof styles)[] | null;

// Pre-compiled regex patterns for color parsing
const RGB_PATTERN = /^rgb\((\d+),(\d+),(\d+)\)$/;
const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Helper function to convert color to ANSI escape code
 */
function colorToAnsi(color: Color): string {
  if (color === null) return "";
  if (color in ansiColors) {
    return ansiColors[color as keyof typeof ansiColors];
  }

  // Handle rgb() format
  const rgbMatch = color.match(RGB_PATTERN);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  // Handle hex format (#rrggbb or #rgb)
  const hexMatch = color.match(HEX_PATTERN);
  if (hexMatch) {
    let hex = hexMatch[1];
    // Convert 3-digit hex to 6-digit
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `\x1b[38;2;${r};${g};${b}m`;
  }

  return "";
}

/**
 * Helper function to convert style to ANSI escape code
 */
function styleToAnsi(style: Style): string {
  if (style === null) return "";
  if (Array.isArray(style)) {
    return style.map((s) => styles[s] || "").join("");
  }
  return styles[style] || "";
}

/**
 * Converts a category color map to internal patterns and sorts them by specificity.
 * More specific (longer) prefixes come first for proper matching precedence.
 */
function prepareCategoryPatterns(
  categoryColorMap: CategoryColorMap,
): CategoryPattern[] {
  const patterns: CategoryPattern[] = [];

  for (const [prefix, color] of categoryColorMap) {
    patterns.push({ prefix, color });
  }

  // Sort by prefix length (descending) for most-specific-first matching
  return patterns.sort((a, b) => b.prefix.length - a.prefix.length);
}

/**
 * Matches a category against category color patterns.
 * Returns the color of the first matching pattern, or null if no match.
 */
function matchCategoryColor(
  category: readonly string[],
  patterns: CategoryPattern[],
): Color {
  for (const pattern of patterns) {
    if (categoryMatches(category, pattern.prefix)) {
      return pattern.color;
    }
  }
  return null;
}

/**
 * Checks if a category matches a prefix pattern.
 * A category matches if it starts with all segments of the prefix.
 */
function categoryMatches(
  category: readonly string[],
  prefix: readonly string[],
): boolean {
  if (prefix.length > category.length) {
    return false;
  }

  for (let i = 0; i < prefix.length; i++) {
    if (category[i] !== prefix[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Default icons for each log level
 */
const defaultIcons: Record<LogLevel, string> = {
  trace: "🔍",
  debug: "🐛",
  info: "✨",
  warning: "⚡",
  error: "❌",
  fatal: "💀",
};

/**
 * Normalize icon spacing to ensure consistent column alignment.
 *
 * All icons will be padded with spaces to match the width of the widest icon,
 * ensuring consistent prefix alignment across all log levels.
 *
 * @param iconMap The icon mapping to normalize
 * @returns A new icon map with consistent spacing
 */
function normalizeIconSpacing(
  iconMap: Record<LogLevel, string>,
): Record<LogLevel, string> {
  const entries = Object.entries(iconMap) as Array<[LogLevel, string]>;
  const maxWidth = Math.max(
    ...entries.map(([, icon]) => getDisplayWidth(icon)),
  );

  return Object.fromEntries(
    entries.map(([level, icon]) => [
      level,
      icon + " ".repeat(maxWidth - getDisplayWidth(icon)),
    ]),
  ) as Record<LogLevel, string>;
}

/**
 * Configuration options for the pretty formatter.
 *
 * This interface extends the base text formatter options while providing
 * extensive customization options for visual styling, layout control, and
 * development-focused features. It offers granular control over colors,
 * styles, and formatting similar to the ANSI color formatter.
 *
 * @since 1.0.0
 */
export interface PrettyFormatterOptions
  extends Omit<TextFormatterOptions, "category" | "value" | "format"> {
  /**
   * Color for timestamp display when timestamps are enabled.
   *
   * Supports true color RGB values, hex colors, or ANSI color names.
   * Set to `null` to disable timestamp coloring.
   *
   * @example
   * ```typescript
   * timestampColor: "#888888"        // Hex color
   * timestampColor: "rgb(128,128,128)" // RGB color
   * timestampColor: "cyan"           // ANSI color name
   * timestampColor: null             // No color
   * ```
   *
   * @default `"rgb(100,116,139)"` (slate gray)
   */
  readonly timestampColor?: Color;

  /**
   * Visual style applied to timestamp text.
   *
   * Controls text appearance like boldness, dimming, etc.
   * Supports single styles, multiple styles combined, or no styling.
   * Combines with `timestampColor` for full styling control.
   *
   * @example
   * ```typescript
   * timestampStyle: "dim"                    // Single style: dimmed text
   * timestampStyle: "bold"                   // Single style: bold text
   * timestampStyle: ["bold", "underline"]    // Multiple styles: bold + underlined
   * timestampStyle: ["dim", "italic"]        // Multiple styles: dimmed + italic
   * timestampStyle: null                     // No styling
   * ```
   *
   * @default `"dim"`
   */
  readonly timestampStyle?: Style;

  /**
   * Custom colors for each log level.
   *
   * Allows fine-grained control over level appearance. Each level can have
   * its own color scheme. Unspecified levels use built-in defaults.
   * Set individual levels to `null` to disable coloring for that level.
   *
   * @example
   * ```typescript
   * levelColors: {
   *   info: "#00ff00",     // Bright green for info
   *   error: "#ff0000",    // Bright red for errors
   *   warning: "orange",   // ANSI orange for warnings
   *   debug: null,         // No color for debug
   * }
   * ```
   *
   * @default Built-in color scheme (purple trace, blue debug, green info, amber warning, red error, dark red fatal)
   */
  readonly levelColors?: Partial<Record<LogLevel, Color>>;

  /**
   * Visual style applied to log level text.
   *
   * Controls the appearance of the level indicator (e.g., "info", "error").
   * Supports single styles, multiple styles combined, or no styling.
   * Applied in addition to level-specific colors.
   *
   * @example
   * ```typescript
   * levelStyle: "bold"                    // Single style: bold level text
   * levelStyle: "underline"               // Single style: underlined level text
   * levelStyle: ["bold", "underline"]     // Multiple styles: bold + underlined
   * levelStyle: ["dim", "italic"]         // Multiple styles: dimmed + italic
   * levelStyle: null                      // No additional styling
   * ```
   *
   * @default `"underline"`
   */
  readonly levelStyle?: Style;

  /**
   * Icon configuration for each log level.
   *
   * Controls the emoji/symbol displayed before each log entry.
   * Provides visual quick-identification of log severity.
   *
   * - `true`: Use built-in emoji set (🔍 trace, 🐛 debug, ✨ info, ⚠️ warning, ❌ error, 💀 fatal)
   * - `false`: Disable all icons for clean text-only output
   * - Object: Custom icon mapping, falls back to defaults for unspecified levels
   *
   * @example
   * ```typescript
   * icons: true                    // Use default emoji set
   * icons: false                   // No icons
   * icons: {
   *   info: "ℹ️",                  // Custom info icon
   *   error: "🔥",                 // Custom error icon
   *   warning: "⚡",               // Custom warning icon
   * }
   * ```
   *
   * @default `true` (use default emoji icons)
   */
  readonly icons?: boolean | Partial<Record<LogLevel, string>>;

  /**
   * Character(s) used to separate category hierarchy levels.
   *
   * Categories are hierarchical (e.g., ["app", "auth", "jwt"]) and this
   * separator joins them for display (e.g., "app.auth.jwt").
   *
   * @example
   * ```typescript
   * categorySeparator: "·"        // app·auth·jwt
   * categorySeparator: "."        // app.auth.jwt
   * categorySeparator: ":"        // app:auth:jwt
   * categorySeparator: " > "      // app > auth > jwt
   * categorySeparator: "::"       // app::auth::jwt
   * ```
   *
   * @default `"·"` (interpunct)
   */
  readonly categorySeparator?: string;

  /**
   * Default color for category display.
   *
   * Used as fallback when no specific color is found in `categoryColorMap`.
   * Controls the visual appearance of the category hierarchy display.
   *
   * @example
   * ```typescript
   * categoryColor: "#666666"        // Gray categories
   * categoryColor: "blue"           // Blue categories
   * categoryColor: "rgb(100,150,200)" // Light blue categories
   * categoryColor: null             // No coloring
   * ```
   *
   * @default `"rgb(100,116,139)"` (slate gray)
   */
  readonly categoryColor?: Color;

  /**
   * Category-specific color mapping based on prefixes.
   *
   * Maps category prefixes (as arrays) to colors for visual grouping.
   * More specific (longer) prefixes take precedence over shorter ones.
   * If no prefix matches, falls back to the default `categoryColor`.
   *
   * @example
   * ```typescript
   * new Map([
   *   [["app", "auth"], "#ff6b6b"],     // app.auth.* -> red
   *   [["app", "db"], "#4ecdc4"],       // app.db.* -> teal
   *   [["app"], "#45b7d1"],             // app.* (fallback) -> blue
   *   [["lib"], "#96ceb4"],             // lib.* -> green
   * ])
   * ```
   */
  readonly categoryColorMap?: CategoryColorMap;

  /**
   * Visual style applied to category text.
   *
   * Controls the appearance of the category hierarchy display.
   * Supports single styles, multiple styles combined, or no styling.
   * Applied in addition to category colors from `categoryColor` or `categoryColorMap`.
   *
   * @example
   * ```typescript
   * categoryStyle: "dim"                     // Single style: dimmed category text
   * categoryStyle: "italic"                  // Single style: italic category text
   * categoryStyle: ["dim", "italic"]         // Multiple styles: dimmed + italic
   * categoryStyle: ["bold", "underline"]     // Multiple styles: bold + underlined
   * categoryStyle: null                      // No additional styling
   * ```
   *
   * @default `["dim", "italic"]` (dimmed for subtle appearance)
   */
  readonly categoryStyle?: Style;

  /**
   * Maximum display width for category names.
   *
   * Controls layout consistency by limiting category width.
   * Long categories are truncated according to `categoryTruncate` strategy.
   *
   * @default `20`
   */
  readonly categoryWidth?: number;

  /**
   * Strategy for truncating long category names.
   *
   * When categories exceed `categoryWidth`, this controls how truncation works.
   * Smart truncation preserves important context while maintaining layout.
   *
   * - `"middle"`: Keep first and last parts (e.g., "app.server…auth.jwt")
   * - `"end"`: Truncate at the end (e.g., "app.server.middleware…")
   * - `false`: No truncation (ignores `categoryWidth`)
   *
   * @example
   * ```typescript
   * categoryTruncate: "middle"   // app.server…jwt (preserves context)
   * categoryTruncate: "end"      // app.server.midd… (linear truncation)
   * categoryTruncate: false      // app.server.middleware.auth.jwt (full)
   * ```
   *
   * @default `"middle"` (smart context-preserving truncation)
   */
  readonly categoryTruncate?: TruncationStrategy;

  /**
   * Color for log message text content.
   *
   * Controls the visual appearance of the actual log message content.
   * Does not affect structured values, which use syntax highlighting.
   *
   * @example
   * ```typescript
   * messageColor: "#ffffff"        // White message text
   * messageColor: "green"          // Green message text
   * messageColor: "rgb(200,200,200)" // Light gray message text
   * messageColor: null             // No coloring
   * ```
   *
   * @default `"rgb(148,163,184)"` (light slate gray)
   */
  readonly messageColor?: Color;

  /**
   * Visual style applied to log message text.
   *
   * Controls the appearance of the log message content.
   * Supports single styles, multiple styles combined, or no styling.
   * Applied in addition to `messageColor`.
   *
   * @example
   * ```typescript
   * messageStyle: "dim"                      // Single style: dimmed message text
   * messageStyle: "italic"                   // Single style: italic message text
   * messageStyle: ["dim", "italic"]          // Multiple styles: dimmed + italic
   * messageStyle: ["bold", "underline"]      // Multiple styles: bold + underlined
   * messageStyle: null                       // No additional styling
   * ```
   *
   * @default `"dim"` (dimmed for subtle readability)
   */
  readonly messageStyle?: Style;

  /**
   * Global color control for the entire formatter.
   *
   * Master switch to enable/disable all color output.
   * When disabled, produces clean monochrome output suitable for
   * non-color terminals or when colors are not desired.
   *
   * @example
   * ```typescript
   * colors: true     // Full color output (default)
   * colors: false    // Monochrome output only
   * ```
   *
   * @default `true` (colors enabled)
   */
  readonly colors?: boolean;

  /**
   * Column alignment for consistent visual layout.
   *
   * When enabled, ensures all log components (icons, levels, categories)
   * align consistently across multiple log entries, creating a clean
   * tabular appearance.
   *
   * @example
   * ```typescript
   * align: true      // Aligned columns (default)
   * align: false     // Compact, non-aligned output
   * ```
   *
   * @default `true` (alignment enabled)
   */
  readonly align?: boolean;

  /**
   * Configuration for structured value inspection and rendering.
   *
   * Controls how objects, arrays, and other complex values are displayed
   * within log messages. Uses Node.js `util.inspect()` style options.
   *
   * @example
   * ```typescript
   * inspectOptions: {
   *   depth: 3,         // Show 3 levels of nesting
   *   colors: false,    // Disable value syntax highlighting
   *   compact: true,    // Use compact object display
   * }
   * ```
   *
   * @default `{}` (use built-in defaults: depth=unlimited, colors=auto, compact=true)
   */
  readonly inspectOptions?: {
    /**
     * Maximum depth to traverse when inspecting nested objects.
     * @default Infinity (no depth limit)
     */
    readonly depth?: number;

    /**
     * Whether to use syntax highlighting colors for inspected values.
     * @default Inherited from global `colors` setting
     */
    readonly colors?: boolean;

    /**
     * Whether to use compact formatting for objects and arrays.
     * @default `true` (compact formatting)
     */
    readonly compact?: boolean;
  };

  /**
   * Configuration to always render structured data.
   *
   * If set to `true`, any structured data that is logged will
   * always be rendered. This can be very verbose. Make sure
   * to configure `inspectOptions` properly for your usecase.
   *
   * @default `false`
   * @since 1.1.0
   */
  readonly properties?: boolean;

  /**
   * Enable word wrapping for long messages.
   *
   * When enabled, long messages will be wrapped at the specified width,
   * with continuation lines aligned to the message column position.
   *
   * - `true`: Auto-detect terminal width when attached to a terminal,
   *   fallback to 80 columns when not in a terminal or detection fails
   * - `number`: Use the specified width in columns
   * - `false`: Disable word wrapping
   *
   * @example
   * ```typescript
   * // Auto-detect terminal width (recommended)
   * wordWrap: true
   *
   * // Custom wrap width
   * wordWrap: 120
   *
   * // Disable word wrapping (default)
   * wordWrap: false
   * ```
   *
   * @default `true` (auto-detect terminal width)
   * @since 1.0.0
   */
  readonly wordWrap?: boolean | number;
}

/**
 * Creates a beautiful console formatter optimized for local development.
 *
 * This formatter provides a Signale-inspired visual design with colorful icons,
 * smart category truncation, dimmed styling, and perfect column alignment.
 * It's specifically designed for development environments that support true colors
 * and Unicode characters.
 *
 * The formatter features:
 * - Emoji icons for each log level (🔍 trace, 🐛 debug, ✨ info, etc.)
 * - True color support with rich color schemes
 * - Intelligent category truncation for long hierarchical categories
 * - Optional timestamp display with multiple formats
 * - Configurable alignment and styling options
 * - Enhanced value rendering with syntax highlighting
 *
 * @param options Configuration options for customizing the formatter behavior.
 * @returns A text formatter function that can be used with LogTape sinks.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getConsoleSink } from "@logtape/logtape/sink";
 * import { getPrettyFormatter } from "@logtape/pretty";
 *
 * await configure({
 *   sinks: {
 *     console: getConsoleSink({
 *       formatter: getPrettyFormatter({
 *         timestamp: "time",
 *         categoryWidth: 25,
 *         icons: {
 *           info: "📘",
 *           error: "🔥"
 *         }
 *       })
 *     })
 *   }
 * });
 * ```
 *
 * @since 1.0.0
 */
export function getPrettyFormatter(
  options: PrettyFormatterOptions = {},
): TextFormatter {
  // Extract options with defaults
  const {
    timestamp = "none",
    timestampColor = "rgb(100,116,139)",
    timestampStyle = "dim",
    level: levelFormat = "full",
    levelColors = {},
    levelStyle = "underline",
    icons = true,
    categorySeparator = "·",
    categoryColor = "rgb(100,116,139)",
    categoryColorMap = new Map(),
    categoryStyle = ["dim", "italic"],
    categoryWidth = 20,
    categoryTruncate = "middle",
    messageColor = "rgb(148,163,184)",
    messageStyle = "dim",
    colors: useColors = true,
    align = true,
    inspectOptions = {},
    properties = false,
    wordWrap = true,
  } = options;

  // Resolve icons
  const baseIconMap: Record<LogLevel, string> = icons === false
    ? { trace: "", debug: "", info: "", warning: "", error: "", fatal: "" }
    : icons === true
    ? defaultIcons
    : { ...defaultIcons, ...(icons as Partial<Record<LogLevel, string>>) };

  // Normalize icon spacing for consistent alignment
  const iconMap = normalizeIconSpacing(baseIconMap);

  // Resolve level colors with defaults
  const resolvedLevelColors: Record<LogLevel, Color> = {
    trace: defaultColors.trace,
    debug: defaultColors.debug,
    info: defaultColors.info,
    warning: defaultColors.warning,
    error: defaultColors.error,
    fatal: defaultColors.fatal,
    ...levelColors,
  };

  // Level formatter function with optimized mappings
  const levelMappings: Record<string, Record<LogLevel, string>> = {
    "ABBR": {
      trace: "TRC",
      debug: "DBG",
      info: "INF",
      warning: "WRN",
      error: "ERR",
      fatal: "FTL",
    },
    "L": {
      trace: "T",
      debug: "D",
      info: "I",
      warning: "W",
      error: "E",
      fatal: "F",
    },
    "abbr": {
      trace: "trc",
      debug: "dbg",
      info: "inf",
      warning: "wrn",
      error: "err",
      fatal: "ftl",
    },
    "l": {
      trace: "t",
      debug: "d",
      info: "i",
      warning: "w",
      error: "e",
      fatal: "f",
    },
  };

  const formatLevel = (level: LogLevel): string => {
    if (typeof levelFormat === "function") {
      return levelFormat(level);
    }

    if (levelFormat === "FULL") return level.toUpperCase();
    if (levelFormat === "full") return level;

    return levelMappings[levelFormat]?.[level] ?? level;
  };

  // Timestamp formatters lookup table
  const timestampFormatters: Record<string, (ts: number) => string> = {
    "date-time-timezone": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace("T", " ").replace("Z", " +00:00");
    },
    "date-time-tz": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace("T", " ").replace("Z", " +00");
    },
    "date-time": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace("T", " ").replace("Z", "");
    },
    "time-timezone": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace(/.*T/, "").replace("Z", " +00:00");
    },
    "time-tz": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace(/.*T/, "").replace("Z", " +00");
    },
    "time": (ts) => {
      const iso = new Date(ts).toISOString();
      return iso.replace(/.*T/, "").replace("Z", "");
    },
    "date": (ts) => new Date(ts).toISOString().replace(/T.*/, ""),
    "rfc3339": (ts) => new Date(ts).toISOString(),
  };

  // Resolve timestamp formatter
  let timestampFn: ((ts: number) => string | null) | null = null;
  if (timestamp === "none" || timestamp === "disabled") {
    timestampFn = null;
  } else if (typeof timestamp === "function") {
    timestampFn = timestamp;
  } else {
    timestampFn = timestampFormatters[timestamp as string] ?? null;
  }

  // Configure word wrap settings
  const wordWrapEnabled = wordWrap !== false;
  let wordWrapWidth: number;

  if (typeof wordWrap === "number") {
    wordWrapWidth = wordWrap;
  } else if (wordWrap === true) {
    // Auto-detect terminal width
    wordWrapWidth = getOptimalWordWrapWidth(80);
  } else {
    wordWrapWidth = 80; // Default fallback
  }

  // Prepare category color patterns for matching
  const categoryPatterns = prepareCategoryPatterns(categoryColorMap);

  // Calculate level width based on format
  const allLevels: LogLevel[] = [...getLogLevels()];
  const levelWidth = Math.max(...allLevels.map((l) => formatLevel(l).length));

  return (record: LogRecord): string => {
    // Calculate the prefix parts first to determine message column position
    const icon = iconMap[record.level] || "";
    const level = formatLevel(record.level);
    const categoryStr = truncateCategory(
      record.category,
      categoryWidth,
      categorySeparator,
      categoryTruncate,
    );

    // Format message with values - handle color reset/reapply for interpolated values
    let message = "";
    const messageColorCode = useColors ? colorToAnsi(messageColor) : "";
    const messageStyleCode = useColors ? styleToAnsi(messageStyle) : "";
    const messagePrefix = useColors
      ? `${messageStyleCode}${messageColorCode}`
      : "";

    for (let i = 0; i < record.message.length; i++) {
      if (i % 2 === 0) {
        message += record.message[i];
      } else {
        const value = record.message[i];
        const inspected = inspect(value, {
          colors: useColors,
          ...inspectOptions,
        });

        // Handle multiline interpolated values properly
        if (inspected.includes("\n")) {
          const lines = inspected.split("\n");

          const formattedLines = lines.map((line, index) => {
            if (index === 0) {
              // First line: reset formatting, add the line, then reapply
              if (useColors && (messageColorCode || messageStyleCode)) {
                return `${RESET}${line}${messagePrefix}`;
              } else {
                return line;
              }
            } else {
              // Continuation lines: just apply formatting, let wrapText handle indentation
              if (useColors && (messageColorCode || messageStyleCode)) {
                return `${line}${messagePrefix}`;
              } else {
                return line;
              }
            }
          });
          message += formattedLines.join("\n");
        } else {
          // Single line - handle normally
          if (useColors && (messageColorCode || messageStyleCode)) {
            message += `${RESET}${inspected}${messagePrefix}`;
          } else {
            message += inspected;
          }
        }
      }
    }

    // Parts are already calculated above

    // Determine category color (with prefix matching)
    const finalCategoryColor = useColors
      ? (matchCategoryColor(record.category, categoryPatterns) || categoryColor)
      : null;

    // Apply colors and styling
    const formattedIcon = icon;
    let formattedLevel = level;
    let formattedCategory = categoryStr;
    let formattedMessage = message;
    let formattedTimestamp = "";

    if (useColors) {
      // Apply level color and style
      const levelColorCode = colorToAnsi(resolvedLevelColors[record.level]);
      const levelStyleCode = styleToAnsi(levelStyle);
      formattedLevel = `${levelStyleCode}${levelColorCode}${level}${RESET}`;

      // Apply category color and style (with prefix matching)
      const categoryColorCode = colorToAnsi(finalCategoryColor);
      const categoryStyleCode = styleToAnsi(categoryStyle);
      formattedCategory =
        `${categoryStyleCode}${categoryColorCode}${categoryStr}${RESET}`;

      // Apply message color and style (already handled in message building above)
      formattedMessage = `${messagePrefix}${message}${RESET}`;
    }

    // Format timestamp if needed
    if (timestampFn) {
      const ts = timestampFn(record.timestamp);
      if (ts !== null) {
        if (useColors) {
          const timestampColorCode = colorToAnsi(timestampColor);
          const timestampStyleCode = styleToAnsi(timestampStyle);
          formattedTimestamp =
            `${timestampStyleCode}${timestampColorCode}${ts}${RESET}  `;
        } else {
          formattedTimestamp = `${ts}  `;
        }
      }
    }

    // Build the final output with alignment
    if (align) {
      // Calculate padding accounting for ANSI escape sequences
      const levelColorLength = useColors
        ? (colorToAnsi(resolvedLevelColors[record.level]).length +
          styleToAnsi(levelStyle).length + RESET.length)
        : 0;
      const categoryColorLength = useColors
        ? (colorToAnsi(finalCategoryColor).length +
          styleToAnsi(categoryStyle).length + RESET.length)
        : 0;

      const paddedLevel = formattedLevel.padEnd(levelWidth + levelColorLength);
      const paddedCategory = formattedCategory.padEnd(
        categoryWidth + categoryColorLength,
      );

      let result =
        `${formattedTimestamp}${formattedIcon} ${paddedLevel} ${paddedCategory} ${formattedMessage}`;
      const indentWidth = getDisplayWidth(
        stripAnsi(
          `${formattedTimestamp}${formattedIcon} ${paddedLevel} ${paddedCategory} `,
        ),
      );

      // Apply word wrapping if enabled, or if there are multiline interpolated values
      if (wordWrapEnabled || message.includes("\n")) {
        result = wrapText(
          result,
          wordWrapEnabled ? wordWrapWidth : Infinity,
          indentWidth,
        );
      }

      if (properties) {
        result += formatProperties(
          record,
          indentWidth,
          wordWrapEnabled ? wordWrapWidth : Infinity,
          useColors,
          inspectOptions,
        );
      }

      return result + "\n";
    } else {
      let result =
        `${formattedTimestamp}${formattedIcon} ${formattedLevel} ${formattedCategory} ${formattedMessage}`;
      const indentWidth = getDisplayWidth(
        stripAnsi(
          `${formattedTimestamp}${formattedIcon} ${formattedLevel} ${formattedCategory} `,
        ),
      );

      // Apply word wrapping if enabled, or if there are multiline interpolated values
      if (wordWrapEnabled || message.includes("\n")) {
        result = wrapText(
          result,
          wordWrapEnabled ? wordWrapWidth : Infinity,
          indentWidth,
        );
      }

      if (properties) {
        result += formatProperties(
          record,
          indentWidth,
          wordWrapEnabled ? wordWrapWidth : Infinity,
          useColors,
          inspectOptions,
        );
      }

      return result + "\n";
    }
  };
}

function formatProperties(
  record: LogRecord,
  indentWidth: number,
  maxWidth: number,
  useColors: boolean,
  inspectOptions: InspectOptions,
): string {
  let result = "";
  for (const prop in record.properties) {
    const propValue = record.properties[prop];
    // Ensure padding is never negative
    const pad = Math.max(0, indentWidth - getDisplayWidth(prop) - 2);
    result += "\n" + wrapText(
      `${" ".repeat(pad)}${useColors ? DIM : ""}${prop}:${
        useColors ? RESET : ""
      } ${inspect(propValue, { colors: useColors, ...inspectOptions })}`,
      maxWidth,
      indentWidth,
    );
  }
  return result;
}

/**
 * A pre-configured beautiful console formatter for local development.
 *
 * This is a ready-to-use instance of the pretty formatter with sensible defaults
 * for most development scenarios. It provides immediate visual enhancement to
 * your logs without requiring any configuration.
 *
 * Features enabled by default:
 * - Emoji icons for all log levels
 * - True color support with rich color schemes
 * - Dimmed text styling for better readability
 * - Smart category truncation (20 characters max)
 * - Perfect column alignment
 * - No timestamp display (cleaner for development)
 *
 * For custom configuration, use {@link getPrettyFormatter} instead.
 *
 * @example
 * ```typescript
 * import { configure } from "@logtape/logtape";
 * import { getConsoleSink } from "@logtape/logtape/sink";
 * import { prettyFormatter } from "@logtape/pretty";
 *
 * await configure({
 *   sinks: {
 *     console: getConsoleSink({
 *       formatter: prettyFormatter
 *     })
 *   }
 * });
 * ```
 *
 * @since 1.0.0
 */
export const prettyFormatter: TextFormatter = getPrettyFormatter();
