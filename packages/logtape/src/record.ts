import type { LogLevel } from "./level.ts";

/**
 * A log record.
 */
export interface LogRecord {
  /**
   * The category of the logger that produced the log record.
   */
  readonly category: readonly string[];

  /**
   * The log level.
   */
  readonly level: LogLevel;

  /**
   * The log message.  This is the result of substituting the message template
   * with the values.  The number of elements in this array is always odd,
   * with the message template values interleaved between the substitution
   * values.
   */
  readonly message: readonly unknown[];

  /**
   * The raw log message.  This is the original message template without any
   * further processing.  It can be either:
   *
   * - A string without any substitutions if the log record was created with
   *   a method call syntax, e.g., "Hello, {name}!" for
   *   `logger.info("Hello, {name}!", { name })`.
   * - A template string array if the log record was created with a tagged
   *   template literal syntax, e.g., `["Hello, ", "!"]` for
   *   ``logger.info`Hello, ${name}!```.
   *
   * @since 0.6.0
   */
  readonly rawMessage: string | TemplateStringsArray;

  /**
   * The timestamp of the log record in milliseconds since the Unix epoch.
   */
  readonly timestamp: number;

  /**
   * The extra properties of the log record.
   */
  readonly properties: Record<string, unknown>;

  /**
   * Where in the source code the logging method that made this log record
   * was called.
   *
   * It is present only if source location capture is enabled for the logger
   * (see `LoggerConfig.captureSourceLocation`) and the runtime's stack
   * trace could be parsed; otherwise the property is absent.
   *
   * @since 2.4.0
   */
  readonly sourceLocation?: SourceLocation;
}

/**
 * A location in the source code, as reported by the JavaScript runtime's
 * stack trace.
 *
 * The position is the one of the code that actually runs.  LogTape does not
 * resolve source maps, so bundled or minified code may report positions in
 * the generated code, unless the runtime itself applies source maps to
 * stack traces.
 *
 * @since 2.4.0
 */
export interface SourceLocation {
  /**
   * The file path or URL exactly as the runtime reported it, e.g.,
   * `"file:///app/src/main.ts"`, `"/app/src/main.ts"`, or
   * `"http://localhost:5173/src/main.ts?t=1700000000000"`.
   */
  readonly file: string;

  /**
   * The 1-based line number.
   */
  readonly line: number;

  /**
   * The 1-based column number.  Runtimes differ in which part of the call
   * expression it points to.
   */
  readonly column: number;
}
